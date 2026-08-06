import { Injectable, Logger } from '@nestjs/common';
import {
  ActionContext,
  ActionExecutionResult,
  ActionHandler,
} from '../action.types';
import { InstagramCommentPayload } from '../../automations.types';
import { InstagramHttpClient } from '../../../channel-hub/adapters/instagram/instagram.http-client';

interface ReplyInstagramCommentParams {
  /** Texto da resposta. Aceita {{usuario}} e {{comentario}}. */
  body: string;
}

/** A Meta corta comentários em 2200 caracteres. */
const LIMITE = 2200;

/**
 * Publica uma resposta no próprio comentário do Instagram.
 *
 * Só faz sentido no gatilho INSTAGRAM_COMMENT — é de lá que vem o `commentId`.
 * Em qualquer outro gatilho a ação falha com `invalid_params` em vez de tentar
 * adivinhar em qual comentário responder.
 *
 * Diferente de `send_message` (que manda DM privada), aqui o texto vai a
 * público, embaixo do post. Por isso não há retry automático: republicar por
 * engano deixa duas respostas visíveis pra todo mundo. A dedup do outbox já
 * protege contra reentrega da Meta.
 */
@Injectable()
export class ReplyInstagramCommentHandler implements ActionHandler {
  private readonly logger = new Logger(ReplyInstagramCommentHandler.name);

  readonly type = 'reply_instagram_comment' as const;
  // Ação de comunicação: falhar aqui não deve impedir as ações de estado
  // (etiquetar, atribuir) que vierem depois na mesma automação.
  readonly continueOnErrorDefault = true;

  constructor(private readonly instagram: InstagramHttpClient) {}

  validateParams(params: Record<string, unknown>): void {
    const body = params.body;
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      throw new Error(
        'reply_instagram_comment: "body" é obrigatório (texto não vazio)',
      );
    }
    if (body.length > LIMITE) {
      throw new Error(
        `reply_instagram_comment: "body" passa do limite do Instagram (${LIMITE} caracteres)`,
      );
    }
  }

  async execute(
    params: Record<string, unknown>,
    ctx: ActionContext,
  ): Promise<ActionExecutionResult> {
    const p = params as unknown as ReplyInstagramCommentParams;
    const { organizationId, payload, prisma } = ctx;
    const comentario = payload as InstagramCommentPayload;

    if (!comentario.commentId) {
      return {
        ok: false,
        errorCode: 'invalid_params',
        errorMessage:
          'reply_instagram_comment só funciona no gatilho "Comentário do Instagram"',
      };
    }

    const canal = await prisma.channel.findFirst({
      where: {
        id: comentario.channelId,
        organizationId,
        deletedAt: null,
        isActive: true,
      },
    });
    if (!canal) {
      return {
        ok: false,
        errorCode: 'no_active_channel',
        errorMessage: 'canal do Instagram não está ativo',
      };
    }

    const texto = this.render(p.body, comentario);

    try {
      const res = await this.instagram.replyToComment(
        canal,
        comentario.commentId,
        texto,
      );
      return {
        ok: true,
        output: { replyId: res?.id, commentId: comentario.commentId },
      };
    } catch (err) {
      this.logger.warn(
        `Falha ao responder o comentário ${comentario.commentId}: ${(err as Error).message}`,
      );
      return {
        ok: false,
        errorCode: 'external_error',
        errorMessage: (err as Error).message,
      };
    }
  }

  /**
   * Substitui as variáveis do texto. Só duas, de propósito: quanto mais
   * variável, mais chance de publicar `{{algo}}` cru no perfil do cliente.
   */
  private render(template: string, evento: InstagramCommentPayload): string {
    const usuario = evento.authorUsername ? `@${evento.authorUsername}` : '';
    return template
      .replace(/\{\{\s*usuario\s*\}\}/gi, usuario)
      .replace(/\{\{\s*comentario\s*\}\}/gi, evento.body ?? '')
      .trim()
      .slice(0, LIMITE);
  }
}
