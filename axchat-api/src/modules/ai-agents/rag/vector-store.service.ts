import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { SearchResult, SearchScope, VectorEntry } from './types';

/**
 * Store de vetores do RAG, em Postgres puro — sem pgvector.
 *
 * A extensão pgvector NÃO está disponível na instalação de Postgres em uso
 * (conferido em `pg_available_extensions`), e trocar a imagem mexeria no banco
 * compartilhado com o Axdeal. Então o embedding é gravado como
 * `double precision[]` e a similaridade de cosseno é calculada aqui.
 *
 * Por que isso basta: a busca SEMPRE filtra por escopo (agente/contato) antes
 * de calcular, então o conjunto que chega ao cálculo é de dezenas a centenas de
 * vetores — não a tabela inteira. Um cosseno de 1536 dimensões é ~1536
 * multiplicações; mil deles saem em poucos milissegundos.
 *
 * Quando trocar por pgvector: se o conjunto POR ESCOPO passar de ~10 mil
 * vetores. A interface pública desta classe não muda — é troca interna.
 */
@Injectable()
export class VectorStoreService {
  private readonly logger = new Logger(VectorStoreService.name);

  /**
   * Teto de candidatos carregados numa busca. Protege memória caso um escopo
   * cresça demais; pega os mais recentes, que é o que interessa.
   */
  private static readonly MAX_CANDIDATES = 5_000;

  constructor(private readonly prisma: PrismaService) {}

  /** Insere ou atualiza — reindexar a mesma origem sobrescreve, não duplica. */
  async upsert(entry: VectorEntry): Promise<void> {
    const data = {
      ownerType: entry.ownerType,
      ownerId: entry.ownerId,
      conversationId: entry.conversationId ?? null,
      agentId: entry.agentId ?? null,
      contactId: entry.contactId ?? null,
      content: entry.content,
      embedding: entry.embedding,
      metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
    };

    await this.prisma.aiVectorEntry.upsert({
      where: { id: entry.id },
      create: { id: entry.id, ...data },
      update: data,
    });
  }

  async upsertMany(entries: VectorEntry[]): Promise<void> {
    for (const entry of entries) {
      await this.upsert(entry);
    }
  }

  /**
   * Busca por similaridade de cosseno.
   *
   * `conversationId` no escopo é opcional DE PROPÓSITO: o objetivo do RAG é
   * lembrar do que saiu da janela — inclusive de conversas anteriores do mesmo
   * contato. Filtrar pela conversa atual anularia justamente esse ganho.
   */
  async search(
    queryVector: number[],
    scope: SearchScope,
    k = 5,
    minScore = 0.7,
  ): Promise<SearchResult[]> {
    if (!queryVector.length) return [];

    const where: Prisma.AiVectorEntryWhereInput = {};
    if (scope.agentId) where.agentId = scope.agentId;
    if (scope.contactId) where.contactId = scope.contactId;
    if (scope.conversationId) where.conversationId = scope.conversationId;
    if (scope.ownerType && scope.ownerType !== 'any') {
      where.ownerType = scope.ownerType;
    }

    const candidates = await this.prisma.aiVectorEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: VectorStoreService.MAX_CANDIDATES,
    });

    if (!candidates.length) return [];

    const queryNorm = this.norm(queryVector);
    if (queryNorm === 0) return [];

    const scored: SearchResult[] = [];
    for (const row of candidates) {
      // Dimensões diferentes = embedding de outro modelo. Ignora em vez de
      // pontuar errado (acontece se o modelo de embedding mudar).
      if (row.embedding.length !== queryVector.length) continue;

      const score = this.cosine(queryVector, row.embedding, queryNorm);
      if (score < minScore) continue;

      scored.push({
        entry: {
          id: row.id,
          ownerType: row.ownerType as VectorEntry['ownerType'],
          ownerId: row.ownerId,
          conversationId: row.conversationId ?? undefined,
          agentId: row.agentId ?? undefined,
          contactId: row.contactId ?? undefined,
          content: row.content,
          embedding: [], // a busca omite o vetor cru — só ocuparia banda
          metadata: (row.metadata ?? {}) as Record<string, any>,
          createdAt: row.createdAt.toISOString(),
        },
        score,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.aiVectorEntry.deleteMany({ where: { id } });
  }

  /** Remove tudo que veio de uma origem (ex.: um fato apagado lá na frente). */
  async deleteByOwner(
    ownerType: VectorEntry['ownerType'],
    ownerId: string,
  ): Promise<void> {
    await this.prisma.aiVectorEntry.deleteMany({ where: { ownerType, ownerId } });
  }

  async count(scope: SearchScope = {}): Promise<number> {
    const where: Prisma.AiVectorEntryWhereInput = {};
    if (scope.agentId) where.agentId = scope.agentId;
    if (scope.contactId) where.contactId = scope.contactId;
    if (scope.conversationId) where.conversationId = scope.conversationId;
    if (scope.ownerType && scope.ownerType !== 'any') {
      where.ownerType = scope.ownerType;
    }
    return this.prisma.aiVectorEntry.count({ where });
  }

  private norm(v: number[]): number {
    let sum = 0;
    for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
    return Math.sqrt(sum);
  }

  /**
   * Cosseno entre dois vetores. Recebe a norma da query pronta porque ela é a
   * mesma para todos os candidatos — recalcular por linha seria desperdício.
   */
  private cosine(query: number[], target: number[], queryNorm: number): number {
    let dot = 0;
    let targetSum = 0;
    for (let i = 0; i < query.length; i++) {
      dot += query[i] * target[i];
      targetSum += target[i] * target[i];
    }
    const targetNorm = Math.sqrt(targetSum);
    if (targetNorm === 0) return 0;
    return dot / (queryNorm * targetNorm);
  }
}
