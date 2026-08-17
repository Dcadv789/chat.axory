import { BadRequestException } from '@nestjs/common';
import { AgentsService } from './agents.service';

/**
 * A fronteira da frente é o ponto do sistema em que "equipe interna" deixa de
 * ser convenção e vira garantia. Estes testes existem porque o furo anterior
 * era silencioso: agente de operação vinculado ao canal do cliente não dava
 * erro nenhum — só ficava lá, aparecendo na tela e nunca respondendo.
 */
describe('Fronteira da frente (canal ↔ agente)', () => {
  const canal = (sector: string, name = 'WhatsApp do cliente') => ({
    id: 'canal-1',
    name,
    sector,
    organizationId: 'org-1',
  });

  function montar(agenteSector: string, canalSector: string) {
    const prisma = {
      channel: { findFirst: jest.fn().mockResolvedValue(canal(canalSector)) },
      aiAgent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ag-1', name: 'Contábil' }),
        findUnique: jest
          .fn()
          .mockResolvedValue({ sector: agenteSector, name: 'Contábil' }),
      },
      aiAgentChannel: { upsert: jest.fn().mockResolvedValue({ ok: true }) },
    } as any;
    const service = new AgentsService(prisma, {} as any);
    return { service, prisma };
  }

  it('recusa vincular agente de OPERACAO a canal de ATENDIMENTO', async () => {
    const { service, prisma } = montar('OPERACAO', 'ATENDIMENTO');

    await expect(
      service.assignChannel('org-1', 'ag-1', { channelId: 'canal-1' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    // O ponto do teste não é só o erro: é que NADA foi gravado.
    expect(prisma.aiAgentChannel.upsert).not.toHaveBeenCalled();
  });

  it('a mensagem de erro diz as duas frentes, senão ninguém entende o que fazer', async () => {
    const { service } = montar('OPERACAO', 'ATENDIMENTO');

    await expect(
      service.assignChannel('org-1', 'ag-1', { channelId: 'canal-1' } as any),
    ).rejects.toThrow(/OPERACAO[\s\S]*ATENDIMENTO|ATENDIMENTO[\s\S]*OPERACAO/);
  });

  it('permite quando as frentes batem', async () => {
    const { service, prisma } = montar('ATENDIMENTO', 'ATENDIMENTO');

    await service.assignChannel('org-1', 'ag-1', {
      channelId: 'canal-1',
    } as any);

    expect(prisma.aiAgentChannel.upsert).toHaveBeenCalled();
  });

  it('MARKETING também não entra em canal de ATENDIMENTO', async () => {
    const { service } = montar('MARKETING', 'ATENDIMENTO');

    await expect(
      service.assignChannel('org-1', 'ag-1', { channelId: 'canal-1' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('canal interno de OPERACAO aceita agente de OPERACAO', async () => {
    const { service, prisma } = montar('OPERACAO', 'OPERACAO');

    await service.assignChannel('org-1', 'ag-1', {
      channelId: 'canal-1',
    } as any);

    expect(prisma.aiAgentChannel.upsert).toHaveBeenCalled();
  });
});
