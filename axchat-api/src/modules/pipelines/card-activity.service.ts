import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export type OrigemDoMovimento =
  | { origem: 'HUMANO'; userId?: string | null }
  | { origem: 'AUTOMACAO'; automationId?: string | null }
  | { origem: 'IA'; agentId?: string | null };

interface Registro {
  cardId: string;
  tipo:
    | 'CRIADO'
    | 'MOVIDO'
    | 'GANHO'
    | 'PERDIDO'
    | 'REABERTO'
    | 'VALOR_ALTERADO'
    | 'ATRIBUIDO'
    | 'COMENTARIO';
  por: OrigemDoMovimento;
  fromStageId?: string | null;
  toStageId?: string | null;
  descricao?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Histórico do card — quem mexeu, quando e de onde para onde.
 *
 * Registra os TRÊS autores possíveis com o mesmo peso: pessoa, automação e
 * agente de IA. Um histórico que só anota pessoa mente por omissão — o card
 * pareceria ter andado sozinho, e a primeira pergunta de quem audita ("quem
 * moveu isso?") não teria resposta.
 *
 * Falha em silêncio de propósito: perder o registro é ruim, mas travar o
 * movimento do card por causa do log é pior. O que o usuário fez tem que valer.
 */
@Injectable()
export class CardActivityService {
  private readonly logger = new Logger(CardActivityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registrar(r: Registro, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma;
    try {
      await db.cardActivity.create({
        data: {
          cardId: r.cardId,
          tipo: r.tipo,
          origem: r.por.origem,
          userId: r.por.origem === 'HUMANO' ? (r.por.userId ?? null) : null,
          agentId: r.por.origem === 'IA' ? (r.por.agentId ?? null) : null,
          automationId:
            r.por.origem === 'AUTOMACAO' ? (r.por.automationId ?? null) : null,
          fromStageId: r.fromStageId ?? null,
          toStageId: r.toStageId ?? null,
          descricao: r.descricao ?? null,
          metadata: (r.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Não consegui registrar a atividade do card ${r.cardId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Linha do tempo do card, com os nomes já resolvidos — a tela não deveria
   * precisar de quatro consultas extras só pra escrever "Maria moveu".
   */
  async listar(organizationId: string, cardId: string) {
    const card = await this.prisma.card.findFirst({
      where: { id: cardId, organizationId },
      select: { id: true },
    });
    if (!card) return [];

    const atividades = await this.prisma.cardActivity.findMany({
      where: { cardId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const userIds = [...new Set(atividades.map((a) => a.userId).filter(Boolean))];
    const agentIds = [...new Set(atividades.map((a) => a.agentId).filter(Boolean))];
    const stageIds = [
      ...new Set(
        atividades.flatMap((a) => [a.fromStageId, a.toStageId]).filter(Boolean),
      ),
    ];

    const [usuarios, agentes, etapas] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds as string[] } },
            select: { id: true, name: true },
          })
        : [],
      agentIds.length
        ? this.prisma.aiAgent.findMany({
            where: { id: { in: agentIds as string[] } },
            select: { id: true, name: true },
          })
        : [],
      stageIds.length
        ? this.prisma.pipelineStage.findMany({
            where: { id: { in: stageIds as string[] } },
            select: { id: true, name: true },
          })
        : [],
    ]);

    const nomeUser = new Map(usuarios.map((u) => [u.id, u.name]));
    const nomeAgente = new Map(agentes.map((a) => [a.id, a.name]));
    const nomeEtapa = new Map(etapas.map((e) => [e.id, e.name]));

    return atividades.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      origem: a.origem,
      // "Quem" já resolvido: automação sem nome vira "Automação", que é
      // honesto — a regra pode ter sido apagada depois.
      quem:
        a.origem === 'HUMANO'
          ? (nomeUser.get(a.userId ?? '') ?? 'Alguém da equipe')
          : a.origem === 'IA'
            ? (nomeAgente.get(a.agentId ?? '') ?? 'Agente de IA')
            : 'Automação',
      de: a.fromStageId ? (nomeEtapa.get(a.fromStageId) ?? null) : null,
      para: a.toStageId ? (nomeEtapa.get(a.toStageId) ?? null) : null,
      descricao: a.descricao,
      createdAt: a.createdAt,
    }));
  }
}
