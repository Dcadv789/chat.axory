import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');
loadEnv(path.join(apiRoot, '.env'));

const prisma = new PrismaClient();

async function main() {
  const channels = await prisma.channel.findMany({
    where: { type: 'TELEGRAM', deletedAt: null },
    select: { id: true, name: true, organizationId: true },
  });

  for (const ch of channels) {
    console.log('═══════════════════════════════════════════');
    console.log(`Canal: ${ch.name} (${ch.id})`);

    const events = await prisma.webhookEvent.findMany({
      where: { channelType: 'TELEGRAM' },
      orderBy: { receivedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        channelId: true,
        status: true,
        errorMessage: true,
        receivedAt: true,
        processedAt: true,
      },
    });

    console.log(`\n── Últimos ${events.length} webhook_events (TELEGRAM) ──`);
    for (const e of events) {
      const routed = e.channelId ? `ch=${e.channelId.slice(-6)}` : 'NÃO-ROTEADO';
      console.log(
        `  [${e.receivedAt.toISOString()}] ${e.status} ${routed}` +
          (e.errorMessage ? ` err="${e.errorMessage}"` : ''),
      );
    }

    const convs = await prisma.conversation.findMany({
      where: { channelId: ch.id },
      orderBy: { lastMessageAt: 'desc' },
      take: 5,
      select: {
        id: true,
        status: true,
        lastMessageAt: true,
        _count: { select: { messages: true } },
        contact: { select: { name: true } },
      },
    });

    console.log(`\n── Conversas neste canal: ${convs.length} ──`);
    for (const c of convs) {
      console.log(
        `  ${c.contact?.name ?? '?'} status=${c.status} msgs=${c._count.messages} last=${c.lastMessageAt?.toISOString() ?? '-'}`,
      );
    }

    const lastMsgs = await prisma.message.findMany({
      where: { conversation: { channelId: ch.id } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        direction: true,
        type: true,
        createdAt: true,
        content: true,
      },
    });

    console.log(`\n── Últimas ${lastMsgs.length} mensagens ──`);
    for (const m of lastMsgs) {
      const text =
        typeof m.content === 'object' && m.content
          ? (m.content.text ?? JSON.stringify(m.content)).slice(0, 50)
          : String(m.content).slice(0, 50);
      console.log(`  [${m.createdAt.toISOString()}] ${m.direction} ${m.type} "${text}"`);
    }
  }

  // ── Panorama global: o pipeline de webhook está vivo pra QUALQUER canal? ──
  console.log('\n\n═══════════════════════════════════════════');
  console.log('PANORAMA GLOBAL DE webhook_events (todos os tipos)');
  const byType = await prisma.webhookEvent.groupBy({
    by: ['channelType', 'status'],
    _count: { _all: true },
    _max: { receivedAt: true },
  });
  if (byType.length === 0) {
    console.log('  TABELA webhook_events VAZIA — nenhum webhook foi gravado, de nenhum canal.');
  } else {
    for (const row of byType) {
      console.log(
        `  ${row.channelType} / ${row.status}: ${row._count._all} eventos, último em ${row._max.receivedAt?.toISOString() ?? '-'}`,
      );
    }
  }

  console.log('\n── Últimos 15 webhook_events (qualquer tipo) ──');
  const recent = await prisma.webhookEvent.findMany({
    orderBy: { receivedAt: 'desc' },
    take: 15,
    select: {
      channelType: true,
      status: true,
      channelId: true,
      errorMessage: true,
      receivedAt: true,
    },
  });
  for (const e of recent) {
    const routed = e.channelId ? `ch=${e.channelId.slice(-6)}` : 'NÃO-ROTEADO';
    console.log(
      `  [${e.receivedAt.toISOString()}] ${e.channelType} ${e.status} ${routed}` +
        (e.errorMessage ? ` err="${e.errorMessage}"` : ''),
    );
  }
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

main()
  .catch((e) => {
    console.error('Erro:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
