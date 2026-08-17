import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

/** O que o adapter extrai do `messaging_referral` da Meta. */
export interface OrigemDoLead {
  adId?: string;
  adTitle?: string;
  source?: string;
}

/**
 * Grava na conversa o anúncio que trouxe a pessoa.
 *
 * O dado já chegava: o `instagram.message-mapper` lê `messaging_referral` e
 * monta `{ ad: { id, title } }`. Só que ele virava texto numa mensagem de
 * sistema — "[Cliente chegou por anúncio X]" — e ninguém conseguia perguntar
 * "quantos leads o anúncio X trouxe" nem cruzar com o gasto da campanha.
 *
 * PRIMEIRO TOQUE VENCE. Uma vez gravado, não sobrescreve: o que interessa é
 * qual anúncio trouxe a pessoa, não o último em que ela clicou. Sem essa regra,
 * um cliente que volta por outro anúncio reescreveria a própria origem e a
 * atribuição do primeiro se perderia.
 */
@Injectable()
export class OrigemDoLeadService {
  private readonly logger = new Logger(OrigemDoLeadService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Extrai a origem do `replyTo` normalizado, quando houver.
   * Devolve `null` quando a mensagem não veio de anúncio — que é o caso comum.
   */
  extrair(replyTo: unknown): OrigemDoLead | null {
    if (!replyTo || typeof replyTo !== 'object') return null;
    const ad = (
      replyTo as { ad?: { id?: string; title?: string; source?: string } }
    ).ad;
    if (!ad) return null;
    if (!ad.id && !ad.title) return null;
    return { adId: ad.id, adTitle: ad.title, source: ad.source };
  }

  /**
   * Persiste, se a conversa ainda não tiver origem.
   *
   * O `updateMany` com `adId: null` no filtro é o que garante o primeiro
   * toque sem precisar ler antes: quem chegar depois não encontra linha pra
   * atualizar e não faz nada. Uma consulta, sem corrida entre webhooks
   * simultâneos.
   */
  async registrar(
    conversationId: string,
    origem: OrigemDoLead | null,
  ): Promise<void> {
    if (!origem?.adId && !origem?.adTitle) return;

    try {
      const r = await this.prisma.conversation.updateMany({
        where: { id: conversationId, adId: null },
        data: {
          adId: origem.adId ?? null,
          adTitle: origem.adTitle ?? null,
          // Sem procedência declarada, assume anúncio: é de longe o caso
          // mais comum de referral e o motivo de o campo existir.
          referralSource: origem.source ?? 'ADS',
        },
      });
      if (r.count > 0) {
        this.logger.log({
          msg: 'origem_do_lead_registrada',
          conversationId,
          adId: origem.adId,
        });
      }
    } catch (err) {
      // Atribuição é acessório: nunca pode derrubar a entrega da mensagem.
      this.logger.warn({
        msg: 'origem_do_lead_falhou',
        conversationId,
        error: (err as Error).message,
      });
    }
  }
}
