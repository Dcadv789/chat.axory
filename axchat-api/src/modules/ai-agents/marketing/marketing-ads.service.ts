import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';

const GRAPH = 'https://graph.facebook.com/v21.0';

export interface AdCampaign {
  id: string;
  name: string;
  status: string; // ACTIVE | PAUSED | DELETED | ARCHIVED (config status)
  effectiveStatus: string; // status real (efetivo) da Meta
  objective: string | null;
  dailyBudgetCents: number | null;
  lifetimeBudgetCents: number | null;
}

/**
 * Gestão DIRETA de anúncios (Meta Ads) pelo painel do dono — listar campanhas,
 * pausar/ativar e excluir. Ação do próprio usuário (não da IA), então executa
 * na hora, sem card de aprovação. Usa os secrets META_AD_ACCOUNT_ID /
 * META_ADS_ACCESS_TOKEN da org.
 */
@Injectable()
export class MarketingAdsService {
  private readonly logger = new Logger(MarketingAdsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async resolve(orgId: string, key: string): Promise<string | null> {
    const secret = await this.prisma.organizationSecret.findFirst({
      where: { organizationId: orgId, key },
      select: { value: true },
    });
    return secret?.value ?? this.config.get<string>(key) ?? null;
  }

  private async credentials(orgId: string): Promise<{ acct: string; token: string }> {
    const [adAccountId, token] = await Promise.all([
      this.resolve(orgId, 'META_AD_ACCOUNT_ID'),
      this.resolve(orgId, 'META_ADS_ACCESS_TOKEN'),
    ]);
    if (!adAccountId || !token) {
      throw new BadRequestException(
        'Faltam credenciais do Meta Ads (META_AD_ACCOUNT_ID / META_ADS_ACCESS_TOKEN). Configure em Configurações → Integrações.',
      );
    }
    return { acct: adAccountId.replace(/^act_/, ''), token };
  }

  private num(v: any): number | null {
    return v === undefined || v === null || v === '' ? null : Number(v);
  }

  async listCampaigns(orgId: string): Promise<{ campaigns: AdCampaign[] }> {
    const { acct, token } = await this.credentials(orgId);
    const fields =
      'name,status,effective_status,objective,daily_budget,lifetime_budget';
    let url =
      `${GRAPH}/act_${encodeURIComponent(acct)}/campaigns` +
      `?fields=${fields}&limit=100&access_token=${encodeURIComponent(token)}`;
    const all: any[] = [];
    for (let page = 0; page < 20; page++) {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      const json: any = await res.json();
      if (!res.ok) {
        throw new BadRequestException(
          `Meta Ads: ${json?.error?.message ?? `HTTP ${res.status}`}`,
        );
      }
      const data: any[] = Array.isArray(json?.data) ? json.data : [];
      all.push(...data);
      const next = json?.paging?.next;
      if (!next) break;
      url = next;
    }
    // daily_budget/lifetime_budget vêm em CENTAVOS (menor unidade).
    const campaigns: AdCampaign[] = all.map((c) => ({
      id: String(c.id),
      name: c.name ?? '(sem nome)',
      status: c.status ?? '—',
      effectiveStatus: c.effective_status ?? c.status ?? '—',
      objective: c.objective ?? null,
      dailyBudgetCents: this.num(c.daily_budget),
      lifetimeBudgetCents: this.num(c.lifetime_budget),
    }));
    return { campaigns };
  }

  async setCampaignStatus(
    orgId: string,
    campaignId: string,
    status: 'ACTIVE' | 'PAUSED',
  ): Promise<{ ok: boolean }> {
    if (status !== 'ACTIVE' && status !== 'PAUSED') {
      throw new BadRequestException('status deve ser ACTIVE ou PAUSED.');
    }
    const { token } = await this.credentials(orgId);
    const res = await fetch(
      `${GRAPH}/${encodeURIComponent(campaignId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, access_token: token }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new BadRequestException(
        `Meta Ads: ${json?.error?.message ?? `HTTP ${res.status}`}`,
      );
    }
    this.logger.log(`Campanha ${campaignId} → ${status} (org ${orgId})`);
    return { ok: true };
  }

  async deleteCampaign(orgId: string, campaignId: string): Promise<{ ok: boolean }> {
    const { token } = await this.credentials(orgId);
    const res = await fetch(
      `${GRAPH}/${encodeURIComponent(campaignId)}?access_token=${encodeURIComponent(token)}`,
      { method: 'DELETE', signal: AbortSignal.timeout(15_000) },
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new BadRequestException(
        `Meta Ads: ${json?.error?.message ?? `HTTP ${res.status}`}`,
      );
    }
    this.logger.log(`Campanha ${campaignId} excluída (org ${orgId})`);
    return { ok: true };
  }
}
