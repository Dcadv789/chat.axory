import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');

loadEnv(path.join(apiRoot, '.env'));

const prisma = new PrismaClient();

async function main() {
  console.log('APP_URL =', process.env.APP_URL || '(não definido)');
  console.log('Webhook esperado =', `${process.env.APP_URL}/api/v1/webhooks/TELEGRAM`);
  console.log('');

  const channels = await prisma.channel.findMany({
    where: { type: 'TELEGRAM', deletedAt: null },
    select: {
      id: true,
      name: true,
      isActive: true,
      organizationId: true,
      config: true,
      webhookSecret: true,
    },
  });

  if (channels.length === 0) {
    console.log('Nenhum canal TELEGRAM encontrado no banco.');
    return;
  }

  for (const ch of channels) {
    const cfg = (ch.config ?? {});
    const botToken = cfg.botToken ? String(cfg.botToken) : null;
    const secretToken = cfg.secretToken || ch.webhookSecret || null;

    console.log('═══════════════════════════════════════════');
    console.log(`Canal: ${ch.name} (${ch.id})`);
    console.log(`  org:        ${ch.organizationId}`);
    console.log(`  isActive:   ${ch.isActive}`);
    console.log(`  botToken:   ${botToken ? 'presente' : 'AUSENTE'}`);
    console.log(`  secretToken:${secretToken ? ' presente' : ' AUSENTE'}`);

    if (!botToken) {
      console.log('  → sem botToken, não dá pra consultar a API do Telegram.');
      continue;
    }

    const base = `https://api.telegram.org/bot${botToken}`;

    try {
      const me = await fetchJson(`${base}/getMe`);
      console.log(`  getMe:      @${me.result?.username} (${me.result?.first_name})`);
    } catch (e) {
      console.log(`  getMe FALHOU: ${e.message} — token provavelmente inválido.`);
      continue;
    }

    try {
      const info = await fetchJson(`${base}/getWebhookInfo`);
      const r = info.result || {};
      console.log('  ── getWebhookInfo ──');
      console.log(`    url:                  ${r.url || '(VAZIO — nenhum webhook registrado)'}`);
      console.log(`    pending_update_count: ${r.pending_update_count}`);
      console.log(`    max_connections:      ${r.max_connections ?? '-'}`);
      console.log(`    ip_address:           ${r.ip_address ?? '-'}`);
      console.log(`    allowed_updates:      ${JSON.stringify(r.allowed_updates ?? '(todos)')}`);
      if (r.last_error_message) {
        const when = r.last_error_date
          ? new Date(r.last_error_date * 1000).toISOString()
          : '?';
        console.log(`    last_error:           [${when}] ${r.last_error_message}`);
      } else {
        console.log('    last_error:           (nenhum)');
      }
    } catch (e) {
      console.log(`  getWebhookInfo FALHOU: ${e.message}`);
    }
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || `HTTP ${res.status}`);
  return data;
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
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
