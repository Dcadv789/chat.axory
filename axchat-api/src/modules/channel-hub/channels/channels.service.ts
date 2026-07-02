import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ChannelType, ChannelSyncMode, ChannelSyncStatus, OrgRole } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { assertWithinPlanLimit } from '../../../common/plan-limits';
import { ChannelsRepository } from './channels.repository';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { CoexistenceChannelDto } from './dto/coexistence-channel.dto';
import { ChannelAdapterRegistry } from '../channel-adapter.registry';
import { ZappfyHttpClient } from '../adapters/zappfy/zappfy.http-client';
import { WhatsAppOfficialHttpClient } from '../adapters/whatsapp-official/whatsapp-official.http-client';
import { InstagramHttpClient } from '../adapters/instagram/instagram.http-client';
import { TelegramHttpClient } from '../adapters/telegram/telegram.http-client';
import { ChannelSyncOrchestrator } from '../sync/channel-sync.orchestrator';
import { syncNotSupportedMessage } from '../sync/sync-messages.util';
import {
  ChannelAccessService,
  type ChannelAccess,
} from '../../iam/channel-access/channel-access.service';

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
  }> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: 'meta_coexistence' },
    });
    const value =
      row?.value && typeof row.value === 'object' && !Array.isArray(row.value)
        ? (row.value as Record<string, unknown>)
        : {};
    return {
      appId: typeof value.appId === 'string' ? value.appId : '',
      appSecret: typeof value.appSecret === 'string' ? value.appSecret : '',
      configId: typeof value.configId === 'string' ? value.configId : '',
    };
  }

  /**
   * Config pública de coexistência para a org montar o popup Embedded Signup.
   * NÃO inclui o appSecret — só appId + configId, e se está habilitado.
   */
  async getCoexistenceConfig() {
    const { appId, appSecret, configId } = await this.loadMetaCoexistenceConfig();
    return {
      appId,
      configId,
      enabled: !!(appId && appSecret && configId),
    };
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

    const accessToken = await this.waOfficialHttpClient.exchangeCodeForToken(
      dto.code,
      appId,
      appSecret,
    );

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
          apiVersion: 'v21.0',
          coexistence: true,
        },
        ...(dto.visibility ? { visibility: dto.visibility } : {}),
      },
      creator,
    );
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
    const configuredIds = [cfg.igBusinessId, cfg.igUserId, cfg.pageId]
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

    return {
      configuredIds,
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
