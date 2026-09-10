import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

export interface ConhecimentoDoPrompt {
  empresa: {
    whatWeDo: string | null;
    products: string | null;
    targetAudience: string | null;
    differentials: string | null;
    toneOfVoice: string | null;
    guidelines: string | null;
    restrictions: string | null;
    serviceHours: string | null;
    faq: string | null;
  } | null;
  /** Conhecimento do(s) departamento(s) deste agente. */
  departamento: Array<{ nome: string; texto: string }>;
  /** Só título e resumo — o conteúdo vem por ferramenta. */
  indiceDeDocumentos: Array<{ titulo: string; resumo: string | null }>;
}

/**
 * Monta o que a IA sabe da empresa, no recorte deste agente.
 *
 * Duas escolhas que definem o custo disso:
 *
 * 1. Documento entra como ÍNDICE, não como conteúdo. Injetar o texto inteiro
 *    em toda conversa de todo agente sairia caro e empurraria o histórico pra
 *    fora do contexto. O agente lê o índice e busca com
 *    `consultarBaseDeConhecimento` quando o assunto aparece.
 *
 * 2. O conhecimento de departamento é filtrado pelo departamento DO AGENTE.
 *    A tabela de honorários do contábil no prompt do agente de suporte é ruído
 *    caro — multiplicado por agente e por conversa.
 */
@Injectable()
export class KnowledgeParaPromptService {
  constructor(private readonly prisma: PrismaService) {}

  async carregar(
    organizationId: string,
    agentId: string,
  ): Promise<ConhecimentoDoPrompt> {
    // O agente TEM que ser desta organização. Hoje o `agentId` já chega
    // validado pelo runner, mas a garantia mora três camadas acima — e uma
    // invariante que depende de quem chama é uma invariante que um dia
    // alguém quebra ao adicionar um segundo chamador.
    const agente = await this.prisma.aiAgent.findFirst({
      where: { id: agentId, organizationId },
      select: { id: true },
    });
    if (!agente) {
      return { empresa: null, departamento: [], indiceDeDocumentos: [] };
    }

    const setorIds = (
      await this.prisma.agentSectorAgent.findMany({
        where: { agentId },
        select: { sectorId: true },
      })
    ).map((v) => v.sectorId);

    const [empresa, setores, documentos] = await Promise.all([
      this.prisma.companyKnowledge.findUnique({
        where: { organizationId },
        select: {
          whatWeDo: true,
          products: true,
          targetAudience: true,
          differentials: true,
          toneOfVoice: true,
          guidelines: true,
          restrictions: true,
          serviceHours: true,
          faq: true,
        },
      }),
      setorIds.length
        ? this.prisma.agentSector.findMany({
            where: {
              id: { in: setorIds },
              organizationId,
              knowledge: { not: null },
            },
            select: { name: true, knowledge: true },
          })
        : Promise.resolve(
            [] as Array<{ name: string; knowledge: string | null }>,
          ),
      this.prisma.knowledgeDocument.findMany({
        where: {
          organizationId,
          isActive: true,
          OR: [{ sectorId: null }, { sectorId: { in: setorIds } }],
        },
        select: { title: true, summary: true },
        orderBy: { title: 'asc' },
        // Teto de propósito: uma base com 200 documentos encheria o prompt só
        // com o índice. Passando disso, a empresa precisa de busca semântica,
        // não de uma lista maior.
        take: 40,
      }),
    ]);

    return {
      empresa,
      departamento: setores
        .filter((s) => s.knowledge?.trim())
        .map((s) => ({ nome: s.name, texto: s.knowledge as string })),
      indiceDeDocumentos: documentos.map((d) => ({
        titulo: d.title,
        resumo: d.summary,
      })),
    };
  }
}
