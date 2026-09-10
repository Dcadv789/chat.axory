import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { AiTool, ToolContext, ToolResult } from '../tool.types';

/** Recorte devolvido quando o documento é grande demais pra caber inteiro. */
const MAX_CHARS = 6000;

/**
 * Lê um documento da base de conhecimento da empresa.
 *
 * Os campos estruturados (o que a empresa faz, produtos, restrições) já vão no
 * prompt de todo agente. Documento não vai: com centenas de agentes, injetar o
 * conteúdo inteiro em toda conversa seria caro e ainda empurraria o que importa
 * pra fora do contexto.
 *
 * Em vez disso o agente recebe o ÍNDICE — título e uma linha sobre quando
 * consultar — e chama esta ferramenta quando a conversa pede. É a diferença
 * entre carregar a biblioteca inteira e saber onde procurar.
 */
@Injectable()
export class ConsultarBaseDeConhecimentoTool implements AiTool {
  readonly name = 'consultarBaseDeConhecimento';
  readonly description =
    'Lê o conteúdo de um documento da base de conhecimento da empresa (política de reembolso, tabela de preços, contrato modelo). Use quando a conversa tocar num assunto que aparece no índice de documentos do seu contexto, e ANTES de responder de memória sobre esse assunto. Busca por assunto ou por título.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['assunto'],
    properties: {
      assunto: {
        type: 'string',
        description:
          'O que você procura — título do documento ou o assunto. Ex: "reembolso", "tabela de preços".',
      },
    },
  };

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const assunto = String(input.assunto ?? '').trim();
    if (!assunto) {
      return { output: { ok: false, erro: 'Diga o que você procura.' } };
    }

    // Só documentos que este agente enxerga: os da empresa toda, mais os do
    // departamento dele. Devolver documento de outro departamento vazaria
    // conhecimento que alguém restringiu de propósito.
    const setorIds = await this.setoresDoAgente(ctx);

    const docs = await this.prisma.knowledgeDocument.findMany({
      where: {
        organizationId: ctx.organizationId,
        isActive: true,
        OR: [{ sectorId: null }, { sectorId: { in: setorIds } }],
        AND: [
          {
            OR: [
              { title: { contains: assunto, mode: 'insensitive' } },
              { summary: { contains: assunto, mode: 'insensitive' } },
              { content: { contains: assunto, mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: { id: true, title: true, summary: true, content: true },
      take: 3,
    });

    if (docs.length === 0) {
      const disponiveis = await this.prisma.knowledgeDocument.findMany({
        where: {
          organizationId: ctx.organizationId,
          isActive: true,
          OR: [{ sectorId: null }, { sectorId: { in: setorIds } }],
        },
        select: { title: true },
        take: 20,
      });
      return {
        output: {
          ok: false,
          // Devolver a lista evita o agente tentar cinco variações do mesmo
          // termo — ele vê de cara o que existe e escolhe, ou desiste.
          aviso: `Nenhum documento sobre "${assunto}".`,
          documentosDisponiveis: disponiveis.map((d) => d.title),
          instrucao:
            'Se nada aqui responde, NÃO invente: diga que vai confirmar e transfira para um humano.',
        },
      };
    }

    return {
      output: {
        ok: true,
        documentos: docs.map((d) => ({
          titulo: d.title,
          resumo: d.summary,
          conteudo:
            d.content.length > MAX_CHARS
              ? `${d.content.slice(0, MAX_CHARS)}\n\n[...documento truncado. Se a resposta estiver na parte cortada, peça ajuda humana em vez de supor.]`
              : d.content,
        })),
        instrucao:
          'Responda com base no que está escrito acima. O que não estiver no documento, não afirme.',
      },
    };
  }

  private async setoresDoAgente(ctx: ToolContext): Promise<string[]> {
    if (!ctx.agentId) return [];
    const vinculos = await this.prisma.agentSectorAgent.findMany({
      where: { agentId: ctx.agentId },
      select: { sectorId: true },
    });
    return vinculos.map((v) => v.sectorId);
  }
}
