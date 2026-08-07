import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ChannelType, ChannelSyncMode, ChannelSyncStatus, OrgRole } from '@prisma/client';
import * as crypto from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { assertWithinPlanLimit } from '../../../common/plan-limits';
import { ChannelsRepository } from './channels.repository';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { CoexistenceChannelDto } from './dto/coexistence-channel.dto';
import {
  InstagramFacebookLoginDto,
  InstagramReconnectDto,
} from './dto/instagram-facebook-login.dto';
import { ChannelAdapterRegistry } from '../channel-adapter.registry';
import { ZappfyHttpClient } from '../adapters/zappfy/zappfy.http-client';
import { WhatsAppOfficialHttpClient } from '../adapters/whatsapp-official/whatsapp-official.http-client';
import { InstagramHttpClient } from '../adapters/instagram/instagram.http-client';
import { TelegramHttpClient } from '../adapters/telegram/telegram.http-client';
import {
  ThreadsHttpClient,
  ThreadsPublishInput,
} from '../adapters/threads/threads.http-client';
import {
  // Payload e assinatura são genéricos (org + criador + nome + validade), então
  // o Login do Instagram reusa o mesmo state em vez de duplicar o HMAC.
  signThreadsState,
  verifyThreadsState,
} from '../adapters/threads/threads-oauth-state.util';
import { InstagramLoginHttpClient } from '../adapters/instagram/instagram-login.http-client';
import { parseMetaSignedRequest } from '../adapters/meta-signed-request';
import { ChannelSyncOrchestrator } from '../sync/channel-sync.orchestrator';
import { syncNotSupportedMessage } from '../sync/sync-messages.util';
import {
  ChannelAccessService,
  type ChannelAccess,
} from '../../iam/channel-access/channel-access.service';

/**
 * Resultado da captura das credenciais de anúncio no login do Instagram.
 * `diagnostic` só vem quando falha — carrega os escopos REAIS do token, pra
 * mensagem na tela dizer o que houve em vez de presumir falta de permissão.
 */
interface AdsCaptureResult {
  adsConnected: boolean;
  adAccountId?: string;
  diagnostic?: { scopes: string[]; temAds: boolean };
}

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    private readonly repository: ChannelsRepository,
    private readonly adapterRegistry: ChannelAdapterRegistry,
    private readonly zappfyHttpClient: ZappfyHttpClient,
    private readonly waOfficialHttpClient: WhatsAppOfficialHttpClient,
    private readonly instagramHttpClient: InstagramHttpClient,
    private readonly telegramHttpClient: TelegramHttpClient,
    private readonly threadsHttpClient: ThreadsHttpClient,
    private readonly instagramLoginHttpClient: InstagramLoginHttpClient,
    private readonly syncOrchestrator: ChannelSyncOrchestrator,
    private readonly prisma: PrismaService,
    private readonly channelAccess: ChannelAccessService,
  ) {}

  async create(
    organizationId: string,
    dto: CreateChannelDto,
    creator?: { userOrganizationId: string; role: OrgRole },
  ) {
    // Enforcement do limite do plano (settings.maxChannels). Canais INTERNAL
    // (assistente pessoal) não contam e não são bloqueados — são internos.
    if (dto.type !== ChannelType.INTERNAL) {
      const channelCount = await this.prisma.channel.count({
        where: {
          organizationId,
          deletedAt: null,
          type: { not: ChannelType.INTERNAL },
        },
      });
      await assertWithinPlanLimit(this.prisma, organizationId, 'maxChannels', channelCount, 'canais');
    }

    let channel = await this.repository.create({
      organizationId,
      type: dto.type,
      name: dto.name,
      config: dto.config,
      webhookSecret: dto.webhookSecret,
      ...(dto.visibility ? { visibility: dto.visibility } : {}),
    });

    // Deny-by-default: a brand new channel has no agents, so AGENT users in the
    // org cannot see it. The creator gets an explicit grant only if they are
    // an AGENT (OWNER/ADMIN bypass via role); admins manage other agents'
    // access via the channel-access endpoints.
    //
    // Pra canal PRIVATE, OWNER/ADMIN também precisa de grant — então se o
    // criador é um deles E o canal é PRIVATE, garantimos o grant pra evitar
    // que o criador se tranque fora do próprio canal recém-criado.
    const needsAgentGrant =
      (creator && creator.role === OrgRole.AGENT) ||
      (creator && dto.visibility === 'PRIVATE');
    if (needsAgentGrant && creator) {
      await this.prisma.channelAgent.create({
        data: {
          channelId: channel.id,
          userOrganizationId: creator.userOrganizationId,
        },
      });
    }

    // Enrich config with provider-side identifiers that the webhook router
    // needs to match incoming events. Without these, the new routing (P0-1)
    // correctly drops webhooks as "unknown locator".
    channel = (await this.enrichProviderIds(channel.id, dto.type)) ?? channel;

    // Zappfy needs its webhook configured on the provider side. Fire-and-forget.
    if (dto.type === ChannelType.WHATSAPP_ZAPPFY) {
      this.configureZappfyWebhook(channel.id).catch((err) =>
        this.logger.warn(`Zappfy webhook config failed: ${err.message}`),
      );
    }

    // WA Official needs the app explicitly subscribed to the WABA before Meta
    // starts delivering webhooks. Fire-and-forget — fails silently when the
    // token lacks `whatsapp_business_management` scope or businessAccountId
    // is missing; the user can retry via PATCH /channels/:id/test.
    if (dto.type === ChannelType.WHATSAPP_OFFICIAL) {
      this.subscribeWaOfficialApp(channel.id).catch((err) =>
        this.logger.warn(
          `WA Official subscribe failed for channel ${channel.id}: ${err.message}`,
        ),
      );
    }

    // Instagram: inscreve o app pra RECEBER webhooks (DMs + comentários) da
    // conta. Sem isso a Meta só entrega o payload de "Teste" manual — mensagem
    // real nunca chega. Fire-and-forget; o usuário pode rerodar pelo botão de
    // diagnóstico se falhar (ex.: token sem escopo de mensagens).
    if (dto.type === ChannelType.INSTAGRAM) {
      this.instagramHttpClient
        .subscribeApp(channel)
        .then(() =>
          this.logger.log(`Instagram app subscribed for channel ${channel.id}`),
        )
        .catch((err) =>
          this.logger.warn(
            `Instagram subscribe failed for channel ${channel.id}: ${err.message}`,
          ),
        );
    }

    if (dto.type === ChannelType.TELEGRAM) {
      this.configureTelegramWebhook(channel.id).catch((err) =>
        this.logger.warn(
          `Telegram webhook config failed for channel ${channel.id}: ${err.message}`,
        ),
      );
    }

    // Canal interno: console de conversa com o orquestrador. Cria o contato
    // sintético + conversa aberta e amarra o orquestrador escolhido como
    // defaultOrchestrator. Sem webhook, sem provider externo.
    if (dto.type === ChannelType.INTERNAL) {
      channel =
        (await this.setupInternalChannel(organizationId, channel.id, dto)) ??
        channel;
    }

    // Unified sync path — any adapter that registered a HistorySyncPort.
    if (this.adapterRegistry.hasHistorySync(dto.type)) {
      this.syncOrchestrator
        .start(channel.id, { mode: ChannelSyncMode.INITIAL })
        .catch((err) =>
          this.logger.error(
            `Auto-sync enqueue failed for channel ${channel.id}: ${err.message}`,
          ),
        );
    }

    return channel;
  }

  /**
   * Canal interno: cria o contato sintético (com quem o operador "conversa"),
   * o ContactChannel, uma conversa já aberta, e amarra o orquestrador
   * escolhido (config.orchestratorId) como defaultOrchestrator do canal —
   * é ele quem responde as mensagens do operador.
   */
  private async setupInternalChannel(
    organizationId: string,
    channelId: string,
    dto: CreateChannelDto,
  ) {
    const config = (dto.config ?? {}) as Record<string, any>;
    const orchestratorId =
      typeof config.orchestratorId === 'string' ? config.orchestratorId : null;

    if (orchestratorId) {
      const orchestrator = await this.prisma.aiAgent.findFirst({
        where: {
          id: orchestratorId,
          organizationId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!orchestrator) {
        throw new BadRequestException(
          'Orquestrador selecionado não encontrado nesta organização.',
        );
      }
    }

    const contactExternalId = `internal-${channelId}`;
    const contact = await this.prisma.contact.create({
      data: {
        organizationId,
        name: dto.name,
        channels: {
          create: {
            channelId,
            externalId: contactExternalId,
            profileName: dto.name,
          },
        },
      },
    });

    await this.prisma.conversation.create({
      data: {
        organizationId,
        channelId,
        contactId: contact.id,
        status: 'OPEN',
      },
    });

    // Amarra o orquestrador como default do canal — driver do roteamento.
    if (orchestratorId) {
      return this.repository.update(channelId, {
        defaultOrchestrator: { connect: { id: orchestratorId } },
      });
    }
    return this.repository.findById(channelId);
  }

  /**
   * Lê a config de Coexistência (app Meta da plataforma) do PlatformSetting,
   * gravada pelo Super Admin. Fonte única para appId/appSecret/configId.
   */
  private async loadMetaCoexistenceConfig(): Promise<{
    appId: string;
    appSecret: string;
    configId: string;
    embeddedConfigId: string;
    instagramAppId: string;
    instagramAppSecret: string;
    instagramConfigId: string;
    threadsAppId: string;
    threadsAppSecret: string;
    instagramLoginAppId: string;
    instagramLoginAppSecret: string;
  }> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: 'meta_coexistence' },
    });
    const value =
      row?.value && typeof row.value === 'object' && !Array.isArray(row.value)
        ? (row.value as Record<string, unknown>)
        : {};
    const configId = typeof value.configId === 'string' ? value.configId : '';
    return {
      appId: typeof value.appId === 'string' ? value.appId : '',
      appSecret: typeof value.appSecret === 'string' ? value.appSecret : '',
      configId,
      // Config do Embedded Signup PADRÃO (criar/selecionar WABA + número). Se o
      // Super Admin não configurou um separado, reusa o de coexistência.
      embeddedConfigId:
        typeof value.embeddedConfigId === 'string' && value.embeddedConfigId
          ? value.embeddedConfigId
          : configId,
      // App do Instagram (Facebook Login). Pode ser um app PRÓPRIO; se ficar
      // vazio, cai no app do WhatsApp (mesmo Meta app com FLB serve pros dois).
      instagramAppId:
        typeof value.instagramAppId === 'string' ? value.instagramAppId : '',
      instagramAppSecret:
        typeof value.instagramAppSecret === 'string' ? value.instagramAppSecret : '',
      // Config de Facebook Login for Business pro Instagram (permissões IG +
      // Páginas). NÃO reusa o de WhatsApp — as permissões são diferentes.
      instagramConfigId:
        typeof value.instagramConfigId === 'string'
          ? value.instagramConfigId
          : '',
      // App do Threads (client_id/secret próprios do Threads API). O Threads usa
      // OAuth próprio (threads.net), separado do Facebook Login.
      threadsAppId:
        typeof value.threadsAppId === 'string' ? value.threadsAppId : '',
      threadsAppSecret:
        typeof value.threadsAppSecret === 'string' ? value.threadsAppSecret : '',
      // App do produto "Instagram" (Login do Instagram). São credenciais
      // DIFERENTES das do Facebook Login for Business acima — vêm da aba
      // Instagram > Configuração básica do app na Meta, e o token resultante
      // fala com graph.instagram.com. Sem fallback pro app do WhatsApp, por
      // serem de outro produto.
      instagramLoginAppId:
        typeof value.instagramLoginAppId === 'string'
          ? value.instagramLoginAppId
          : '',
      instagramLoginAppSecret:
        typeof value.instagramLoginAppSecret === 'string'
          ? value.instagramLoginAppSecret
          : '',
    };
  }

  /**
   * App Secrets ATUAIS da plataforma que podem ter assinado um webhook deste
   * tipo de canal, pra validar o `x-hub-signature-256`.
   *
   * O canal guarda uma cópia do segredo de quando foi conectado. Se o Super
   * Admin troca a chave em Integrações — rotação, ou migração pra outro app
   * Meta — essa cópia fica velha e o canal passa a rejeitar todo webhook, sem
   * nenhum sinal na tela. Foi o que derrubou o recebimento de DMs do Instagram.
   */
  async getPlatformAppSecrets(channelType: ChannelType): Promise<string[]> {
    const cfg = await this.loadMetaCoexistenceConfig();
    const secrets =
      channelType === ChannelType.INSTAGRAM
        ? // O app do Instagram pode ser próprio OU herdado do WhatsApp (o mesmo
          // Meta app com FLB serve pros dois), então o do WhatsApp entra também.
          [cfg.instagramAppSecret, cfg.instagramLoginAppSecret, cfg.appSecret]
        : [cfg.appSecret];
    return secrets.filter((s) => !!s);
  }

  /**
   * Impede que duas contas de canal reivindiquem a MESMA conta do Instagram.
   *
   * O webhook da Meta só traz o id da conta IG — não traz organização. O
   * roteamento então casa pelo `igBusinessId` e fica com o primeiro canal ativo
   * que bater. Com duplicatas, a DM cai num canal arbitrário; e se a duplicata
   * for de OUTRA org, ela passa a receber as mensagens da primeira. Foi o que
   * aconteceu com @axorycapital, reivindicada por 5 canais em 2 orgs.
   */
  private async assertInstagramAccountFree(
    igBusinessId: string,
    organizationId: string,
  ): Promise<void> {
    if (!igBusinessId) return;

    const existente = await this.prisma.channel.findFirst({
      where: {
        type: ChannelType.INSTAGRAM,
        deletedAt: null,
        isActive: true,
        config: { path: ['igBusinessId'], equals: igBusinessId },
      },
      select: { name: true, organizationId: true },
    });
    if (!existente) return;

    if (existente.organizationId !== organizationId) {
      throw new ConflictException(
        'Esta conta do Instagram já está conectada em OUTRA empresa da plataforma. ' +
          'Como o webhook da Meta não diz a qual empresa a mensagem pertence, conectar de novo ' +
          'faria as DMs caírem no canal errado. Desconecte lá antes de conectar aqui.',
      );
    }
    throw new ConflictException(
      `Esta conta do Instagram já está conectada no canal "${existente.name}". ` +
        'Use esse canal em vez de criar outro — dois canais na mesma conta fazem as DMs ' +
        'caírem num deles de forma imprevisível.',
    );
  }

  /** URL de callback do OAuth do Login do Instagram (registrada no app). */
  private instagramLoginRedirectUri(): string {
    const base = (process.env.APP_URL || 'http://localhost:3001').replace(/\/$/, '');
    return `${base}/api/v1/channels/instagram-login/oauth/callback`;
  }

  /** URL de callback do OAuth do Threads (registrada no app do Threads). */
  private threadsRedirectUri(): string {
    const base = (process.env.APP_URL || 'http://localhost:3001').replace(/\/$/, '');
    return `${base}/api/v1/channels/threads/oauth/callback`;
  }

  /**
   * Config pública para a org montar os popups da Meta (Embedded Signup do
   * WhatsApp e Facebook Login do Instagram). NÃO inclui o appSecret.
   */
  async getCoexistenceConfig() {
    const {
      appId,
      appSecret,
      configId,
      embeddedConfigId,
      instagramAppId,
      instagramAppSecret,
      instagramConfigId,
      threadsAppId,
      threadsAppSecret,
      instagramLoginAppId,
      instagramLoginAppSecret,
    } = await this.loadMetaCoexistenceConfig();
    // App do Instagram: usa o app PRÓPRIO só se App ID **e** Secret vierem juntos;
    // senão, herda o app inteiro do WhatsApp. ATÔMICO de propósito — misturar
    // App ID de um app com Secret de outro faz a Meta rejeitar a troca do código.
    const { igAppId, igAppSecret } = this.resolveInstagramApp(
      appId,
      appSecret,
      instagramAppId,
      instagramAppSecret,
    );
    return {
      appId,
      configId,
      embeddedConfigId,
      // appId a usar no FB.init do Instagram (dedicado ou herdado do WhatsApp).
      instagramAppId: igAppId,
      instagramConfigId,
      enabled: !!(appId && appSecret && configId),
      // Instagram precisa do app (próprio ou herdado) + secret + a config de FLB.
      instagramEnabled: !!(igAppId && igAppSecret && instagramConfigId),
      // Threads usa app próprio (OAuth threads.net).
      threadsEnabled: !!(threadsAppId && threadsAppSecret),
      // Login do Instagram: OAuth direto no instagram.com, sem Página do
      // Facebook. Exige o par do produto "Instagram" no app da Meta.
      instagramLoginEnabled: !!(instagramLoginAppId && instagramLoginAppSecret),
    };
  }

  /**
   * Resolve o par (App ID, App Secret) do Instagram de forma ATÔMICA: só usa o
   * app próprio do IG quando os DOIS campos estão preenchidos; caso contrário,
   * herda o app inteiro do WhatsApp. Evita o par cruzado (ID de um app + Secret
   * de outro), que gera erro de OAuth na Meta.
   */
  private resolveInstagramApp(
    waAppId: string,
    waAppSecret: string,
    igAppIdRaw: string,
    igAppSecretRaw: string,
  ): { igAppId: string; igAppSecret: string } {
    const useOwn = !!(igAppIdRaw && igAppSecretRaw);
    return {
      igAppId: useOwn ? igAppIdRaw : waAppId,
      igAppSecret: useOwn ? igAppSecretRaw : waAppSecret,
    };
  }

  /**
   * Monta a URL de autorização do Threads com um `state` assinado que carrega a
   * org + o criador (o callback é público, sem sessão). O front redireciona o
   * navegador pra essa URL.
   */
  async getThreadsAuthUrl(
    organizationId: string,
    creator: { userOrganizationId: string; role: OrgRole },
    name: string,
    visibility?: 'ORG' | 'PRIVATE',
  ): Promise<{ url: string; redirectUri: string; threadsAppId: string }> {
    const { threadsAppId, threadsAppSecret } =
      await this.loadMetaCoexistenceConfig();
    if (!threadsAppId || !threadsAppSecret) {
      throw new BadRequestException(
        'App do Threads não configurado. Peça ao Super Admin para preencher Threads App ID e App Secret em Integrações.',
      );
    }
    if (!name || !name.trim()) {
      throw new BadRequestException('Informe um nome para o canal.');
    }
    const state = signThreadsState({
      o: organizationId,
      u: creator.userOrganizationId,
      r: creator.role,
      n: name.trim(),
      v: visibility,
      exp: Date.now() + 10 * 60 * 1000, // 10 min
    });
    const redirectUri = this.threadsRedirectUri();
    const url = this.threadsHttpClient.buildAuthorizeUrl(
      threadsAppId,
      redirectUri,
      state,
    );
    // Devolve o redirect_uri junto porque ele é montado a partir do APP_URL do
    // servidor e precisa bater, caractere por caractere, com o que está
    // liberado no painel do Threads. Quando não bate, a Meta responde só
    // "URL bloqueada" — sem dizer qual URL ela recebeu. Com este campo a tela
    // mostra o valor exato pra conferir, em vez de adivinhar qual é o APP_URL
    // de produção.
    this.logger.log(`Threads OAuth: redirect_uri=${redirectUri} client_id=${threadsAppId}`);
    return { url, redirectUri, threadsAppId };
  }

  /**
   * Monta a URL de autorização do **Login do Instagram** — o fluxo em que o
   * dono entra com a conta do próprio Instagram, sem Página do Facebook.
   *
   * O `state` assinado carrega org + criador porque o callback é público (é um
   * redirect do navegador, sem Bearer). Mesmo esquema já usado no Threads.
   */
  async getInstagramLoginAuthUrl(
    organizationId: string,
    creator: { userOrganizationId: string; role: OrgRole },
    name: string,
    visibility?: 'ORG' | 'PRIVATE',
  ): Promise<{ url: string }> {
    const { instagramLoginAppId, instagramLoginAppSecret } =
      await this.loadMetaCoexistenceConfig();
    if (!instagramLoginAppId || !instagramLoginAppSecret) {
      throw new BadRequestException(
        'Login do Instagram não configurado. Peça ao Super Admin para preencher Instagram Login App ID e App Secret em Integrações.',
      );
    }
    if (!name || !name.trim()) {
      throw new BadRequestException('Informe um nome para o canal.');
    }

    const state = signThreadsState({
      o: organizationId,
      u: creator.userOrganizationId,
      r: creator.role,
      n: name.trim(),
      v: visibility,
      exp: Date.now() + 10 * 60 * 1000, // 10 min
    });

    const url = this.instagramLoginHttpClient.buildAuthorizeUrl(
      instagramLoginAppId,
      this.instagramLoginRedirectUri(),
      state,
    );
    return { url };
  }

  /**
   * Callback do Login do Instagram: valida o `state`, troca o code por token
   * curto→longo, puxa o perfil e cria o canal.
   *
   * O canal nasce com `graphApi: 'instagram'` — é isso que faz o adapter falar
   * com graph.instagram.com e usar `/me`. Sem essa marca ele tentaria o
   * graph.facebook.com com um token que não serve lá, e o envio falharia.
   */
  async createFromInstagramLoginCallback(code: string, state: string) {
    if (!code) throw new BadRequestException('Código de autorização ausente.');
    const parsed = verifyThreadsState(state);
    if (!parsed) {
      throw new BadRequestException('State inválido ou expirado. Refaça a conexão.');
    }
    const { instagramLoginAppId, instagramLoginAppSecret } =
      await this.loadMetaCoexistenceConfig();
    if (!instagramLoginAppId || !instagramLoginAppSecret) {
      throw new BadRequestException('Login do Instagram não configurado.');
    }

    const short = await this.instagramLoginHttpClient.exchangeCodeForShortToken(
      code,
      this.instagramLoginRedirectUri(),
      instagramLoginAppId,
      instagramLoginAppSecret,
    );
    const long = await this.instagramLoginHttpClient.exchangeForLongLivedToken(
      short.accessToken,
      instagramLoginAppSecret,
    );

    // Perfil é best-effort: se falhar, o canal ainda funciona — só fica sem o
    // @username no nome.
    let username: string | undefined;
    let igUserId = short.userId;
    try {
      const me = await this.instagramLoginHttpClient.getMe(long.accessToken);
      username = me.username;
      if (me.userId) igUserId = me.userId;
    } catch (err: any) {
      this.logger.warn(
        `Instagram Login: perfil não carregado (${err?.message ?? err}) — canal criado assim mesmo.`,
      );
    }

    await this.assertInstagramAccountFree(igUserId, parsed.o);

    return this.create(
      parsed.o,
      {
        type: ChannelType.INSTAGRAM,
        name: username ? `${parsed.n} (@${username})` : parsed.n,
        config: {
          accessToken: long.accessToken,
          igBusinessId: igUserId,
          graphApi: 'instagram',
          apiVersion: 'v21.0',
          appSecret: instagramLoginAppSecret,
          tokenExpiresAt: new Date(Date.now() + long.expiresIn * 1000).toISOString(),
          ...(username ? { username } : {}),
        },
        ...(parsed.v ? { visibility: parsed.v } : {}),
      },
      { userOrganizationId: parsed.u, role: parsed.r as OrgRole },
    );
  }

  /**
   * Callback do OAuth do Threads: valida o `state`, troca o code por token
   * curto→longo, puxa o perfil e cria o canal. Chamado pelo controller público.
   */
  async createFromThreadsCallback(code: string, state: string) {
    if (!code) throw new BadRequestException('Código de autorização ausente.');
    const parsed = verifyThreadsState(state);
    if (!parsed) {
      throw new BadRequestException('State inválido ou expirado. Refaça a conexão.');
    }
    const { threadsAppId, threadsAppSecret } =
      await this.loadMetaCoexistenceConfig();
    if (!threadsAppId || !threadsAppSecret) {
      throw new BadRequestException('App do Threads não configurado.');
    }

    // 1) code → token curto (+ user_id) → token longo (60 dias).
    const short = await this.threadsHttpClient.exchangeCodeForShortToken(
      code,
      this.threadsRedirectUri(),
      threadsAppId,
      threadsAppSecret,
    );
    const long = await this.threadsHttpClient.exchangeForLongLivedToken(
      short.accessToken,
      threadsAppSecret,
    );

    // 2) Perfil (username) pra deixar o canal legível.
    let username: string | undefined;
    try {
      const me = await this.threadsHttpClient.getMe(long.accessToken);
      username = me.username;
    } catch {
      /* best-effort */
    }

    // 3) Cria o canal. Threads não tem inbound — só guarda credencial + user.
    return this.create(parsed.o, {
      type: ChannelType.THREADS,
      name: parsed.n,
      config: {
        accessToken: long.accessToken,
        threadsUserId: short.userId,
        apiVersion: 'v1.0',
        tokenExpiresAt: new Date(Date.now() + long.expiresIn * 1000).toISOString(),
        ...(username ? { username } : {}),
      },
      ...(parsed.v ? { visibility: parsed.v } : {}),
    }, { userOrganizationId: parsed.u, role: parsed.r as OrgRole });
  }

  /** Publica um post no Threads (texto/imagem/vídeo/carrossel). */
  async threadsPublish(
    channelId: string,
    organizationId: string,
    input: ThreadsPublishInput,
  ) {
    const channel = await this.assertThreads(channelId, organizationId);
    return this.threadsHttpClient.publish(channel, input);
  }

  /**
   * O que o token deste canal REALMENTE consegue fazer.
   *
   * Permissão marcada como ativa no caso de uso não significa nada se o token
   * não a carrega: o token guarda os escopos concedidos no login, e a
   * configuração do Facebook Login é um retrato do que existia quando foi
   * criada. Foi assim que a exclusão de post morreu com "(#10) Insufficient
   * permissions" mesmo com a permissão aparecendo ativa no painel.
   *
   * Aqui a fonte é o `debug_token`: o que ele lista é o que o token tem.
   */
  async instagramTokenScopes(channelId: string, organizationId: string) {
    const canal = await this.findOne(channelId, organizationId);
    if (canal.type !== ChannelType.INSTAGRAM) {
      throw new BadRequestException('Canal não é do tipo Instagram.');
    }
    const config = (canal.config ?? {}) as Record<string, any>;
    const token = String(
      config.userAccessToken || config.accessToken || config.pageAccessToken || '',
    ).trim();
    if (!token) {
      throw new BadRequestException('Canal sem token — reconecte.');
    }

    const cfgMeta = await this.loadMetaCoexistenceConfig();
    const appId = config.appId || cfgMeta.instagramAppId || cfgMeta.appId;
    const appSecret =
      config.appSecret || cfgMeta.instagramAppSecret || cfgMeta.appSecret;
    if (!appId || !appSecret) {
      throw new BadRequestException(
        'App da Meta não configurado em Integrações — sem isso não dá pra inspecionar o token.',
      );
    }

    const { scopes } = await this.instagramHttpClient.inspectTokenGranularScopes(
      token,
      String(appId),
      String(appSecret),
      config.apiVersion || 'v25.0',
    );

    // O que cada função do AxChat precisa. A tela usa isto pra dizer o que
    // para de funcionar, em vez de despejar uma lista de escopos crus.
    const necessarias: Array<{ escopo: string; para: string }> = [
      { escopo: 'instagram_basic', para: 'Ver a conta e listar posts' },
      { escopo: 'instagram_manage_messages', para: 'Receber e responder DMs' },
      { escopo: 'instagram_manage_comments', para: 'Responder e moderar comentários' },
      { escopo: 'instagram_manage_insights', para: 'Métricas dos posts' },
      { escopo: 'instagram_content_publish', para: 'Publicar posts' },
      { escopo: 'instagram_manage_contents', para: 'Excluir posts' },
      { escopo: 'pages_show_list', para: 'Listar as Páginas na conexão' },
      { escopo: 'pages_read_engagement', para: 'Ler dados da Página' },
      { escopo: 'pages_manage_metadata', para: 'Assinar o webhook' },
      { escopo: 'pages_messaging', para: 'Enviar DM pela Página' },
      { escopo: 'ads_management', para: 'Pausar/ativar campanhas' },
      { escopo: 'ads_read', para: 'Ler métricas de anúncios' },
    ];

    return {
      scopes,
      permissoes: necessarias.map((n) => ({
        ...n,
        concedida: scopes.includes(n.escopo),
      })),
      faltando: necessarias
        .filter((n) => !scopes.includes(n.escopo))
        .map((n) => n.escopo),
    };
  }

  /**
   * Callback de DESAUTORIZAÇÃO da Meta. Chega quando a pessoa remove o AxChat
   * nas configurações do Threads/Instagram — a Meta invalida o token na hora.
   *
   * Sem isso o canal continuava "ativo" na tela e só falhava na próxima
   * chamada, com erro de token que ninguém sabia interpretar. Aqui ele é
   * desligado com o motivo à vista.
   *
   * É rota pública (redirect/POST da Meta, sem Bearer): a confiança vem do
   * `signed_request` assinado com o App Secret.
   */
  async handleDeauthorize(
    provider: 'threads' | 'instagram',
    signedRequest: string | undefined,
  ): Promise<{ ok: boolean }> {
    const cfg = await this.loadMetaCoexistenceConfig();
    const secrets =
      provider === 'threads'
        ? [cfg.threadsAppSecret]
        : [cfg.instagramLoginAppSecret, cfg.instagramAppSecret, cfg.appSecret];

    const payload = parseMetaSignedRequest(signedRequest, secrets);
    if (!payload?.user_id) {
      this.logger.warn(
        `Deauthorize (${provider}) recusado: signed_request ausente ou com assinatura inválida.`,
      );
      // 200 mesmo assim: a Meta reenfileira em caso de erro, e não queremos
      // ficar recebendo retry de uma chamada que nunca vai validar.
      return { ok: false };
    }

    const userId = String(payload.user_id);
    const tipo =
      provider === 'threads' ? ChannelType.THREADS : ChannelType.INSTAGRAM;
    const candidatos = await this.prisma.channel.findMany({
      where: { type: tipo, deletedAt: null, isActive: true },
    });

    const canal = candidatos.find((c) => {
      const conf = (c.config ?? {}) as Record<string, any>;
      const ids = [
        conf.threadsUserId,
        conf.igUserId,
        conf.igBusinessId,
        conf.fbPageId,
      ]
        .filter(Boolean)
        .map(String);
      return ids.includes(userId);
    });

    if (!canal) {
      this.logger.warn(
        `Deauthorize (${provider}): nenhum canal ativo com user_id ${userId}.`,
      );
      return { ok: false };
    }

    await this.prisma.channel.update({
      where: { id: canal.id },
      data: {
        isActive: false,
        config: {
          ...((canal.config ?? {}) as Record<string, any>),
          disconnectedAt: new Date().toISOString(),
          disconnectedReason:
            'O acesso foi removido nas configurações da conta. Reconecte o canal para voltar a operar.',
        },
      },
    });

    this.logger.log(
      `Canal ${canal.id} (${provider}) desativado: acesso revogado pelo dono da conta.`,
    );
    return { ok: true };
  }

  /** Posts já publicados na conta do Threads. */
  async threadsPosts(channelId: string, organizationId: string) {
    const channel = await this.assertThreads(channelId, organizationId);
    const posts = await this.threadsHttpClient.listPosts(channel);
    return { posts };
  }

  /** Lista as respostas de um post do Threads. */
  async threadsReplies(channelId: string, organizationId: string, mediaId: string) {
    const channel = await this.assertThreads(channelId, organizationId);
    const replies = await this.threadsHttpClient.listReplies(channel, mediaId);
    return { replies };
  }

  /** Responde um post/resposta no Threads. */
  async threadsReply(
    channelId: string,
    organizationId: string,
    replyToId: string,
    text: string,
  ) {
    const channel = await this.assertThreads(channelId, organizationId);
    return this.threadsHttpClient.reply(channel, replyToId, text);
  }

  /** Oculta/reexibe uma resposta (moderação). */
  async threadsHideReply(
    channelId: string,
    organizationId: string,
    replyId: string,
    hide: boolean,
  ) {
    const channel = await this.assertThreads(channelId, organizationId);
    return this.threadsHttpClient.hideReply(channel, replyId, hide);
  }

  /** Insights de um post (mediaId) ou do perfil (sem mediaId). */
  async threadsInsights(
    channelId: string,
    organizationId: string,
    mediaId?: string,
  ) {
    const channel = await this.assertThreads(channelId, organizationId);
    const data = mediaId
      ? await this.threadsHttpClient.getMediaInsights(channel, mediaId)
      : await this.threadsHttpClient.getUserInsights(channel);
    return { insights: data };
  }

  /**
   * Responde publicamente um comentário do Instagram. O `commentId` vem do
   * webhook e fica guardado em `Message.metadata.comment.commentId` — a UI do
   * inbox passa esse id de volta pra cá.
   */
  async instagramReplyToComment(
    channelId: string,
    organizationId: string,
    commentId: string,
    message: string,
  ) {
    const channel = await this.findOne(channelId, organizationId);
    if (channel.type !== ChannelType.INSTAGRAM) {
      throw new BadRequestException('Canal não é do tipo Instagram.');
    }
    return this.instagramHttpClient.replyToComment(channel, commentId, message);
  }

  private async assertThreads(channelId: string, organizationId: string) {
    const channel = await this.findOne(channelId, organizationId);
    if (channel.type !== ChannelType.THREADS) {
      throw new BadRequestException('Canal não é do tipo Threads.');
    }
    return channel;
  }

  /**
   * Coexistência: o número continua funcionando no app WhatsApp Business e
   * em paralelo é conectado à Cloud API. O dono escaneia o QR exibido pelo
   * popup Embedded Signup da Meta; o popup devolve `code` + `phone_number_id`
   * + `waba_id`. Aqui trocamos o code por um access token e criamos o canal
   * reusando o fluxo padrão (`create`), que já assina o app no webhook.
   *
   * O `appSecret` para validar a assinatura HMAC dos webhooks é o secret do
   * NOSSO app (configurado pelo Super Admin) — em coexistência não há um app
   * por cliente.
   */
  async createFromCoexistence(
    organizationId: string,
    dto: CoexistenceChannelDto,
    creator?: { userOrganizationId: string; role: OrgRole },
  ) {
    const { appId, appSecret } = await this.loadMetaCoexistenceConfig();
    if (!appId || !appSecret) {
      throw new BadRequestException(
        'App Meta de Coexistência não configurado. Peça ao Super Admin para preencher App ID e App Secret em Integrações.',
      );
    }

    try {
      const accessToken = await this.waOfficialHttpClient.exchangeCodeForToken(
        dto.code,
        appId,
        appSecret,
      );

      return await this.create(
        organizationId,
        {
          type: ChannelType.WHATSAPP_OFFICIAL,
          name: dto.name,
          config: {
            accessToken,
            phoneNumberId: dto.phoneNumberId,
            businessAccountId: dto.businessAccountId,
            appSecret,
            apiVersion: 'v25.0',
            coexistence: true,
          },
          ...(dto.visibility ? { visibility: dto.visibility } : {}),
        },
        creator,
      );
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      // Erro cru (ex.: App Secret inválido na troca do code) vira 400 com a
      // mensagem REAL da Meta — sem isso vira "Internal server error" (500).
      const msg = err?.message ?? String(err);
      this.logger.error(`Coexistência falhou (org ${organizationId}): ${msg}`);
      throw new BadRequestException(`Coexistência: ${msg}`);
    }
  }

  /**
   * Embedded Signup PADRÃO do WhatsApp Official (mesmo popup da coexistência,
   * mas o dono cria/seleciona a WABA + número na janela da Meta em vez de ler
   * QR). O popup devolve `code` + phone_number_id + waba_id; aqui trocamos o
   * code por token, PUXAMOS os dados do número no Facebook (telefone + nome
   * verificado) e criamos o canal já com as credenciais preenchidas.
   */
  async createFromEmbeddedSignup(
    organizationId: string,
    dto: CoexistenceChannelDto,
    creator?: { userOrganizationId: string; role: OrgRole },
  ) {
    const { appId, appSecret } = await this.loadMetaCoexistenceConfig();
    if (!appId || !appSecret) {
      throw new BadRequestException(
        'App Meta não configurado. Peça ao Super Admin para preencher App ID e App Secret em Integrações.',
      );
    }

    try {
      return await this.doEmbeddedSignup(organizationId, dto, appId, appSecret, creator);
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      const msg = err?.message ?? String(err);
      this.logger.error(`Embedded Signup falhou (org ${organizationId}): ${msg}`);
      throw new BadRequestException(`Embedded Signup: ${msg}`);
    }
  }

  /** Corpo do Embedded Signup — separado pra o try/catch acima capturar tudo. */
  private async doEmbeddedSignup(
    organizationId: string,
    dto: CoexistenceChannelDto,
    appId: string,
    appSecret: string,
    creator?: { userOrganizationId: string; role: OrgRole },
  ) {
    // 1) code → access token.
    const accessToken = await this.waOfficialHttpClient.exchangeCodeForToken(
      dto.code,
      appId,
      appSecret,
    );

    // Dados do número (telefone + nome verificado) pra popular as credenciais.
    const info = await this.waOfficialHttpClient.fetchPhoneNumberInfo(
      accessToken,
      dto.phoneNumberId,
    );

    // PIN de verificação em duas etapas: reusa o de um canal anterior deste
    // mesmo número (reconexão) ou gera um novo de 6 dígitos. crypto.randomInt
    // pra não ser previsível.
    const existing = await this.prisma.channel.findFirst({
      where: {
        organizationId,
        type: ChannelType.WHATSAPP_OFFICIAL,
        deletedAt: null,
        config: { path: ['phoneNumberId'], equals: dto.phoneNumberId },
      },
      select: { config: true },
    });
    const existingPin = (existing?.config as Record<string, any> | null)?.pin;
    const pin =
      typeof existingPin === 'string' && /^\d{6}$/.test(existingPin)
        ? existingPin
        : String(crypto.randomInt(100000, 1000000));

    // 2) Registra o número na Cloud API (obrigatório pós Embedded Signup).
    //    "Já registrado" não quebra o fluxo (reconexão).
    const reg = await this.waOfficialHttpClient.registerPhoneNumber(
      accessToken,
      dto.phoneNumberId,
      pin,
    );
    if (!reg.registered && !reg.alreadyRegistered) {
      this.logger.warn(
        `Embedded Signup: register do número ${dto.phoneNumberId} não confirmou (${reg.error ?? 'erro'}). Canal criado mesmo assim; pode ser necessário registrar manualmente.`,
      );
    }

    // 3) Cria o canal (o create() dispara o subscribed_apps da WABA — passo 2
    //    do webhook) e persiste token, waba_id, phone_number_id e pin.
    return this.create(
      organizationId,
      {
        type: ChannelType.WHATSAPP_OFFICIAL,
        name: dto.name,
        config: {
          accessToken,
          phoneNumberId: dto.phoneNumberId,
          businessAccountId: dto.businessAccountId,
          appSecret,
          apiVersion: 'v25.0',
          pin,
          ...(info.displayPhoneNumber
            ? { displayPhoneNumber: info.displayPhoneNumber }
            : {}),
          ...(info.verifiedName ? { verifiedName: info.verifiedName } : {}),
        },
        ...(dto.visibility ? { visibility: dto.visibility } : {}),
      },
      creator,
    );
  }

  /**
   * Instagram via Facebook Login for Business. O popup da Meta devolve só um
   * `code`; aqui trocamos por um token de usuário (business-scoped), listamos
   * as Páginas concedidas com a conta profissional do Instagram vinculada e
   * criamos o canal já com o Page access token + IG business id — sem o dono
   * digitar token nenhum. O `create()` cuida de inscrever o app nos webhooks
   * da Página (DMs). Os comentários continuam assinados no nível do app, no
   * painel de Webhooks da Meta.
   */
  /**
   * DEBUG: troca o code por token e devolve TUDO que a Meta retorna (dados
   * brutos) pra inspeção — sem criar canal. Usado pra diagnosticar por que a
   * conta IG não é encontrada. Só OWNER/ADMIN.
   */
  async debugInstagramFacebookLogin(organizationId: string, code: string) {
    const { appId, appSecret, instagramAppId, instagramAppSecret } =
      await this.loadMetaCoexistenceConfig();
    const { igAppId, igAppSecret } = this.resolveInstagramApp(
      appId,
      appSecret,
      instagramAppId,
      instagramAppSecret,
    );
    if (!igAppId || !igAppSecret) {
      throw new BadRequestException('App do Instagram não configurado.');
    }
    const userToken = await this.instagramHttpClient.exchangeCodeForToken(
      code,
      igAppId,
      igAppSecret,
    );
    return this.instagramHttpClient.collectOnboardingDebug(
      userToken,
      igAppId,
      igAppSecret,
    );
  }

  /**
   * Refaz o login da Meta pra um canal que JÁ existe e grava as credenciais
   * novas por cima. É o conserto pra token expirado ou trocado: sem isso, o
   * único caminho era criar outro canal — que a trava de duplicidade agora
   * recusa, e que deixaria as conversas antigas para trás.
   */
  async reconnectInstagramFromFacebookLogin(
    organizationId: string,
    channelId: string,
    dto: InstagramReconnectDto,
  ) {
    const atual = await this.findOne(channelId, organizationId);
    if (atual.type !== ChannelType.INSTAGRAM) {
      throw new BadRequestException('Este canal não é do Instagram.');
    }
    // Nome e visibilidade já são do canal — só o `code` vem do popup.
    return this.createFromInstagramFacebookLogin(
      organizationId,
      { ...dto, name: atual.name },
      undefined,
      atual,
    );
  }

  async createFromInstagramFacebookLogin(
    organizationId: string,
    dto: InstagramFacebookLoginDto,
    creator?: { userOrganizationId: string; role: OrgRole },
    /** Quando presente, ATUALIZA este canal em vez de criar um novo. */
    reconectando?: { id: string; config: any },
  ) {
    const {
      appId,
      appSecret,
      instagramAppId,
      instagramAppSecret,
      instagramConfigId,
    } = await this.loadMetaCoexistenceConfig();
    // App do Instagram: atômico (próprio só com ID+Secret juntos; senão WhatsApp).
    const { igAppId, igAppSecret } = this.resolveInstagramApp(
      appId,
      appSecret,
      instagramAppId,
      instagramAppSecret,
    );
    if (!igAppId || !igAppSecret) {
      throw new BadRequestException(
        'App do Instagram não configurado. Peça ao Super Admin para preencher o App ID e App Secret do Instagram (ou do WhatsApp) em Integrações.',
      );
    }
    if (!instagramConfigId) {
      throw new BadRequestException(
        'Config do Instagram (Facebook Login) não definida. Peça ao Super Admin para preencher o Instagram Config ID em Integrações.',
      );
    }

    // 1) code → token de usuário (business-scoped). 2) Páginas + conta IG.
    // Erros da Meta viram BadRequest (400) com a mensagem REAL — sem isso o
    // erro cru vira um "Internal server error" (500) que não diz nada.
    let userToken: string;
    let pages: Awaited<
      ReturnType<InstagramHttpClient['listManagedPagesWithInstagram']>
    >;
    try {
      userToken = await this.instagramHttpClient.exchangeCodeForToken(
        dto.code,
        igAppId,
        igAppSecret,
      );
      pages = await this.instagramHttpClient.listManagedPagesWithInstagram(userToken);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      this.logger.warn(`Instagram FLB onboarding falhou (org ${organizationId}): ${msg}`);
      throw new BadRequestException(`Conexão com o Instagram falhou — ${msg}`);
    }
    // Passo extra: pra cada Página SEM vínculo IG detectado com o token de
    // usuário, tenta de novo com o PAGE token — às vezes o vínculo só volta assim.
    for (const p of pages) {
      if (!p.igBusinessId && p.pageAccessToken) {
        const viaPage = await this.instagramHttpClient.getPageInstagram(
          p.pageId,
          p.pageAccessToken,
        );
        if (viaPage.igBusinessId) {
          p.igBusinessId = viaPage.igBusinessId;
          p.igUsername = viaPage.igUsername;
        }
      }
    }

    const withIg = pages.filter((p) => p.igBusinessId);

    // Config do canal a criar — resolvida por um dos dois caminhos abaixo.
    let igConfig: {
      accessToken: string;
      igBusinessId: string;
      igUsername?: string;
      fbPageId?: string;
      fbPageName?: string;
      pageAccessToken?: string;
    } | null = null;

    if (withIg.length > 0) {
      // Caminho A (ideal): a conta IG está vinculada a uma Página concedida.
      // Usa o Page access token (melhor pra messaging via Messenger Platform).
      const chosen = withIg[0];
      if (withIg.length > 1) {
        this.logger.warn(
          `Instagram FLB: ${withIg.length} páginas com Instagram; usando "${chosen.pageName ?? chosen.pageId}" (@${chosen.igUsername ?? '?'}).`,
        );
      }
      igConfig = {
        accessToken: chosen.pageAccessToken,
        pageAccessToken: chosen.pageAccessToken,
        igBusinessId: chosen.igBusinessId!,
        fbPageId: chosen.pageId,
        igUsername: chosen.igUsername,
        fbPageName: chosen.pageName ?? undefined,
      };
    } else {
      // Caminho B (fallback): a conta IG está num Business Portfolio (própria ou
      // compartilhada como client), sem Página vinculada visível. Descobre via
      // /me/businesses e usa o token de usuário como accessToken do canal.
      let igAccounts: Awaited<
        ReturnType<InstagramHttpClient['discoverInstagramViaBusinesses']>
      > = [];
      try {
        igAccounts = await this.instagramHttpClient.discoverInstagramViaBusinesses(userToken);
      } catch (err: any) {
        this.logger.warn(`Instagram: descoberta via businesses falhou: ${err?.message ?? err}`);
      }

      if (igAccounts.length > 0) {
        const acc = igAccounts[0];
        // Se houver uma Página concedida (mesmo sem vínculo IG detectado), guarda
        // pra inscrição de webhook; senão o token de usuário cobre os endpoints.
        const anyPage = pages[0];
        this.logger.log(
          `Instagram FLB: conta @${acc.igUsername ?? acc.igBusinessId} descoberta via portfólio "${acc.businessName ?? '?'}".`,
        );
        igConfig = {
          accessToken: anyPage?.pageAccessToken || userToken,
          pageAccessToken: anyPage?.pageAccessToken,
          igBusinessId: acc.igBusinessId,
          igUsername: acc.igUsername,
          fbPageId: anyPage?.pageId,
          fbPageName: anyPage?.pageName ?? undefined,
        };
      }

      // Caminho C (definitivo p/ FLB): inspeciona o token. Os target_ids dos
      // escopos de Instagram SÃO os IDs das contas IG concedidas — independe de
      // /me/accounts e de vínculo com Página/portfólio.
      if (!igConfig) {
        const { igTargetIds } = await this.instagramHttpClient.inspectTokenGranularScopes(
          userToken,
          igAppId,
          igAppSecret,
        );
        if (igTargetIds.length > 0) {
          const igId = igTargetIds[0];
          const username = await this.instagramHttpClient.getIgUsername(igId, userToken);
          const anyPage = pages[0];
          this.logger.log(
            `Instagram FLB: conta ${igId} (@${username ?? '?'}) descoberta via debug_token granular_scopes.`,
          );
          igConfig = {
            accessToken: anyPage?.pageAccessToken || userToken,
            pageAccessToken: anyPage?.pageAccessToken,
            igBusinessId: igId,
            igUsername: username,
            fbPageId: anyPage?.pageId,
            fbPageName: anyPage?.pageName ?? undefined,
          };
        }
      }
    }

    if (!igConfig) {
      // Diagnóstico via debug_token (fonte confiável no FLB — /me/permissions
      // não reflete os escopos granulares do system user).
      const { scopes } = await this.instagramHttpClient.inspectTokenGranularScopes(
        userToken,
        igAppId,
        igAppSecret,
      );
      const temIgScope = scopes.some((s) => /^instagram_/.test(s));
      const nomes = pages.length
        ? pages.map((p) => p.pageName ?? p.pageId).join(', ')
        : '(nenhuma)';
      this.logger.warn(
        `Instagram FLB: nenhuma conta IG. Páginas=[${nomes}] scopes=[${scopes.join(',')}]`,
      );

      if (!temIgScope) {
        throw new BadRequestException(
          `O login foi autorizado, mas a Meta NÃO concedeu nenhum escopo de Instagram. Escopos recebidos: [${scopes.join(', ') || 'nenhum'}]. A Configuração do Facebook Login (config_id "${instagramConfigId}") precisa incluir as permissões instagram_basic, instagram_manage_messages e instagram_manage_comments, e o ativo "Contas do Instagram". Peça ao Super Admin para editar essa Configuration no painel da Meta (Facebook Login for Business → Configurations) e refaça a conexão. (Adicionar a permissão só no App Review não basta — tem que estar NA Configuration.)`,
        );
      }
      throw new BadRequestException(
        `Concedido: [${nomes}]. O acesso ao Instagram está no token, mas a Meta não retornou o ID da conta. Confirme em Meta Business Suite → Configurações → Contas do Instagram que a conta é Profissional (Business/Creator) e está vinculada ao Portfólio selecionado, e refaça a conexão.`,
      );
    }

    // 3) Reconexão: grava as credenciais novas no canal existente. Só depois de
    //    conferir que o login trouxe a MESMA conta — trocar o igBusinessId por
    //    baixo repontaria o canal (e o histórico de conversas dele) pra outro
    //    perfil, sem ninguém perceber.
    if (reconectando) {
      const antes = String(reconectando.config?.igBusinessId ?? '');
      if (antes && antes !== String(igConfig.igBusinessId)) {
        throw new BadRequestException(
          `Este login é de outra conta do Instagram (${igConfig.igUsername ? '@' + igConfig.igUsername : igConfig.igBusinessId}). ` +
            'Reconectar serve pra renovar as credenciais da mesma conta — pra usar outra, crie um canal novo.',
        );
      }
      const atualizado = await this.prisma.channel.update({
        where: { id: reconectando.id },
        data: {
          isActive: true,
          config: {
            ...reconectando.config,
            accessToken: igConfig.accessToken,
            igBusinessId: igConfig.igBusinessId,
            appSecret: igAppSecret,
            userAccessToken: userToken,
            ...(igConfig.pageAccessToken
              ? { pageAccessToken: igConfig.pageAccessToken }
              : {}),
            ...(igConfig.fbPageId ? { fbPageId: igConfig.fbPageId } : {}),
            ...(igConfig.igUsername ? { igUsername: igConfig.igUsername } : {}),
            ...(igConfig.fbPageName ? { fbPageName: igConfig.fbPageName } : {}),
          },
        },
      });
      // Reinscreve os webhooks: o token mudou, e a inscrição antiga pode ter
      // ficado pra trás junto com ele.
      await this.instagramHttpClient
        .subscribeApp(atualizado)
        .catch((err) =>
          this.logger.warn(`Reconexão: subscribeApp falhou — ${err?.message ?? err}`),
        );
      await this.persistInstagramOrgSecrets(organizationId, {
        igBusinessId: igConfig.igBusinessId,
        accessToken: igConfig.accessToken,
        fbPageId: igConfig.fbPageId,
        userToken,
        channelId: atualizado.id,
      }).catch((err) =>
        this.logger.warn(`Reconexão: persistInstagramOrgSecrets falhou — ${err?.message ?? err}`),
      );
      return atualizado;
    }

    // 4) Cria o canal (o create() dispara o subscribed_apps da Página → DMs,
    //    quando há Página; sem Página, os endpoints usam o token de usuário).
    await this.assertInstagramAccountFree(igConfig.igBusinessId, organizationId);
    //    IMPORTANTE: o appSecret do canal é o do app do INSTAGRAM (igAppSecret),
    //    pois é ele que assina os webhooks — usar o do WhatsApp faz a validação
    //    HMAC rejeitar todas as mensagens.
    const channel = await this.create(
      organizationId,
      {
        type: ChannelType.INSTAGRAM,
        name: dto.name,
        config: {
          accessToken: igConfig.accessToken,
          igBusinessId: igConfig.igBusinessId,
          appSecret: igAppSecret,
          apiVersion: 'v25.0',
          graphApi: 'facebook',
          // Token de USUÁRIO do login (diferente do token da Página acima).
          // Guardado porque é com ele que se descobre/renova a conta de
          // anúncios: sem isso, quando a captura falha não sobra nada pra
          // diagnosticar nem pra tentar de novo — era preciso refazer o login
          // inteiro só pra olhar os escopos.
          userAccessToken: userToken,
          ...(igConfig.pageAccessToken ? { pageAccessToken: igConfig.pageAccessToken } : {}),
          ...(igConfig.fbPageId ? { fbPageId: igConfig.fbPageId } : {}),
          ...(igConfig.igUsername ? { igUsername: igConfig.igUsername } : {}),
          ...(igConfig.fbPageName ? { fbPageName: igConfig.fbPageName } : {}),
        },
        ...(dto.visibility ? { visibility: dto.visibility } : {}),
      },
      creator,
    );

    // 4) Esse login vira a configuração de Instagram + Ads da org: grava os
    //    secrets que os agentes de marketing usam (publicar, comentar, medir,
    //    anúncios). Best-effort — não derruba a criação do canal.
    // Aguardamos (em vez do antigo fire-and-forget) pra poder DIZER na resposta
    // se os anúncios entraram. O try/catch garante que uma falha aqui não
    // derruba o canal, que é o que o fire-and-forget protegia.
    let ads: AdsCaptureResult = { adsConnected: false };
    try {
      ads = await this.persistInstagramOrgSecrets(organizationId, {
        igBusinessId: igConfig.igBusinessId,
        accessToken: igConfig.accessToken,
        fbPageId: igConfig.fbPageId,
        userToken,
        channelId: channel.id,
      });
    } catch (err: any) {
      this.logger.warn(`persistInstagramOrgSecrets falhou: ${err?.message ?? err}`);
    }

    return {
      ...channel,
      integrations: {
        ads: ads.adsConnected
          ? { connected: true as const, adAccountId: ads.adAccountId }
          : {
              connected: false as const,
              // A mensagem MUDA conforme o que o token realmente traz: presumir
              // "faltou permissão" mandava o dono mexer numa configuração que
              // já estava certa.
              reason: ads.diagnostic?.temAds
                ? `A permissão de anúncios FOI concedida (${ads.diagnostic.scopes.join(', ')}), mas nenhuma conta de anúncios veio junto. No popup da Meta, verifique se alguma conta de anúncios ficou realmente marcada — e se o portfólio de negócios tem alguma conta acessível. As mensagens já funcionam.`
                : `Nenhuma conta de anúncios foi liberada neste login. Escopos que vieram: [${ads.diagnostic?.scopes.join(', ') || 'nenhum'}]. As mensagens funcionam normalmente, mas o módulo de Anúncios fica sem credencial — a configuração de Login do Facebook precisa conceder ads_management ou ads_read.`,
            },
      },
    };
  }

  /**
   * Grava/atualiza os org secrets do Instagram + Ads a partir do onboarding via
   * Facebook Login. Assim o mesmo login que conecta o inbox também alimenta os
   * agentes de marketing (IG_USER_ID/IG_ACCESS_TOKEN pra posts/comentários/
   * métricas; FB_PAGE_ID; e, se houver conta de anúncios acessível, META_AD_
   * ACCOUNT_ID/META_ADS_ACCESS_TOKEN pro módulo de Ads).
   */
  private async persistInstagramOrgSecrets(
    organizationId: string,
    data: {
      igBusinessId: string;
      accessToken: string;
      fbPageId?: string;
      userToken: string;
      /**
       * Canal que originou a conexão. As credenciais também são gravadas nele
       * pra que o marketing possa agir por conta: os secrets da org são um só
       * por empresa e a última conexão sobrescreve as anteriores.
       */
      channelId?: string;
    },
  ): Promise<AdsCaptureResult> {
    const marcarNoCanal = async (campos: Record<string, string>) => {
      if (!data.channelId) return;
      const canal = await this.prisma.channel.findUnique({
        where: { id: data.channelId },
        select: { config: true },
      });
      if (!canal) return;
      await this.prisma.channel.update({
        where: { id: data.channelId },
        data: { config: { ...(canal.config as object), ...campos } },
      });
    };
    const upsert = async (key: string, value: string) => {
      if (!value) return;
      await this.prisma.organizationSecret.upsert({
        where: { uq_org_secret_key: { organizationId, key } },
        create: { organizationId, key, value },
        update: { value },
      });
    };

    await upsert('IG_USER_ID', data.igBusinessId);
    await upsert('IG_ACCESS_TOKEN', data.accessToken);
    if (data.fbPageId) await upsert('FB_PAGE_ID', data.fbPageId);

    // Conta de anúncios: só vem se a configuração de Facebook Login for Business
    // pediu `ads_management`/`ads_read`. Sem essa permissão a Meta devolve lista
    // vazia — o canal conecta e as mensagens funcionam, mas o módulo de Ads fica
    // sem credencial. O resultado sobe pro chamador pra que a TELA avise; antes
    // isso morria num log de servidor e o dono só descobria quando o agente de
    // marketing não achava campanha nenhuma.
    try {
      const adAccount = await this.instagramHttpClient.getFirstAdAccount(data.userToken);
      if (adAccount) {
        await upsert('META_AD_ACCOUNT_ID', adAccount);
        await upsert('META_ADS_ACCESS_TOKEN', data.userToken);
        await marcarNoCanal({
          adAccountId: adAccount,
          adsAccessToken: data.userToken,
        });
        this.logger.log(
          `Instagram FLB: anúncios conectados (org ${organizationId}, conta ${adAccount}).`,
        );
        return { adsConnected: true, adAccountId: adAccount };
      }
      // Não achou. Antes de reportar, descobrimos POR QUE — a mensagem anterior
      // era um texto fixo que presumia falta de permissão, mesmo quando a
      // permissão estava lá e o problema era outro.
      const info = await this.instagramHttpClient.describeToken(data.userToken);
      const temAds =
        info.scopes.includes('ads_management') || info.scopes.includes('ads_read');
      this.logger.warn(
        `Instagram FLB: sem conta de anúncios (org ${organizationId}). ` +
          `Escopos do token: [${info.scopes.join(', ')}]. ` +
          `Alvos: ${JSON.stringify(info.granular)}`,
      );
      return { adsConnected: false, diagnostic: { scopes: info.scopes, temAds } };
    } catch (err: any) {
      this.logger.warn(`Instagram FLB: não achei ad account: ${err?.message ?? err}`);
    }
    return { adsConnected: false };
  }

  /**
   * Ensures the channel's config contains the provider-side IDs used by the
   * webhook router (`igBusinessId` / `phoneNumberId`). Idempotent: skipped
   * when the IDs are already present. Runs synchronously because the webhook
   * router uses these fields and we'd rather fail channel creation than
   * silently produce an unroutable channel.
   */
  async enrichProviderIds(channelId: string, type: ChannelType) {
    try {
      const channel = await this.repository.findById(channelId);
      if (!channel) return null;
      const config = (channel.config as Record<string, any>) || {};

      if (type === ChannelType.INSTAGRAM && !config.igBusinessId) {
        const info = await this.instagramHttpClient.getMe(channel);
        const id = info?.user_id ?? info?.id;
        if (id) {
          return this.repository.update(channelId, {
            config: { ...config, igBusinessId: String(id) },
          });
        }
      }

      if (type === ChannelType.WHATSAPP_OFFICIAL && !config.phoneNumberId) {
        // phoneNumberId is part of Meta's onboarding output — if the user
        // didn't include it we can't guess, but we log loudly so it isn't silent.
        this.logger.warn(
          `WA Official channel ${channelId} created without config.phoneNumberId — webhooks will be dropped as unknown locator`,
        );
      }

      return channel;
    } catch (err: any) {
      this.logger.warn(
        `enrichProviderIds failed for channel ${channelId}: ${err.message}`,
      );
      return null;
    }
  }

  private async configureZappfyWebhook(channelId: string): Promise<void> {
    const channel = await this.repository.findById(channelId);
    if (!channel) return;
    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      this.logger.warn('APP_URL not set — skipping Zappfy webhook setup');
      return;
    }
    const webhookUrl = `${appUrl}/api/v1/webhooks/WHATSAPP_ZAPPFY`;
    await this.zappfyHttpClient.configureWebhook(channel, webhookUrl);
    this.logger.log(`Zappfy webhook configured: ${webhookUrl}`);
  }

  private async subscribeWaOfficialApp(channelId: string): Promise<void> {
    const channel = await this.repository.findById(channelId);
    if (!channel) return;
    const config = (channel.config as Record<string, any>) || {};
    if (!config.businessAccountId) {
      this.logger.warn(
        `WA Official channel ${channelId} has no businessAccountId — skipping auto-subscribe (do it manually in Meta dashboard)`,
      );
      return;
    }
    await this.waOfficialHttpClient.subscribeApp(channel);
    this.logger.log(
      `WA Official app subscribed to WABA ${config.businessAccountId} (channel ${channelId})`,
    );
  }

  private async configureTelegramWebhook(channelId: string): Promise<void> {
    const channel = await this.repository.findById(channelId);
    if (!channel) return;
    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      this.logger.warn('APP_URL not set — skipping Telegram webhook setup');
      return;
    }
    const config = (channel.config as Record<string, any>) || {};
    const secretToken = config.secretToken || channel.webhookSecret;
    if (!secretToken) {
      this.logger.warn(
        `Telegram channel ${channelId} has no secretToken — webhooks cannot be routed safely`,
      );
      return;
    }
    const webhookUrl = `${appUrl}/api/v1/webhooks/TELEGRAM`;
    await this.telegramHttpClient.setWebhook(channel, webhookUrl, String(secretToken));
    this.logger.log(`Telegram webhook configured: ${webhookUrl}`);
  }

  async findAll(organizationId: string, access: ChannelAccess) {
    const accessibleIds = access === 'ALL' ? undefined : [...access];
    return this.repository.findByOrganization(organizationId, accessibleIds);
  }

  async findOne(id: string, organizationId: string, access?: ChannelAccess) {
    const channel = await this.repository.findById(id);
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.organizationId !== organizationId) {
      throw new ForbiddenException();
    }
    if (access !== undefined && access !== 'ALL' && !access.has(id)) {
      throw new ForbiddenException('You do not have access to this channel');
    }
    return channel;
  }

  /**
   * (Re)inscreve o app nos webhooks da conta IG do canal. Usado pelo botão
   * "Ativar recebimento" quando a criação não conseguiu (ex.: token trocado).
   */
  async instagramSubscribe(channelId: string, organizationId: string) {
    const channel = await this.findOne(channelId, organizationId);
    if (channel.type !== ChannelType.INSTAGRAM) {
      throw new BadRequestException('Canal não é do tipo Instagram.');
    }
    try {
      const result = await this.instagramHttpClient.subscribeApp(channel);
      return { ok: true, result };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  }

  /**
   * Diagnóstico de webhook: mostra os últimos eventos que CHEGARAM (roteados
   * pro canal + os não-roteados do mesmo tipo), com o `entry.id` que veio no
   * payload e se ele bate com o ID configurado no canal. Responde as duas
   * perguntas que travam todo mundo: "chegou algum webhook?" e "o ID casou?".
   */
  async webhookDiagnostics(channelId: string, organizationId: string) {
    const channel = await this.findOne(channelId, organizationId);
    const cfg = (channel.config as Record<string, any>) || {};
    const configuredIds = [cfg.igBusinessId, cfg.igUserId, cfg.pageId, cfg.fbPageId]
      .filter(Boolean)
      .map(String);

    const events = await this.prisma.webhookEvent.findMany({
      where: {
        OR: [
          { channelId: channel.id },
          { channelType: channel.type, channelId: null }, // unrouted do tipo
        ],
      },
      orderBy: { receivedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        status: true,
        receivedAt: true,
        errorMessage: true,
        channelId: true,
        rawPayload: true,
      },
    });

    const extractEntryIds = (payload: any): string[] => {
      const entries: any[] = payload?.entry || [];
      return [...new Set(entries.map((e) => e?.id).filter(Boolean).map(String))];
    };
    const describeKinds = (payload: any): string[] => {
      const entries: any[] = payload?.entry || [];
      const kinds = new Set<string>();
      for (const e of entries) {
        if ((e?.messaging || []).length) kinds.add('mensagem (DM)');
        for (const c of e?.changes || []) {
          if (c?.field) kinds.add(c.field === 'comments' ? 'comentário' : c.field);
        }
      }
      return [...kinds];
    };

    // Estado REAL da inscrição na Meta. É o que responde "o recebimento está
    // ligado?" — a inscrição vive lá, não aqui, e some se o canal for
    // reconectado ou a permissão revogada. Não derruba o diagnóstico se falhar.
    const isInstagram = channel.type === ChannelType.INSTAGRAM;
    const [subscription, token] = await Promise.all([
      isInstagram
        ? this.instagramHttpClient.getSubscription(channel as any).catch((err) => ({
            active: false,
            fields: [] as string[],
            node: 'page',
            error: err?.message ?? 'falha ao consultar',
          }))
        : Promise.resolve(undefined),
      // Token morto não bloqueia a DM de chegar, mas quebra buscar nome/foto de
      // quem enviou e responder. Sem este check, o sintoma era um contato sem
      // nome e nenhuma pista do motivo.
      isInstagram
        ? this.instagramHttpClient
            .checkToken(channel as any)
            .catch((err) => ({ valid: false, error: err?.message ?? 'falha ao checar' }))
        : Promise.resolve(undefined),
    ]);

    return {
      configuredIds,
      subscription,
      token,
      totalReceived: events.length,
      events: events.map((e) => {
        const entryIds = extractEntryIds(e.rawPayload);
        return {
          receivedAt: e.receivedAt,
          status: e.status, // RECEIVED | PROCESSED | FAILED | UNROUTED
          routed: !!e.channelId,
          entryIds,
          kinds: describeKinds(e.rawPayload),
          idMatches:
            entryIds.length > 0 &&
            entryIds.some((id) => configuredIds.includes(id)),
          errorMessage: e.errorMessage ?? undefined,
        };
      }),
    };
  }

  async update(
    id: string,
    organizationId: string,
    dto: UpdateChannelDto,
    callerUserOrganizationId?: string,
  ) {
    await this.findOne(id, organizationId);

    // Visibility é tratado por caminho separado pra garantir auto-grant.
    const { visibility, ...rest } = dto;
    if (visibility && callerUserOrganizationId) {
      await this.channelAccess.setChannelVisibility(
        id,
        organizationId,
        visibility,
        callerUserOrganizationId,
      );
    }

    if (Object.keys(rest).length === 0) {
      return this.repository.findById(id);
    }
    return this.repository.update(id, rest);
  }

  /**
   * Soft-deletes a channel after verifying the caller typed its exact name.
   * Messages and conversations are preserved — they are flagged `deletedAt`
   * so they stop showing in UI without destroying history.
   */
  async remove(id: string, organizationId: string, confirmName?: string) {
    const channel = await this.findOne(id, organizationId);
    if (!confirmName || confirmName.trim() !== channel.name) {
      throw new BadRequestException(
        'Confirme digitando exatamente o nome do canal para remover.',
      );
    }
    return this.repository.softDelete(id);
  }

  async findActiveByType(type: ChannelType) {
    return this.repository.findActiveByType(type);
  }

  /**
   * Resolve the channel that owns a given webhook payload by asking the
   * inbound adapter to match against `config`. Returns null when no channel
   * matches — caller MUST drop the event (and ideally log for investigation).
   */
  async resolveByLocator(
    type: ChannelType,
    matches: (channel: { config: any }) => boolean,
  ) {
    const candidates = await this.repository.findActiveByType(type);
    return candidates.find((c) => matches(c)) ?? null;
  }

  async syncChannel(id: string, organizationId: string) {
    const channel = await this.findOne(id, organizationId);

    if (!this.adapterRegistry.hasHistorySync(channel.type)) {
      return {
        success: false,
        error: syncNotSupportedMessage(channel.type),
      };
    }

    const job = await this.syncOrchestrator.start(channel.id, {
      mode: ChannelSyncMode.MANUAL,
    });
    return { success: true, jobId: job.id, status: job.status };
  }

  async getSyncStatus(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    const job = await this.prisma.channelSyncJob.findFirst({
      where: { channelId: id },
      orderBy: { createdAt: 'desc' },
    });
    return { job };
  }

  async cancelSync(id: string, organizationId: string) {
    const channel = await this.findOne(id, organizationId);

    if (this.adapterRegistry.hasHistorySync(channel.type)) {
      const job = await this.syncOrchestrator.cancel(id);
      return { job };
    }

    const active = await this.prisma.channelSyncJob.findFirst({
      where: {
        channelId: id,
        status: { in: [ChannelSyncStatus.PENDING, ChannelSyncStatus.RUNNING] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!active) return { job: null };

    const job = await this.prisma.channelSyncJob.update({
      where: { id: active.id },
      data: { status: ChannelSyncStatus.CANCELLED, finishedAt: new Date() },
    });
    return { job };
  }

  async testConnection(id: string, organizationId: string) {
    const channel = await this.findOne(id, organizationId);

    try {
      switch (channel.type) {
        case ChannelType.WHATSAPP_ZAPPFY: {
          const status = await this.zappfyHttpClient.getInstanceStatus(channel);
          const rawState = status?.state;
          const statusStr =
            typeof rawState === 'string'
              ? rawState
              : typeof rawState === 'object' && rawState?.status
                ? String(rawState.status)
                : typeof status?.status === 'string'
                  ? status.status
                  : 'connected';
          return {
            success: true,
            status: statusStr,
            data: status,
          };
        }

        case ChannelType.WHATSAPP_OFFICIAL: {
          const info = await this.waOfficialHttpClient.verifyPhoneNumber(channel);
          return {
            success: true,
            status: 'connected',
            data: {
              phoneNumber: info.display_phone_number,
              qualityRating: info.quality_rating,
              verifiedName: info.verified_name,
            },
          };
        }

        case ChannelType.INSTAGRAM: {
          const info = await this.instagramHttpClient.getMe(channel);
          return {
            success: true,
            status: 'connected',
            data: {
              username: info.username,
              igUserId: info.user_id || info.id,
              accountType: info.account_type,
              name: info.name,
            },
          };
        }

        case ChannelType.TELEGRAM: {
          const info = await this.telegramHttpClient.getMe(channel);
          return {
            success: true,
            status: 'connected',
            data: {
              id: info.id,
              username: info.username,
              firstName: info.first_name,
              canJoinGroups: info.can_join_groups,
              canReadAllGroupMessages: info.can_read_all_group_messages,
            },
          };
        }

        case ChannelType.THREADS: {
          const cfg = (channel.config ?? {}) as Record<string, any>;
          const me = await this.threadsHttpClient.getMe(
            String(cfg.accessToken || ''),
          );
          return {
            success: true,
            status: 'connected',
            data: { username: me.username, threadsUserId: me.id, name: me.name },
          };
        }

        default:
          return { success: false, error: 'Unsupported channel type' };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }
}
