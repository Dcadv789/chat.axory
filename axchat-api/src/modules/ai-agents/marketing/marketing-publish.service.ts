import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { MarketingCredentialsService } from './marketing-credentials.service';
import {
  ThreadsHttpClient,
  ThreadsPublishInput,
} from '../../channel-hub/adapters/threads/threads.http-client';

const GRAPH = 'https://graph.facebook.com/v25.0';

/**
 * Publicação direta pelo painel de Marketing (ação do dono, não da crew).
 * Instagram: usa IG_USER_ID/IG_ACCESS_TOKEN da org (mesmo caminho das skills).
 * Threads: publica pelo canal Threads conectado. Registra em MarketingActivity.
 */
@Injectable()
export class MarketingPublishService {
  private readonly logger = new Logger(MarketingPublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly threads: ThreadsHttpClient,
    private readonly credentials: MarketingCredentialsService,
  ) {}

  private async resolve(orgId: string, key: string): Promise<string | null> {
    const secret = await this.prisma.organizationSecret.findFirst({
      where: { organizationId: orgId, key },
      select: { value: true },
    });
    return secret?.value ?? this.config.get<string>(key) ?? null;
  }

  private async logActivity(
    orgId: string,
    channel: 'INSTAGRAM' | 'THREADS',
    title: string,
    externalId?: string,
  ) {
    try {
      await this.prisma.marketingActivity.create({
        data: {
          organizationId: orgId,
          action: 'POST_PUBLISHED',
          channel,
          status: 'OK',
          title,
          externalId: externalId ?? null,
        },
      });
    } catch {
      /* fire-and-forget */
    }
  }

  /**
   * Publica no Instagram (feed). O IG exige mídia — imagem (imageUrl) ou vídeo
   * (videoUrl, Reels). Fluxo de 2 passos: cria o container, publica. Vídeo
   * aguarda o processamento (FINISHED) antes de publicar.
   */
  async publishInstagram(
    orgId: string,
    input: {
      caption?: string;
      imageUrl?: string;
      videoUrl?: string;
      /** 2 a 10 URLs (imagem e/ou vídeo) — publica como carrossel. */
      carouselUrls?: string[];
      /** Conta escolhida no painel; sem ela vale a da organização. */
      channelId?: string;
    },
  ): Promise<{ ok: true; mediaId: string }> {
    const { igUserId, token } = await this.credentials.instagram(
      orgId,
      input.channelId,
    );

    const itens = (input.carouselUrls ?? [])
      .map((u) => u.trim())
      .filter(Boolean);
    if (itens.length > 0) {
      return this.publishCarousel(orgId, igUserId, token, itens, input.caption);
    }

    if (!input.imageUrl && !input.videoUrl) {
      throw new BadRequestException('Um post do Instagram precisa de uma imagem ou vídeo.');
    }

    // A Meta limita 100 posts publicados por API a cada 24h por conta. Estourar
    // devolve um erro genérico no media_publish, depois do container já criado —
    // com agente publicando sozinho, isso vira falha sem explicação. Checar antes
    // custa uma chamada e devolve uma mensagem que o dono entende.
    await this.assertPublishingQuota(igUserId, token);

    // 1) Cria o container.
    const params = new URLSearchParams();
    if (input.caption) params.set('caption', input.caption);
    if (input.videoUrl) {
      params.set('media_type', 'REELS');
      params.set('video_url', input.videoUrl);
    } else {
      params.set('image_url', input.imageUrl!);
    }
    params.set('access_token', token);

    const create = await this.igFetch(
      `${GRAPH}/${igUserId}/media`,
      params,
      'criar container',
    );
    const creationId = create?.id;
    if (!creationId) throw new BadRequestException('Instagram não retornou o container.');

    // 2) Vídeo precisa processar antes de publicar. Poll com teto (~60s).
    if (input.videoUrl) await this.waitInstagramReady(creationId, token);

    // 3) Publica.
    const pubParams = new URLSearchParams({ creation_id: String(creationId), access_token: token });
    const pub = await this.igFetch(
      `${GRAPH}/${igUserId}/media_publish`,
      pubParams,
      'publicar',
    );
    if (!pub?.id) throw new BadRequestException('Instagram não confirmou a publicação.');

    await this.logActivity(orgId, 'INSTAGRAM', `Post publicado no Instagram`, String(pub.id));
    this.logger.log(`Instagram post publicado: ${pub.id} (org ${orgId})`);
    return { ok: true, mediaId: String(pub.id) };
  }

  /**
   * Consulta a cota de publicação da conta (`/content_publishing_limit`) e
   * barra antes de gastar upload. Se a consulta em si falhar, segue em frente:
   * não vale bloquear uma publicação legítima por causa de um check auxiliar.
   */
  private async assertPublishingQuota(igUserId: string, token: string): Promise<void> {
    let usados: number | undefined;
    let total: number | undefined;
    try {
      const res = await fetch(
        `${GRAPH}/${encodeURIComponent(igUserId)}/content_publishing_limit` +
          `?fields=quota_usage,config&access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) return;
      const json: any = await res.json();
      const linha = json?.data?.[0];
      usados = linha?.quota_usage;
      total = linha?.config?.quota_total;
    } catch {
      return; // check é best-effort
    }

    if (typeof usados === 'number' && typeof total === 'number' && usados >= total) {
      throw new BadRequestException(
        `Limite de publicação do Instagram atingido: ${usados}/${total} posts nas últimas 24h. ` +
          'A Meta libera conforme os posts antigos saem da janela — tente mais tarde.',
      );
    }
  }

  /**
   * Carrossel: 3 passos. Um container por item (`is_carousel_item=true`), um
   * container CAROUSEL agrupando os ids, e a publicação.
   *
   * Vídeo dentro do carrossel processa de forma assíncrona igual ao Reels, e o
   * container do carrossel só aceita filhos prontos — por isso cada vídeo
   * espera o FINISHED antes de seguir.
   */
  private async publishCarousel(
    orgId: string,
    igUserId: string,
    token: string,
    urls: string[],
    caption?: string,
  ): Promise<{ ok: true; mediaId: string }> {
    if (urls.length < 2 || urls.length > 10) {
      throw new BadRequestException(
        `Um carrossel do Instagram tem de 2 a 10 itens — você mandou ${urls.length}.`,
      );
    }
    await this.assertPublishingQuota(igUserId, token);

    // 1) Um container por item.
    const filhos: string[] = [];
    for (const [i, url] of urls.entries()) {
      const ehVideo = /\.(mp4|mov|m4v)(\?|$)/i.test(url);
      const params = new URLSearchParams();
      params.set('is_carousel_item', 'true');
      if (ehVideo) {
        params.set('media_type', 'VIDEO');
        params.set('video_url', url);
      } else {
        params.set('image_url', url);
      }
      params.set('access_token', token);

      const item = await this.igFetch(
        `${GRAPH}/${igUserId}/media`,
        params,
        `criar item ${i + 1} do carrossel`,
      );
      if (!item?.id) {
        throw new BadRequestException(
          `Instagram não retornou o container do item ${i + 1}.`,
        );
      }
      if (ehVideo) await this.waitInstagramReady(String(item.id), token);
      filhos.push(String(item.id));
    }

    // 2) Container do carrossel.
    const carrossel = new URLSearchParams();
    carrossel.set('media_type', 'CAROUSEL');
    carrossel.set('children', filhos.join(','));
    if (caption) carrossel.set('caption', caption);
    carrossel.set('access_token', token);

    const container = await this.igFetch(
      `${GRAPH}/${igUserId}/media`,
      carrossel,
      'criar o carrossel',
    );
    if (!container?.id) {
      throw new BadRequestException('Instagram não retornou o carrossel.');
    }

    // 3) Publica.
    const pub = await this.igFetch(
      `${GRAPH}/${igUserId}/media_publish`,
      new URLSearchParams({
        creation_id: String(container.id),
        access_token: token,
      }),
      'publicar o carrossel',
    );
    if (!pub?.id) {
      throw new BadRequestException('Instagram não confirmou a publicação.');
    }

    await this.logActivity(
      orgId,
      'INSTAGRAM',
      `Carrossel publicado (${filhos.length} itens)`,
      String(pub.id),
    );
    this.logger.log(
      `Instagram carrossel publicado: ${pub.id} (${filhos.length} itens, org ${orgId})`,
    );
    return { ok: true, mediaId: String(pub.id) };
  }

  private async igFetch(url: string, params: URLSearchParams, ctx: string): Promise<any> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(30_000),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new BadRequestException(`Instagram (${ctx}): ${json?.error?.message ?? `HTTP ${res.status}`}`);
    }
    return json;
  }

  private async waitInstagramReady(creationId: string, token: string): Promise<void> {
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch(
          `${GRAPH}/${creationId}?fields=status_code&access_token=${encodeURIComponent(token)}`,
          { signal: AbortSignal.timeout(15_000) },
        );
        const json: any = await res.json();
        if (json?.status_code === 'FINISHED') return;
        if (json?.status_code === 'ERROR') {
          throw new BadRequestException('Instagram: processamento do vídeo falhou.');
        }
      } catch {
        /* segue tentando */
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  /** Publica no Threads pelo canal conectado (texto/imagem/vídeo/carrossel). */
  async publishThreads(
    orgId: string,
    input: ThreadsPublishInput,
  ): Promise<{ ok: true; postId: string }> {
    const channel = await this.prisma.channel.findFirst({
      where: { organizationId: orgId, type: 'THREADS', deletedAt: null, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!channel) {
      throw new BadRequestException(
        'Nenhum canal do Threads conectado. Conecte em Configurações → Canais → Threads.',
      );
    }
    const result = await this.threads.publish(channel, input);
    await this.logActivity(orgId, 'THREADS', 'Post publicado no Threads', result.id);
    this.logger.log(`Threads post publicado: ${result.id} (org ${orgId})`);
    return { ok: true, postId: result.id };
  }
}
