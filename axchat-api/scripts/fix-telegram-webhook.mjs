import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');
loadEnv(path.join(apiRoot, '.env'));

const prisma = new PrismaClient();

// Telegram exige HTTPS público — o APP_URL local aponta pra localhost, então
// fixamos a URL de produção aqui (overridável por env).
const PROD_WEBHOOK_URL =
  process.env.TELEGRAM_WEBHOOK_URL ||
  'https://api-chat.axory.com.br/api/v1/webhooks/TELEGRAM';

function maskSecret(s) {
  if (!s) return '(vazio)';
  if (s.length <= 6) return `${s[0]}***`;
  return `${s.slice(0, 3)}***${s.slice(-2)} (len=${s.length})`;
}

// secret_token do Telegram deve casar /^[A-Za-z0-9_-]{1,256}$/
function secretIsValid(s) {
  return typeof s === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(s);
}

async function main() {
  const channels = await prisma.channel.findMany({
    where: { type: 'TELEGRAM', deletedAt: null },
    select: { id: true, name: true, config: true, webhookSecret: true },
  });

  if (channels.length === 0) {
    console.log('Nenhum canal TELEGRAM encontrado.');
    return;
  }

  for (const ch of channels) {
    const cfg = ch.config ?? {};
    const botToken = cfg.botToken ? String(cfg.botToken) : null;
    const secretToken = cfg.secretToken || ch.webhookSecret || null;

    console.log('═══════════════════════════════════════════');
    console.log(`Canal: ${ch.name} (${ch.id})`);
    console.log(`  secretToken: ${maskSecret(secretToken)}`);
    console.log(`  válido p/ Telegram: ${secretIsValid(secretToken)}`);

    if (!botToken) {
      console.log('  ✗ sem botToken — pulando.');
      continue;
    }
    if (!secretToken) {
      console.log('  ✗ sem secretToken — pulando (precisa de um secret pra rotear).');
      continue;
    }
    if (!secretIsValid(secretToken)) {
      console.log('  ✗ secretToken tem chars inválidos pro Telegram — precisa regenerar.');
      continue;
    }

    const base = `https://api.telegram.org/bot${botToken}`;

    const before = await fetchJson(`${base}/getWebhookInfo`).catch((e) => ({ error: e.message }));
    console.log(`  antes: url=${before.result?.url || '(vazio)'}`);

    console.log(`  → setWebhook ${PROD_WEBHOOK_URL} (com secret_token)`);
    const set = await fetchJson(`${base}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: PROD_WEBHOOK_URL,
        secret_token: String(secretToken),
        allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post'],
        drop_pending_updates: false,
      }),
    }).catch((e) => ({ error: e.message }));

    if (set.error) {
      console.log(`  ✗ setWebhook FALHOU: ${set.error}`);
      continue;
    }
    console.log(`  ✓ setWebhook ok: ${set.description || 'webhook configurado'}`);

    const after = await fetchJson(`${base}/getWebhookInfo`).catch((e) => ({ error: e.message }));
    const r = after.result || {};
    console.log(
      `  depois: url=${r.url} pending=${r.pending_update_count} last_error=${r.last_error_message || '(nenhum)'}`,
    );
  }

  console.log('\n✓ Pronto. Mande uma mensagem pro bot no Telegram e rode diagnose-telegram-db.mjs.');
}

async function fetchJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || `HTTP ${res.status}`);
  return data;
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
