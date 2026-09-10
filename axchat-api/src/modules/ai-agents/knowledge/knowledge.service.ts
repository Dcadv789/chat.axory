import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  UpsertCompanyKnowledgeDto,
  UpsertKnowledgeDocumentDto,
} from './knowledge.dto';

/**
 * Base de conhecimento da empresa — o que a IA sabe do negócio.
 *
 * Três níveis, todos isolados por organização:
 *
 *   empresa      → campos estruturados, valem pra todos os agentes
 *   departamento → texto extra, só pros agentes daquele departamento
 *   documentos   → o que nenhum formulário prevê
 *
 * A separação em campos (em vez de um texto só) é o que permite dar pesos
 * diferentes: "restrições" é lido como limite duro, "diretrizes" como
 * orientação. Num parágrafo único o modelo trata os dois igual.
 */
@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Conhecimento da empresa ──────────────────────────────

  get(organizationId: string) {
    return this.prisma.companyKnowledge.findUnique({
      where: { organizationId },
    });
  }

  upsert(organizationId: string, dto: UpsertCompanyKnowledgeDto) {
    const dados = {
      whatWeDo: dto.whatWeDo?.trim() || null,
      products: dto.products?.trim() || null,
      targetAudience: dto.targetAudience?.trim() || null,
      differentials: dto.differentials?.trim() || null,
      toneOfVoice: dto.toneOfVoice?.trim() || null,
      guidelines: dto.guidelines?.trim() || null,
      restrictions: dto.restrictions?.trim() || null,
      serviceHours: dto.serviceHours?.trim() || null,
      faq: dto.faq?.trim() || null,
    };
    return this.prisma.companyKnowledge.upsert({
      where: { organizationId },
      create: { organizationId, ...dados },
      update: dados,
    });
  }

  // ─── Conhecimento por departamento ────────────────────────

  async setSectorKnowledge(
    organizationId: string,
    sectorId: string,
    knowledge: string | null,
  ) {
    const existe = await this.prisma.agentSector.findFirst({
      where: { id: sectorId, organizationId },
      select: { id: true },
    });
    if (!existe) throw new NotFoundException('Departamento não encontrado.');

    return this.prisma.agentSector.update({
      where: { id: sectorId },
      data: { knowledge: knowledge?.trim() || null },
    });
  }

  // ─── Documentos ───────────────────────────────────────────

  listDocuments(organizationId: string, incluirInativos = false) {
    return this.prisma.knowledgeDocument.findMany({
      where: {
        organizationId,
        ...(incluirInativos ? {} : { isActive: true }),
      },
      orderBy: [{ isActive: 'desc' }, { title: 'asc' }],
      include: { sector: { select: { id: true, name: true } } },
    });
  }

  getDocument(organizationId: string, id: string) {
    return this.prisma.knowledgeDocument.findFirst({
      where: { id, organizationId },
      include: { sector: { select: { id: true, name: true } } },
    });
  }

  async createDocument(
    organizationId: string,
    dto: UpsertKnowledgeDocumentDto,
  ) {
    await this.assertSectorBelongs(organizationId, dto.sectorId);
    return this.prisma.knowledgeDocument.create({
      data: {
        organizationId,
        title: dto.title.trim(),
        summary: dto.summary?.trim() || null,
        content: dto.content.trim(),
        sectorId: dto.sectorId || null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateDocument(
    organizationId: string,
    id: string,
    dto: UpsertKnowledgeDocumentDto,
  ) {
    const doc = await this.prisma.knowledgeDocument.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado.');
    await this.assertSectorBelongs(organizationId, dto.sectorId);

    return this.prisma.knowledgeDocument.update({
      where: { id },
      data: {
        title: dto.title.trim(),
        summary: dto.summary?.trim() || null,
        content: dto.content.trim(),
        sectorId: dto.sectorId || null,
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async removeDocument(organizationId: string, id: string) {
    const doc = await this.prisma.knowledgeDocument.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado.');
    await this.prisma.knowledgeDocument.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Documento de um departamento de OUTRA organização vazaria conhecimento
   * entre tenants pela porta dos fundos — o id vem do corpo da requisição.
   */
  private async assertSectorBelongs(
    organizationId: string,
    sectorId?: string | null,
  ) {
    if (!sectorId) return;
    const existe = await this.prisma.agentSector.findFirst({
      where: { id: sectorId, organizationId },
      select: { id: true },
    });
    if (!existe) {
      throw new NotFoundException(
        'Departamento não encontrado nesta organização.',
      );
    }
  }
}
