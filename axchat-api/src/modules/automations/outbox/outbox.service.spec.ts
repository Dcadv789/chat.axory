import { AutomationTrigger, Prisma } from '@prisma/client';
import { OutboxService } from './outbox.service';

/**
 * Cobre a idempotência do outbox:
 *  - deriveDedupKey (via enqueue) — re-entregas colapsam na mesma chave;
 *  - hard-fail quando falta org/contact;
 *  - violação de unique (P2002) é silenciada (re-entrega), demais erros sobem.
 */
describe('OutboxService (dedup / idempotência)', () => {
  let client: any;
  let service: OutboxService;

  function setup(createImpl?: () => any) {
    client = {
      outboxEvent: {
        create: jest.fn(createImpl ?? (() => Promise.resolve({}))),
      },
    };
    // prisma "real" não é usado nos testes (passamos o client direto).
    service = new OutboxService(client as any);
  }

  const base = { organizationId: 'org-1', contactId: 'contact-1' };

  beforeEach(() => setup());

  function lastDedupKey(): string | null {
    return client.outboxEvent.create.mock.calls.at(-1)![0].data.dedupKey;
  }

  describe('deriveDedupKey', () => {
    it('TAG_ADDED em conversa => chave por (trigger, target, conversa, tag)', async () => {
      await service.enqueue(client, AutomationTrigger.TAG_ADDED, {
        ...base,
        target: 'conversation',
        conversationId: 'conv-9',
        tagId: 'tag-7',
      } as any);
      expect(lastDedupKey()).toBe('TAG_ADDED:conversation:conv-9:tag-7');
    });

    it('MESSAGE_RECEIVED => chave pelo messageId (dedup perfeito)', async () => {
      await service.enqueue(client, AutomationTrigger.MESSAGE_RECEIVED, {
        ...base,
        messageId: 'msg-123',
      } as any);
      expect(lastDedupKey()).toBe('MESSAGE_RECEIVED:msg-123');
    });

    it('CONVERSATION_STATUS_CHANGED => sem dedup (null)', async () => {
      await service.enqueue(client, AutomationTrigger.CONVERSATION_STATUS_CHANGED, {
        ...base,
        conversationId: 'c',
        channelId: 'ch',
        fromStatus: 'PENDING',
        toStatus: 'OPEN',
      } as any);
      expect(lastDedupKey()).toBeNull();
    });

    it('dedupKey explícito tem precedência (inclusive null forçado)', async () => {
      await service.enqueue(
        client,
        AutomationTrigger.MESSAGE_RECEIVED,
        { ...base, messageId: 'msg-1' } as any,
        { dedupKey: 'custom-key' },
      );
      expect(lastDedupKey()).toBe('custom-key');

      await service.enqueue(
        client,
        AutomationTrigger.MESSAGE_RECEIVED,
        { ...base, messageId: 'msg-2' } as any,
        { dedupKey: null },
      );
      expect(lastDedupKey()).toBeNull();
    });
  });

  describe('validação de payload', () => {
    it('falha sem organizationId', async () => {
      await expect(
        service.enqueue(client, AutomationTrigger.MESSAGE_RECEIVED, {
          contactId: 'c',
          messageId: 'm',
        } as any),
      ).rejects.toThrow(/organizationId/);
      expect(client.outboxEvent.create).not.toHaveBeenCalled();
    });

    it('falha sem contactId', async () => {
      await expect(
        service.enqueue(client, AutomationTrigger.MESSAGE_RECEIVED, {
          organizationId: 'o',
          messageId: 'm',
        } as any),
      ).rejects.toThrow(/contactId/);
      expect(client.outboxEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('colisão de unique (re-entrega)', () => {
    it('P2002 é silenciado — não propaga (idempotente)', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      });
      setup(() => Promise.reject(p2002));

      await expect(
        service.enqueue(client, AutomationTrigger.MESSAGE_RECEIVED, {
          ...base,
          messageId: 'msg-dup',
        } as any),
      ).resolves.toBeUndefined();
    });

    it('erro genérico propaga (rollback do caller)', async () => {
      setup(() => Promise.reject(new Error('db down')));
      await expect(
        service.enqueue(client, AutomationTrigger.MESSAGE_RECEIVED, {
          ...base,
          messageId: 'msg-x',
        } as any),
      ).rejects.toThrow('db down');
    });
  });
});
