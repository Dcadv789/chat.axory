import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../../../database/prisma.service';

/** Resultado de uma verificação individual (uma credencial/par de credenciais). */
export interface IntegrationCheck {
  /** Rótulo curto do que foi testado. Ex.: "Conta Instagram". */
  name: string;
  ok: boolean;
  /** Mensagem amigável: sucesso (com o dado retornado) ou o erro exato da API. */
  message: string;
  /** Chaves de secret envolvidas — front usa pra destacar o campo com problema. */
  keys: string[];
}

export interface IntegrationTestResult {
  provider: string;
  checks: IntegrationCheck[];
}

const GRAPH = 'https://graph.facebook.com/v25.0';

/**
 * Valida as credenciais salvas de uma integração batendo na API real do
 * provedor (Meta / Google / OpenAI). Não expõe o token — só usa o valor
 * já guardado como org secret (com fallback pro env do servidor, igual ao
 * http-tool-executor em runtime).
 */
@Injectable()
export class IntegrationTestService {
  private readonly logger = new Logger(IntegrationTestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** org secret primeiro, depois process.env — mesma ordem do runtime. */
  private async resolve(orgId: string, key: string): Promise<string | null> {
    const secret = await this.prisma.organizationSecret.findUnique({
      where: { uq_org_secret_key: { organizationId: orgId, key } },
      select: { value: true },
    });
    return secret?.value ?? this.config.get<string>(key) ?? null;
  }

  /** GET numa API que devolve `{ error: { message } }` no formato Meta/Google. */
  private async httpCheck(
    name: string,
    keys: string[],
    url: string,
    headers: Record<string, string> = {},
  ): Promise<IntegrationCheck> {
    try {
      const res = await axios.get(url, {
        headers,
        timeout: 10_000,
        validateStatus: () => true,
      });
      if (res.status >= 200 && res.status < 300) {
        return { name, ok: true, message: this.describe(res.data), keys };
      }
      const apiMsg =
        res.data?.error?.message ??
        res.data?.error?.error_user_msg ??
        res.data?.error_description ??
        (typeof res.data === 'string' ? res.data : JSON.stringify(res.data));
      return {
        name,
        ok: false,
        message: `HTTP ${res.status}: ${String(apiMsg).slice(0, 300)}`,
        keys,
      };
    } catch (err: any) {
      return { name, ok: false, message: `Falha de rede: ${err.message}`, keys };
    }
  }

  /** Resumo humano do corpo de sucesso (nome/username da conta). */
  private describe(data: any): string {
    if (data?.username) return `OK — conta @${data.username}`;
    if (data?.name && data?.account_status !== undefined) {
      const active = data.account_status === 1 ? 'ativa' : `status ${data.account_status}`;
      return `OK — "${data.name}" (${active})`;
    }
    if (data?.name) return `OK — "${data.name}"`;
    return 'OK — credencial válida';
  }

  private missing(name: string, keys: string[]): IntegrationCheck {
    return {
      name,
      ok: false,
      message: `Preencha ${keys.join(' e ')} antes de testar.`,
      keys,
    };
  }

  async testProvider(
    orgId: string,
    provider: string,
  ): Promise<IntegrationTestResult> {
    switch (provider) {
      case 'instagram':
        return { provider, checks: await this.testInstagram(orgId) };
      case 'google-business':
        return { provider, checks: await this.testGoogleBusiness(orgId) };
      case 'openai':
        return { provider, checks: await this.testOpenAI(orgId) };
      default:
        return {
          provider,
          checks: [
            { name: 'Integração', ok: false, message: 'Provedor desconhecido', keys: [] },
          ],
        };
    }
  }

  private async testInstagram(orgId: string): Promise<IntegrationCheck[]> {
    const checks: IntegrationCheck[] = [];
    const [igToken, igUserId, adsToken, adAccountId, pageId] = await Promise.all([
      this.resolve(orgId, 'IG_ACCESS_TOKEN'),
      this.resolve(orgId, 'IG_USER_ID'),
      this.resolve(orgId, 'META_ADS_ACCESS_TOKEN'),
      this.resolve(orgId, 'META_AD_ACCOUNT_ID'),
      this.resolve(orgId, 'FB_PAGE_ID'),
    ]);

    // 1) Identidade do Instagram (token + user id)
    if (igToken && igUserId) {
      checks.push(
        await this.httpCheck(
          'Conta Instagram',
          ['IG_ACCESS_TOKEN', 'IG_USER_ID'],
          `${GRAPH}/${encodeURIComponent(igUserId)}?fields=username,name&access_token=${encodeURIComponent(igToken)}`,
        ),
      );
    } else {
      checks.push(this.missing('Conta Instagram', ['IG_ACCESS_TOKEN', 'IG_USER_ID']));
    }

    // 2) Conta de anúncios (só se preenchida — é opcional pra publicar orgânico)
    if (adsToken && adAccountId) {
      const acc = adAccountId.replace(/^act_/, '');
      checks.push(
        await this.httpCheck(
          'Conta de anúncios (Meta Ads)',
          ['META_ADS_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID'],
          `${GRAPH}/act_${encodeURIComponent(acc)}?fields=name,account_status&access_token=${encodeURIComponent(adsToken)}`,
        ),
      );
    }

    // 3) Página do Facebook (usa o token de ads, senão o do IG)
    const pageToken = adsToken ?? igToken;
    if (pageId && pageToken) {
      checks.push(
        await this.httpCheck(
          'Página do Facebook',
          ['FB_PAGE_ID'],
          `${GRAPH}/${encodeURIComponent(pageId)}?fields=name&access_token=${encodeURIComponent(pageToken)}`,
        ),
      );
    }

    return checks;
  }

  private async testGoogleBusiness(orgId: string): Promise<IntegrationCheck[]> {
    const [token, accountId] = await Promise.all([
      this.resolve(orgId, 'GBP_ACCESS_TOKEN'),
      this.resolve(orgId, 'GBP_ACCOUNT_ID'),
    ]);
    if (!token) {
      return [this.missing('Google Business', ['GBP_ACCESS_TOKEN'])];
    }
    const url = accountId
      ? `https://mybusinessaccountmanagement.googleapis.com/v1/accounts/${encodeURIComponent(accountId)}`
      : 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';
    return [
      await this.httpCheck(
        'Google Business',
        accountId ? ['GBP_ACCESS_TOKEN', 'GBP_ACCOUNT_ID'] : ['GBP_ACCESS_TOKEN'],
        url,
        { Authorization: `Bearer ${token}` },
      ),
    ];
  }

  private async testOpenAI(orgId: string): Promise<IntegrationCheck[]> {
    const key = await this.resolve(orgId, 'OPENAI_API_KEY');
    if (!key) return [this.missing('OpenAI', ['OPENAI_API_KEY'])];
    const check = await this.httpCheck(
      'OpenAI (acesso à API)',
      ['OPENAI_API_KEY'],
      'https://api.openai.com/v1/models/gpt-image-1',
      { Authorization: `Bearer ${key}` },
    );
    // Mensagem mais útil pro caso comum de org sem acesso ao modelo de imagem.
    if (check.ok) check.message = 'OK — chave válida e com acesso ao gpt-image-1';
    else if (check.message.includes('HTTP 404'))
      check.message =
        'Chave válida, mas a conta NÃO tem acesso ao modelo gpt-image-1 (verifique a organização na OpenAI).';
    return [check];
  }
}
