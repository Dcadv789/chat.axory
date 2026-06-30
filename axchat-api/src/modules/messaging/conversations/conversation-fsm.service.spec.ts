import { BadRequestException } from '@nestjs/common';
import { ConversationStatus } from '@prisma/client';
import { ConversationFsmService } from './conversation-fsm.service';

/**
 * Cobre a máquina de estados da conversa:
 *  - canTransition (função pura) — quais saltos são válidos;
 *  - transition() — rejeita inválidos, marca closedAt/reopen, grava trilha+outbox
 *    dentro da transação;
 *  - assign() — atribuição + no-op idempotente (mesmo dono não dispara automação).
 */
describe('ConversationFsmService', () => {
  // ---- mocks compartilhados ----
  let tx: any;
  let prisma: any;
  let ratings: any;
  let outbox: any;
  let service: ConversationFsmService;

  const baseConversation = {
    id: 'conv-1',
    status: ConversationStatus.OPEN as ConversationStatus,
    organizationId: 'org-1',
    contactId: 'contact-1',
    channelId: 'chan-1',
    assignedToId: null as string | null,
    firstResponseAt: null as Date | null,
  };

  function setup(conversation: Partial<typeof baseConversation> = {}) {
    tx = {
      conversation: { update: jest.fn().mockResolvedValue({}) },
      conversationAuditLog: { create: jest.fn().mockResolvedValue({}) },
      conversationParticipant: { upsert: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      conversation: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ ...baseConversation, ...conversation }),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    ratings = { requestRating: jest.fn().mockResolvedValue(undefined) };
    outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };
    service = new ConversationFsmService(prisma, ratings, outbox);
  }

  beforeEach(() => setup());

  describe('canTransition', () => {
    const valid: Array<[ConversationStatus, ConversationStatus]> = [
      [ConversationStatus.PENDING, ConversationStatus.OPEN],
      [ConversationStatus.PENDING, ConversationStatus.BOT],
      [ConversationStatus.BOT, ConversationStatus.PENDING],
      [ConversationStatus.BOT, ConversationStatus.CLOSED],
      [ConversationStatus.OPEN, ConversationStatus.WAITING],
      [ConversationStatus.OPEN, ConversationStatus.CLOSED],
      [ConversationStatus.WAITING, ConversationStatus.OPEN],
      [ConversationStatus.WAITING, ConversationStatus.CLOSED],
      [ConversationStatus.CLOSED, ConversationStatus.OPEN],
      [ConversationStatus.CLOSED, ConversationStatus.PENDING],
    ];

    it.each(valid)('aceita %s → %s', (from, to) => {
      expect(service.canTransition(from, to)).toBe(true);
    });

    const invalid: Array<[ConversationStatus, ConversationStatus]> = [
      [ConversationStatus.PENDING, ConversationStatus.CLOSED],
      [ConversationStatus.PENDING, ConversationStatus.WAITING],
      [ConversationStatus.OPEN, ConversationStatus.PENDING],
      [ConversationStatus.OPEN, ConversationStatus.BOT],
      [ConversationStatus.BOT, ConversationStatus.OPEN],
      [ConversationStatus.WAITING, ConversationStatus.PENDING],
      [ConversationStatus.CLOSED, ConversationStatus.WAITING],
    ];

    it.each(invalid)('rejeita %s → %s', (from, to) => {
      expect(service.canTransition(from, to)).toBe(false);
    });

    it('rejeita salto pro mesmo estado (não há transição idempotente)', () => {
      for (const s of Object.values(ConversationStatus)) {
        expect(service.canTransition(s, s)).toBe(false);
      }
    });
  });

  describe('transition', () => {
    it('lança BadRequest em transição inválida e não toca no banco', async () => {
      setup({ status: ConversationStatus.OPEN });
      await expect(
        service.transition('conv-1', ConversationStatus.PENDING),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.conversation.update).not.toHaveBeenCalled();
    });

    it('ao fechar, grava closedAt, audit e outbox, e pede avaliação', async () => {
      setup({ status: ConversationStatus.OPEN });
      await service.transition('conv-1', ConversationStatus.CLOSED, 'actor-1');

      const update = tx.conversation.update.mock.calls[0][0];
      expect(update.data.status).toBe(ConversationStatus.CLOSED);
      expect(update.data.closedAt).toBeInstanceOf(Date);

      expect(tx.conversationAuditLog.create).toHaveBeenCalledTimes(1);
      expect(outbox.enqueue).toHaveBeenCalledTimes(1);
      expect(ratings.requestRating).toHaveBeenCalledWith('conv-1');
    });

    it('ao reabrir (CLOSED → OPEN) zera closedAt e incrementa reopenedCount', async () => {
      setup({ status: ConversationStatus.CLOSED });
      await service.transition('conv-1', ConversationStatus.OPEN);

      const update = tx.conversation.update.mock.calls[0][0];
      expect(update.data.closedAt).toBeNull();
      expect(update.data.reopenedAt).toBeInstanceOf(Date);
      expect(update.data.reopenedCount).toEqual({ increment: 1 });
      expect(ratings.requestRating).not.toHaveBeenCalled();
    });

    it('transição normal não pede avaliação nem mexe em closedAt', async () => {
      setup({ status: ConversationStatus.OPEN });
      await service.transition('conv-1', ConversationStatus.WAITING);

      const update = tx.conversation.update.mock.calls[0][0];
      expect(update.data.closedAt).toBeUndefined();
      expect(ratings.requestRating).not.toHaveBeenCalled();
      expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    });
  });

  describe('assign', () => {
    it('atribuir de PENDING abre a conversa, marca 1ª resposta e enfileira 2 eventos', async () => {
      setup({ status: ConversationStatus.PENDING, assignedToId: null });
      await service.assign('conv-1', 'agent-1', 'actor-1');

      const update = tx.conversation.update.mock.calls[0][0];
      expect(update.data.assignedToId).toBe('agent-1');
      expect(update.data.status).toBe(ConversationStatus.OPEN);
      expect(update.data.firstResponseAt).toBeInstanceOf(Date);

      // ASSIGNED + STATUS_CHANGED
      expect(outbox.enqueue).toHaveBeenCalledTimes(2);
      expect(tx.conversationParticipant.upsert).toHaveBeenCalledTimes(1);
    });

    it('reatribuir pro MESMO dono é no-op idempotente (não enfileira nem faz upsert)', async () => {
      setup({ status: ConversationStatus.OPEN, assignedToId: 'agent-1' });
      await service.assign('conv-1', 'agent-1', 'actor-1');

      // ainda grava a trilha de ASSIGNED, mas não dispara automação nem participante
      expect(outbox.enqueue).not.toHaveBeenCalled();
      expect(tx.conversationParticipant.upsert).not.toHaveBeenCalled();
    });

    it('atribuir já-aberta a novo dono enfileira só ASSIGNED (sem mudar status)', async () => {
      setup({ status: ConversationStatus.OPEN, assignedToId: 'agent-0' });
      await service.assign('conv-1', 'agent-2');

      const update = tx.conversation.update.mock.calls[0][0];
      expect(update.data.status).toBeUndefined();
      expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    });
  });
});
