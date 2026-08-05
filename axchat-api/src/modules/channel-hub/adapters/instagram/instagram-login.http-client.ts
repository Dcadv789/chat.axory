import { BadRequestException, Injectable, Logger } from '@nestjs/common';

/**
 * Cliente do **Instagram API com Login do Instagram** — o fluxo em que o dono
 * entra com a conta do PRÓPRIO Instagram, sem precisar de Página do Facebook.
 *
 * NÃO confundir com o Facebook Login for Business (`instagram.http-client.ts`),
 * que já existe: aquele passa pela Página do FB e usa a Graph API do Facebook.
 * Aqui os hosts e o formato do token são outros:
 *   - autorização  → www.instagram.com/oauth/authorize
 *   - token        → api.instagram.com/oauth/access_token
 *   - dados/refresh→ graph.instagram.com
 */
@Injectable()
export class InstagramLoginHttpClient {
  private readonly logger = new Logger(InstagramLoginHttpClient.name);

  private static readonly AUTH_HOST = 'https://www.instagram.com';
  private static readonly TOKEN_HOST = 'https://api.instagram.com';
  private static readonly GRAPH_HOST = 'https://graph.instagram.com';
  private static readonly TIMEOUT_MS = 15_000;

  /**
   * Permissões mínimas pra atender no inbox: ler o perfil e trocar mensagens.
   * Não pedimos publicação/comentários — escopo a mais só assusta o cliente na
   * tela de consentimento e aumenta a chance de recusa na revisão da Meta.
   */
  static readonly SCOPES = [
    'instagram_business_basic',
    'instagram_business_manage_messages',
  ];

  buildAuthorizeUrl(appId: string, redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: InstagramLoginHttpClient.SCOPES.join(','),
      state,
    });
    return `${InstagramLoginHttpClient.AUTH_HOST}/oauth/authorize?${params.toString()}`;
  }

  /** `code` → token de curta duração (1h) + id do usuário do Instagram. */
  async exchangeCodeForShortToken(
    code: string,
    redirectUri: string,
    appId: string,
    appSecret: string,
  ): Promise<{ accessToken: string; userId: string }> {
    const body = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      // A Meta devolve o code URL-encoded e às vezes com `#_` no fim quando o
      // usuário volta pelo navegador; sem limpar, a troca falha com
      // "Invalid authorization code".
      code: code.replace(/#_$/, ''),
    });

    const res = await fetch(
      `${InstagramLoginHttpClient.TOKEN_HOST}/oauth/access_token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(InstagramLoginHttpClient.TIMEOUT_MS),
      },
    );

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json?.access_token) {
      const detail =
        json?.error_message || json?.error?.message || JSON.stringify(json).slice(0, 200);
      this.logger.error(`Instagram Login: troca de code falhou — ${detail}`);
      throw new BadRequestException(`Falha ao autorizar no Instagram: ${detail}`);
    }

    return {
      accessToken: json.access_token,
      // A API devolve `user_id` (numérico) — normalizamos pra string.
      userId: String(json.user_id ?? json.data?.[0]?.user_id ?? ''),
    };
  }

  /** Token curto → token de longa duração (60 dias). */
  async exchangeForLongLivedToken(
    shortToken: string,
    appSecret: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const params = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: appSecret,
      access_token: shortToken,
    });

    const res = await fetch(
      `${InstagramLoginHttpClient.GRAPH_HOST}/access_token?${params.toString()}`,
      { signal: AbortSignal.timeout(InstagramLoginHttpClient.TIMEOUT_MS) },
    );

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json?.access_token) {
      const detail = json?.error?.message || JSON.stringify(json).slice(0, 200);
      this.logger.error(`Instagram Login: token longo falhou — ${detail}`);
      throw new BadRequestException(
        `Falha ao obter token de longa duração: ${detail}`,
      );
    }

    return {
      accessToken: json.access_token,
      expiresIn: Number(json.expires_in ?? 60 * 24 * 3600),
    };
  }

  /** Perfil da conta conectada — usado pra nomear o canal de forma legível. */
  async getMe(accessToken: string): Promise<{
    userId: string;
    username?: string;
    name?: string;
    profilePictureUrl?: string;
  }> {
    const params = new URLSearchParams({
      fields: 'user_id,username,name,profile_picture_url',
      access_token: accessToken,
    });

    const res = await fetch(
      `${InstagramLoginHttpClient.GRAPH_HOST}/v21.0/me?${params.toString()}`,
      { signal: AbortSignal.timeout(InstagramLoginHttpClient.TIMEOUT_MS) },
    );

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = json?.error?.message || JSON.stringify(json).slice(0, 200);
      throw new BadRequestException(`Falha ao ler o perfil do Instagram: ${detail}`);
    }

    return {
      userId: String(json.user_id ?? json.id ?? ''),
      username: json.username,
      name: json.name,
      profilePictureUrl: json.profile_picture_url,
    };
  }

  /**
   * Renova um token de longa duração (a Meta permite refresh a partir de 24h de
   * vida e antes de expirar). Fica pronto pro cron de renovação.
   */
  async refreshLongLivedToken(
    accessToken: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const params = new URLSearchParams({
      grant_type: 'ig_refresh_token',
      access_token: accessToken,
    });

    const res = await fetch(
      `${InstagramLoginHttpClient.GRAPH_HOST}/refresh_access_token?${params.toString()}`,
      { signal: AbortSignal.timeout(InstagramLoginHttpClient.TIMEOUT_MS) },
    );

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json?.access_token) {
      const detail = json?.error?.message || JSON.stringify(json).slice(0, 200);
      throw new BadRequestException(`Falha ao renovar o token: ${detail}`);
    }

    return {
      accessToken: json.access_token,
      expiresIn: Number(json.expires_in ?? 60 * 24 * 3600),
    };
  }
}
