import { Injectable, Logger } from '@nestjs/common';
import { Channel } from '@prisma/client';
import { PrismaService } from '../../../../database/prisma.service';
import { AiTool, ToolContext, ToolResult } from '../tool.types';
import {
  ThreadsHttpClient,
  ThreadsPublishInput,
} from '../../../channel-hub/adapters/threads/threads.http-client';

/**
 * Resolve o canal Threads da org (o mais recente ativo). Todas as tools do
 * Threads dependem de um canal conectado — a credencial vive no channel.config.
 */
async function resolveThreadsChannel(
  prisma: PrismaService,
  organizationId: string,
): Promise<Channel | null> {
  return prisma.channel.findFirst({
    where: {
      organizationId,
      type: 'THREADS',
      deletedAt: null,
      isActive: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

const NO_CHANNEL = {
  ok: false,
  error: 'threads_channel_missing',
  message:
    'Nenhum canal do Threads conectado nesta org. Conecte em Configurações → Canais → Threads antes de publicar.',
};

/** Publica um post no Threads (texto/imagem/vídeo/carrossel). */
@Injectable()
export class PublishThreadsPostTool implements AiTool {
  private readonly logger = new Logger(PublishThreadsPostTool.name);
  readonly name = 'publishThreadsPost';
  readonly description =
    'Publica um post no Threads da org. Suporta texto puro (mediaType=TEXT), imagem (IMAGE + imageUrl), vídeo (VIDEO + videoUrl) e carrossel (CAROUSEL + children, 2 a 20 itens). URLs de mídia devem ser públicas (ex.: a arte que a Orla gerou). Texto até 500 caracteres. IMPORTANTE: confirme com o usuário antes de publicar, a não ser que ele já tenha dado OK explícito.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    properties: {
      mediaType: { type: 'string', enum: ['TEXT', 'IMAGE', 'VIDEO', 'CAROUSEL'] },
      text: { type: 'string', description: 'Legenda/texto do post (até 500 caracteres)' },
      imageUrl: { type: 'string', description: 'URL pública da imagem (mediaType=IMAGE)' },
      videoUrl: { type: 'string', description: 'URL pública do vídeo (mediaType=VIDEO)' },
      children: {
        type: 'array',
        description: '2 a 20 itens do carrossel (mediaType=CAROUSEL)',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            mediaType: { type: 'string', enum: ['IMAGE', 'VIDEO'] },
            imageUrl: { type: 'string' },
            videoUrl: { type: 'string' },
          },
          required: ['mediaType'],
        },
      },
    },
    required: ['mediaType'],
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly threads: ThreadsHttpClient,
  ) {}

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const channel = await resolveThreadsChannel(this.prisma, ctx.organizationId);
    if (!channel) return { output: NO_CHANNEL };
    try {
      const result = await this.threads.publish(channel, input as unknown as ThreadsPublishInput);
      return {
        output: {
          ok: true,
          postId: result.id,
          message: `Post publicado no Threads (id ${result.id}).`,
        },
      };
    } catch (err: any) {
      this.logger.warn(`publishThreadsPost falhou: ${err?.message ?? err}`);
      return { output: { ok: false, error: 'publish_failed', message: err?.message ?? String(err) } };
    }
  }
}

/** Responde um post/resposta no Threads. */
@Injectable()
export class ReplyToThreadsPostTool implements AiTool {
  readonly name = 'replyToThreadsPost';
  readonly description =
    'Responde um post ou uma resposta no Threads. Passe o replyToId (id do post/resposta que está respondendo) e o texto. Use pra interagir com a comunidade dos posts.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    properties: {
      replyToId: { type: 'string', description: 'ID do post/resposta que está sendo respondido' },
      text: { type: 'string' },
    },
    required: ['replyToId', 'text'],
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly threads: ThreadsHttpClient,
  ) {}

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const channel = await resolveThreadsChannel(this.prisma, ctx.organizationId);
    if (!channel) return { output: NO_CHANNEL };
    try {
      const result = await this.threads.reply(
        channel,
        String(input.replyToId),
        String(input.text),
      );
      return { output: { ok: true, replyId: result.id } };
    } catch (err: any) {
      return { output: { ok: false, error: 'reply_failed', message: err?.message ?? String(err) } };
    }
  }
}

/** Lista as respostas de um post do Threads (moderação/leitura). */
@Injectable()
export class ListThreadsRepliesTool implements AiTool {
  readonly name = 'listThreadsReplies';
  readonly description =
    'Lista as respostas de um post do Threads (id do post em mediaId). Use pra ler as conversas dos posts antes de responder ou moderar.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    properties: {
      mediaId: { type: 'string', description: 'ID do post do Threads' },
    },
    required: ['mediaId'],
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly threads: ThreadsHttpClient,
  ) {}

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const channel = await resolveThreadsChannel(this.prisma, ctx.organizationId);
    if (!channel) return { output: NO_CHANNEL };
    try {
      const replies = await this.threads.listReplies(channel, String(input.mediaId));
      return { output: { ok: true, count: replies.length, replies } };
    } catch (err: any) {
      return { output: { ok: false, error: 'list_replies_failed', message: err?.message ?? String(err) } };
    }
  }
}

/** Oculta/reexibe uma resposta (moderação). */
@Injectable()
export class HideThreadsReplyTool implements AiTool {
  readonly name = 'hideThreadsReply';
  readonly description =
    'Oculta (hide=true) ou reexibe (hide=false) uma resposta no Threads. Use pra moderar comentários indesejados.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    properties: {
      replyId: { type: 'string', description: 'ID da resposta a moderar' },
      hide: { type: 'boolean' },
    },
    required: ['replyId', 'hide'],
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly threads: ThreadsHttpClient,
  ) {}

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const channel = await resolveThreadsChannel(this.prisma, ctx.organizationId);
    if (!channel) return { output: NO_CHANNEL };
    try {
      await this.threads.hideReply(channel, String(input.replyId), Boolean(input.hide));
      return { output: { ok: true } };
    } catch (err: any) {
      return { output: { ok: false, error: 'hide_reply_failed', message: err?.message ?? String(err) } };
    }
  }
}

/** Insights de um post (mediaId) ou do perfil (sem mediaId). */
@Injectable()
export class GetThreadsInsightsTool implements AiTool {
  readonly name = 'getThreadsInsights';
  readonly description =
    'Métricas do Threads. Com mediaId: performance de UM post (views, likes, replies, reposts, quotes, shares). Sem mediaId: métricas do PERFIL (inclui followers_count). Use pra medir o desempenho e fechar o ciclo.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    properties: {
      mediaId: { type: 'string', description: 'ID do post (omita para métricas do perfil)' },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly threads: ThreadsHttpClient,
  ) {}

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const channel = await resolveThreadsChannel(this.prisma, ctx.organizationId);
    if (!channel) return { output: NO_CHANNEL };
    try {
      const mediaId = input.mediaId ? String(input.mediaId) : undefined;
      const insights = mediaId
        ? await this.threads.getMediaInsights(channel, mediaId)
        : await this.threads.getUserInsights(channel);
      return { output: { ok: true, scope: mediaId ? 'post' : 'perfil', insights } };
    } catch (err: any) {
      return { output: { ok: false, error: 'insights_failed', message: err?.message ?? String(err) } };
    }
  }
}
