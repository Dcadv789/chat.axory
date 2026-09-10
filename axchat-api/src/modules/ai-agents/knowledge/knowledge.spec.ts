import { NotFoundException } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeParaPromptService } from './knowledge-para-prompt.service';

/**
 * Duas coisas aqui não podem quebrar nunca:
 *
 * 1. ISOLAMENTO POR TENANT. O `sectorId` vem do corpo da requisição — se
 *    ninguém checar de quem ele é, uma empresa anexa documento ao departamento
 *    de outra e o conhecimento vaza pelo prompt do agente alheio.
 *
 * 2. O RECORTE DO AGENTE. Documento de departamento só pode aparecer pra quem é
 *    daquele departamento; quem restringiu, restringiu de propósito.
 */
describe('Base de conhecimento', () => {
  describe('isolamento entre empresas', () => {
    function montar() {
      const prisma = {
        agentSector: { findFirst: jest.fn().mockResolvedValue(null) },
        knowledgeDocument: { create: jest.fn() },
      } as any;
      return { service: new KnowledgeService(prisma), prisma };
    }

    it('recusa documento apontando pra departamento de outra empresa', async () => {
      const { service, prisma } = montar();

      await expect(
        service.createDocument('org-1', {
          title: 'Tabela de preços',
          content: 'conteúdo qualquer',
          sectorId: 'setor-de-outra-empresa',
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.knowledgeDocument.create).not.toHaveBeenCalled();
    });

    it('documento sem departamento não precisa de checagem', async () => {
      const { service, prisma } = montar();
      prisma.knowledgeDocument.create.mockResolvedValue({ id: 'doc-1' });

      await service.createDocument('org-1', {
        title: 'Política de reembolso',
        content: 'conteúdo qualquer',
      } as any);

      expect(prisma.agentSector.findFirst).not.toHaveBeenCalled();
      expect(prisma.knowledgeDocument.create).toHaveBeenCalled();
    });
  });

  describe('recorte do agente no prompt', () => {
    function montar(setorIds: string[], agenteExiste = true) {
      const prisma = {
        aiAgent: {
          findFirst: jest
            .fn()
            .mockResolvedValue(agenteExiste ? { id: 'ag-1' } : null),
        },
        agentSectorAgent: {
          findMany: jest
            .fn()
            .mockResolvedValue(setorIds.map((sectorId) => ({ sectorId }))),
        },
        companyKnowledge: { findUnique: jest.fn().mockResolvedValue(null) },
        agentSector: { findMany: jest.fn().mockResolvedValue([]) },
        knowledgeDocument: { findMany: jest.fn().mockResolvedValue([]) },
      } as any;
      return { service: new KnowledgeParaPromptService(prisma), prisma };
    }

    it('traz documento da empresa toda MAIS o do departamento do agente', async () => {
      const { service, prisma } = montar(['setor-contabil']);

      await service.carregar('org-1', 'ag-1');

      const where = prisma.knowledgeDocument.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { sectorId: null },
        { sectorId: { in: ['setor-contabil'] } },
      ]);
      expect(where.isActive).toBe(true);
    });

    it('agente sem departamento vê só o que é da empresa toda', async () => {
      const { service, prisma } = montar([]);

      await service.carregar('org-1', 'ag-1');

      const where = prisma.knowledgeDocument.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([{ sectorId: null }, { sectorId: { in: [] } }]);
    });

    it('limita o índice: 200 documentos encheriam o prompt só de títulos', async () => {
      const { service, prisma } = montar([]);

      await service.carregar('org-1', 'ag-1');

      expect(prisma.knowledgeDocument.findMany.mock.calls[0][0].take).toBe(40);
    });

    it('pede só título e resumo — conteúdo não entra no prompt', async () => {
      const { service, prisma } = montar([]);

      await service.carregar('org-1', 'ag-1');

      const select = prisma.knowledgeDocument.findMany.mock.calls[0][0].select;
      expect(select).toEqual({ title: true, summary: true });
      expect(select.content).toBeUndefined();
    });

    it('agente de outra organização não recebe conhecimento nenhum', async () => {
      const { service, prisma } = montar(['s1'], false);

      const r = await service.carregar('org-1', 'agente-de-outro-tenant');

      // Devolve vazio em vez de seguir com os setores do outro tenant.
      expect(r).toEqual({
        empresa: null,
        departamento: [],
        indiceDeDocumentos: [],
      });
      expect(prisma.knowledgeDocument.findMany).not.toHaveBeenCalled();
    });

    it('descarta departamento com conhecimento em branco', async () => {
      const { service, prisma } = montar(['s1', 's2']);
      prisma.agentSector.findMany.mockResolvedValue([
        { name: 'Contábil', knowledge: 'Honorários a partir de R$ 500.' },
        { name: 'Jurídico', knowledge: '   ' },
      ]);

      const r = await service.carregar('org-1', 'ag-1');

      expect(r.departamento).toEqual([
        { nome: 'Contábil', texto: 'Honorários a partir de R$ 500.' },
      ]);
    });
  });
});
