import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelType } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

export interface MarketingAccount {
  channelId: string;
  name: string;
  igUsername?: string;
  igUserId?: string;
  /** Tem conta de anúncios acessível — sem isso, só publicação e métricas de post. */
  hasAds: boolean;
  /** A conta que a IA usa quando ninguém escolhe explicitamente. */
  isDefault: boolean;
}

export interface MarketingCredentials {
  igUserId?: string;
  igToken?: string;
  fbPageId?: string;
  adAccountId?: string;
  adsToken?: string;
  /** De onde vieram: um canal específico ou os secrets da organização. */
  source: 'channel' | 'org';
  channelId?: string;
  accountName?: string;
}

/**
 * Resolve de QUAL conta o marketing está falando.
 *
 * Antes as credenciais viviam só em OrganizationSecret — uma tripla por
 * empresa. Conectar um segundo Instagram sobrescrevia a primeira, e o painel
 * passava a agir sobre a conta nova sem avisar ninguém. O inbox sempre soube
 * separar por canal; o marketing não.
 *
 * O canal já guarda tudo o que o marketing precisa (conta IG, token, Página e
 * — desde a captura de anúncios — a conta de ads), então ele é a fonte natural.
 * Os secrets da organização continuam valendo como fallback: cobrem quem
 * configurou na mão em Integrações e as orgs que ainda não reconectaram.
 */
@Injectable()
export class MarketingCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async secret(orgId: string, key: string): Promise<string | undefined> {
    const row = await this.prisma.organizationSecret.findFirst({
      where: { organizationId: orgId, key },
      select: { value: true },
    });
    return row?.value ?? this.config.get<string>(key) ?? undefined;
  }

  /** Define (ou limpa) a conta que a IA e o painel usam por padrão. */
  async setDefaultAccount(orgId: string, channelId: string | null): Promise<void> {
    if (channelId) {
      const existe = await this.prisma.channel.findFirst({
        where: {
          id: channelId,
          organizationId: orgId,
          type: ChannelType.INSTAGRAM,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!existe) {
        throw new BadRequestException('Conta não encontrada nesta empresa.');
      }
    }
    // O perfil pode não existir ainda: a empresa consegue escolher a conta
    // padrão antes de preencher o resto do marketing.
    await this.prisma.marketingProfile.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId, defaultChannelId: channelId },
      update: { defaultChannelId: channelId },
    });
  }

  /** Canais de Instagram da org que podem alimentar o marketing. */
  async listAccounts(orgId: string): Promise<MarketingAccount[]> {
    const perfil = await this.prisma.marketingProfile.findUnique({
      where: { organizationId: orgId },
      select: { defaultChannelId: true },
    });
    const canais = await this.prisma.channel.findMany({
      where: {
        organizationId: orgId,
        type: ChannelType.INSTAGRAM,
        deletedAt: null,
        isActive: true,
      },
      select: { id: true, name: true, config: true },
      orderBy: { createdAt: 'asc' },
    });
    return canais.map((c) => {
      const cfg = (c.config ?? {}) as Record<string, any>;
      return {
        channelId: c.id,
        name: c.name,
        igUsername: cfg.igUsername ?? cfg.username ?? undefined,
        igUserId: cfg.igBusinessId ? String(cfg.igBusinessId) : undefined,
        hasAds: !!cfg.adAccountId,
        isDefault: perfil?.defaultChannelId === c.id,
      };
    });
  }

  /**
   * `channelId` ausente = comportamento antigo (credenciais da organização),
   * pra não quebrar as skills dos agentes e quem só tem uma conta.
   */
  async resolve(
    orgId: string,
    channelId?: string,
  ): Promise<MarketingCredentials> {
    // Sem canal explícito, vale a conta PADRÃO da empresa. É o que faz as
    // skills dos agentes agirem sobre a conta certa: o contexto delas não
    // carrega canal, então sem isto elas usariam "a última conectada".
    const explicito = !!channelId;
    if (!channelId) {
      const perfil = await this.prisma.marketingProfile.findUnique({
        where: { organizationId: orgId },
        select: { defaultChannelId: true },
      });
      channelId = perfil?.defaultChannelId ?? undefined;
    }

    if (channelId) {
      const canal = await this.prisma.channel.findFirst({
        where: {
          id: channelId,
          organizationId: orgId,
          type: ChannelType.INSTAGRAM,
          deletedAt: null,
        },
        select: { id: true, name: true, config: true },
      });
      // Escolha explícita que não resolve é erro do chamador. Já um PADRÃO
      // órfão (canal apagado) não pode derrubar as skills dos agentes — cai
      // nos secrets da organização, como era antes.
      if (!canal && explicito) {
        throw new BadRequestException(
          'Conta de marketing não encontrada nesta empresa. Recarregue a página e escolha outra.',
        );
      }
      if (canal) {
        const cfg = (canal.config ?? {}) as Record<string, any>;
        // Ads pode não ter sido capturado no login (permissão em Acesso
        // Padrão); nesse caso o da org ainda serve, já que a conta de anúncios
        // costuma ser uma só por empresa mesmo com vários perfis.
        return {
          igUserId: cfg.igBusinessId ? String(cfg.igBusinessId) : undefined,
          igToken: cfg.accessToken ?? cfg.pageAccessToken ?? undefined,
          fbPageId: cfg.fbPageId ? String(cfg.fbPageId) : undefined,
          adAccountId:
            cfg.adAccountId ?? (await this.secret(orgId, 'META_AD_ACCOUNT_ID')),
          adsToken:
            cfg.adsAccessToken ??
            cfg.userAccessToken ??
            (await this.secret(orgId, 'META_ADS_ACCESS_TOKEN')),
          source: 'channel',
          channelId: canal.id,
          accountName: canal.name,
        };
      }
    }

    const [igUserId, igToken, fbPageId, adAccountId, adsToken] = await Promise.all([
      this.secret(orgId, 'IG_USER_ID'),
      this.secret(orgId, 'IG_ACCESS_TOKEN'),
      this.secret(orgId, 'FB_PAGE_ID'),
      this.secret(orgId, 'META_AD_ACCOUNT_ID'),
      this.secret(orgId, 'META_ADS_ACCESS_TOKEN'),
    ]);
    return { igUserId, igToken, fbPageId, adAccountId, adsToken, source: 'org' };
  }

  /** Credenciais de anúncios, ou um erro que diz o que fazer. */
  async ads(
    orgId: string,
    channelId?: string,
  ): Promise<{ acct: string; token: string }> {
    const c = await this.resolve(orgId, channelId);
    if (!c.adAccountId || !c.adsToken) {
      throw new BadRequestException(
        c.source === 'channel'
          ? `A conta "${c.accountName}" não tem conta de anúncios vinculada. Reconecte o canal concedendo as permissões de Anúncios, ou preencha META_AD_ACCOUNT_ID e META_ADS_ACCESS_TOKEN em Configurações → Integrações.`
          : 'Faltam credenciais do Meta Ads (META_AD_ACCOUNT_ID / META_ADS_ACCESS_TOKEN). Configure em Configurações → Integrações.',
      );
    }
    // A Meta exige o prefixo act_ no nó, mas guardamos o id cru — normalizar
    // aqui evita que cada chamador lembre (ou esqueça) da regra.
    return { acct: c.adAccountId.replace(/^act_/, ''), token: c.adsToken };
  }

  /** Credenciais do perfil do Instagram (posts, métricas), ou erro explicativo. */
  async instagram(
    orgId: string,
    channelId?: string,
  ): Promise<{ igUserId: string; token: string }> {
    const c = await this.resolve(orgId, channelId);
    if (!c.igUserId || !c.igToken) {
      throw new BadRequestException(
        c.source === 'channel'
          ? `A conta "${c.accountName}" está sem credenciais do Instagram. Use Reconectar no canal.`
          : 'Faltam credenciais do Instagram (IG_USER_ID / IG_ACCESS_TOKEN). Configure em Configurações → Integrações.',
      );
    }
    return { igUserId: c.igUserId, token: c.igToken };
  }
}
