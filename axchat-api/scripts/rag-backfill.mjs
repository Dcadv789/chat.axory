/**
 * Backfill do RAG — indexa o histórico que já existe no banco.
 *
 * O índice só se constrói pra frente: mensagens anteriores à ativação do RAG
 * nunca foram embeddadas. Este script enfileira essas mensagens na MESMA fila
 * (`rag-indexer`) que o runner usa em produção — de propósito, pra reaproveitar
 * embedding, id, upsert e retry em vez de duplicar a lógica aqui.
 *
 * Uso:
 *   npm run rag:backfill -- --dry-run        # só mostra o que faria
 *   npm run rag:backfill                     # enfileira tudo
 *   npm run rag:backfill -- --limit=100      # enfileira no máximo 100
 *   npm run rag:backfill -- --org=<orgId>    # restringe a uma organização
 *
 * Pré-requisito: chave OpenAI configurada em Super Admin > Motor de IA
 * (bloco Áudio/OpenAI). Sem ela os jobs falham no embedding.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : null;
};

const dryRun = has('--dry-run');
const limit = value('limit') ? parseInt(value('limit'), 10) : null;
const orgFilter = value('org');

/** Mesma regra do runner: texto curto demais não vira vetor útil. */
const MIN_TEXT_LENGTH = 10;

function extractText(content) {
  if (typeof content === 'string') return content.trim();
  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') return content.text.trim();
    if (typeof content.caption === 'string') return content.caption.trim();
  }
  return '';
}

const prisma = new PrismaClient();

async function main() {
  const { AppModule } = await import('../dist/src/app.module.js');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  // Pega a fila pelo token do @nestjs/bullmq, sem depender de nenhum serviço.
  const { getQueueToken } = await import('@nestjs/bullmq');
  const queue = app.get(getQueueToken('rag-indexer'), { strict: false });

  console.log('\n=== BACKFILL DO RAG ===');
  console.log(dryRun ? 'modo: SIMULAÇÃO (nada será enfileirado)' : 'modo: EXECUÇÃO');

  // O agente atribuído a cada conversa vem do run MAIS RECENTE dela — é o mesmo
  // valor pra que a indexação ao vivo convergiria, já que o id da entrada é
  // `message:<id>` e o último run sobrescreve.
  const runs = await prisma.aiAgentRun.findMany({
    where: orgFilter ? { organizationId: orgFilter } : {},
    select: { conversationId: true, agentId: true, startedAt: true },
    orderBy: { startedAt: 'asc' },
  });

  const agentByConversation = new Map();
  for (const run of runs) agentByConversation.set(run.conversationId, run.agentId);

  if (agentByConversation.size === 0) {
    console.log('\nNenhuma conversa com execução de agente — nada a indexar.');
    await app.close();
    await prisma.$disconnect();
    return;
  }
  console.log(`conversas com agente: ${agentByConversation.size}`);

  // Só mensagens do CLIENTE: as do agente não são indexadas (o runner também
  // não indexa, pra economizar embedding).
  const messages = await prisma.message.findMany({
    where: {
      conversationId: { in: [...agentByConversation.keys()] },
      direction: 'INBOUND',
      type: { not: 'INTERNAL_NOTE' },
      revokedAt: null,
    },
    select: {
      id: true,
      content: true,
      conversationId: true,
      createdAt: true,
      conversation: { select: { contactId: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const candidates = messages
    .map((m) => ({ ...m, text: extractText(m.content) }))
    .filter((m) => m.text.length >= MIN_TEXT_LENGTH);

  console.log(`mensagens de cliente elegíveis: ${candidates.length}`);

  // Não reindexa o que já está lá — o backfill precisa ser repetível sem custo.
  const existing = await prisma.aiVectorEntry.findMany({
    where: { id: { in: candidates.map((m) => `message:${m.id}`) } },
    select: { id: true },
  });
  const alreadyIndexed = new Set(existing.map((e) => e.id));
  let pending = candidates.filter((m) => !alreadyIndexed.has(`message:${m.id}`));

  console.log(`já indexadas: ${alreadyIndexed.size}`);
  console.log(`a indexar: ${pending.length}`);

  if (limit && pending.length > limit) {
    pending = pending.slice(0, limit);
    console.log(`limitado a: ${pending.length}`);
  }

  if (pending.length === 0) {
    console.log('\nNada pendente. Índice já está em dia.');
    await app.close();
    await prisma.$disconnect();
    return;
  }

  // ~1 token por 4 caracteres; text-embedding-3-small custa US$ 0,02/1M tokens.
  const chars = pending.reduce((acc, m) => acc + m.text.length, 0);
  const estTokens = Math.ceil(chars / 4);
  console.log(
    `custo estimado: ~${estTokens} tokens ≈ US$ ${((estTokens / 1_000_000) * 0.02).toFixed(4)}`,
  );

  if (dryRun) {
    console.log('\nSIMULAÇÃO — exemplos do que seria enfileirado:');
    pending.slice(0, 5).forEach((m) => {
      console.log(`  message:${m.id} | ${m.text.slice(0, 60).replace(/\s+/g, ' ')}`);
    });
    console.log(`\n(${pending.length} no total). Rode sem --dry-run para executar.`);
    await app.close();
    await prisma.$disconnect();
    return;
  }

  let enqueued = 0;
  for (const m of pending) {
    await queue.add(
      'index_message',
      {
        type: 'index_message',
        messageId: m.id,
        content: m.text,
        scope: {
          conversationId: m.conversationId,
          agentId: agentByConversation.get(m.conversationId),
          contactId: m.conversation.contactId,
        },
        metadata: { backfill: true, originalCreatedAt: m.createdAt.toISOString() },
      },
      { removeOnComplete: 500, removeOnFail: 100, attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );
    enqueued++;
    if (enqueued % 50 === 0) console.log(`  enfileiradas ${enqueued}/${pending.length}…`);
  }

  console.log(`\n${enqueued} mensagens enfileiradas.`);
  console.log(
    'O worker `rag-indexer` processa em segundo plano (concorrência 4). ' +
      'Acompanhe pelos logs `rag_indexed` da API.',
  );
  console.log(
    'Rode este script de novo depois para conferir quantas faltam — ele é repetível.',
  );

  await app.close();
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('\nERRO no backfill:', err?.message ?? err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
