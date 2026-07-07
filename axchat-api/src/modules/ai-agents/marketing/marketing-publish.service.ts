import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
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
    input: { caption?: string; imageUrl?: string; videoUrl?: string },
  ): Promise<{ ok: true; mediaId: string }> {
    const [igUserId, token] = await Promise.all([
      this.resolve(orgId, 'IG_USER_ID'),
      this.resolve(orgId, 'IG_ACCESS_TOKEN'),
    ]);
    if (!igUserId || !token) {
      throw new BadRequestException(
        'Instagram não conectado. Conecte um canal Instagram (Login Facebook) ou configure IG_USER_ID/IG_ACCESS_TOKEN em Integrações.',
      );
    }
    if (!input.imageUrl && !input.videoUrl) {
      throw new BadRequestException('Um post do Instagram precisa de uma imagem ou vídeo.');
    }

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
