/**
 * Semeia o catálogo comercial do AxChat em PlatformSetting:
 *   - plan_templates: os 4 planos (Inbox / Essencial / Profissional / Performance)
 *   - pricing_meta:   add-ons avulsos, pacotes de IA extra e notas comerciais
 *
 * Idempotente (upsert). Preços em centavos (BRL). Sem plano grátis — trial 7 dias.
 * Uso: node scripts/seed-plans.mjs   (ou: npm run prisma:seed:plans)
 */
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');
loadEnv(path.join(apiRoot, '.env'));

const prisma = new PrismaClient();

const PLAN_TEMPLATES = {
  inbox: {
    label: 'Inbox',
    description:
      'Caixa de entrada omnichannel + ferramentas de atendimento humano (tags, funil, respostas rápidas, automações de regra). Sem IA.',
    pricePerSeatCents: 7900,
    minSeats: 2,
    suiteFlatCents: 0,
    aiConversations: 0,
    includesMarketing: false,
    includesAssistant: false,
    setupFeeCents: 49700,
    maxAgents: 0,
    maxChannels: 5,
    maxDepartments: 3,
  },
  essencial: {
    label: 'Essencial',
    description: 'Inbox + IA de atendimento (~1k conversas/mês).',
    pricePerSeatCents: 9700,
    minSeats: 2,
    suiteFlatCents: 0,
    aiConversations: 1000,
    includesMarketing: false,
    includesAssistant: false,
    setupFeeCents: 79700,
    maxAgents: 5,
    maxChannels: 5,
    maxDepartments: 5,
  },
  profissional: {
    label: 'Profissional',
    description:
      'IA avançada, watchdog, automações (~3k conversas/mês). Add-ons de Marketing/Assistente disponíveis.',
    pricePerSeatCents: 19700,
    minSeats: 3,
    suiteFlatCents: 0,
    aiConversations: 3000,
    includesMarketing: false,
    includesAssistant: false,
    setupFeeCents: 129700,
    maxAgents: 25,
    maxChannels: 15,
    maxDepartments: 15,
  },
  performance: {
    label: 'Performance',
    description:
      'Profissional + Suíte (Marketing + Assistente Pessoal) inclusa (~8k conversas/mês).',
    pricePerSeatCents: 19700,
    minSeats: 3,
    suiteFlatCents: 69700,
    aiConversations: 8000,
    includesMarketing: true,
    includesAssistant: true,
    setupFeeCents: 249700,
    maxAgents: 999,
    maxChannels: 999,
    maxDepartments: 999,
  },
};

const PRICING_META = {
  trialDays: 7,
  addons: [
    {
      key: 'marketing',
      label: 'Marketing (crew completa)',
      priceCents: 69700,
      note: 'Caixa fixa por org. Substitui ~4 analistas. Implantação assistida recomendada.',
    },
    {
      key: 'assistant',
      label: 'Assistente Pessoal',
      priceCents: 19700,
      note: 'Caixa fixa por org, para o dono/gestor.',
    },
    {
      key: 'marketing_managed',
      label: 'Acompanhamento Marketing (opcional)',
      priceCents: 49700,
      note: 'Recorrente. Especialista supervisiona a crew. Faixa R$497–997/mês.',
    },
  ],
  aiPackages: [
    { label: '+1.000 conversas', conversations: 1000, priceCents: 9700 },
    { label: '+5.000 conversas', conversations: 5000, priceCents: 39700 },
    { label: '+10.000 conversas', conversations: 10000, priceCents: 69700 },
  ],
  notes:
    'Sem plano grátis — trial de 7 dias. Cobrança por atendente (seat) + cota de IA; Marketing e Assistente são caixas fixas por org. Implantação grátis (ou 50% off) no plano anual. Setup de Marketing/Performance é assistido (não self-service).',
};

async function upsert(key, value) {
  await prisma.platformSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
  console.log(`✓ ${key} gravado`);
}

async function main() {
  console.log('Semeando catálogo comercial (PlatformSetting)…\n');
  await upsert('plan_templates', PLAN_TEMPLATES);
  await upsert('pricing_meta', PRICING_META);

  console.log('\nResumo dos planos:');
  for (const [plan, s] of Object.entries(PLAN_TEMPLATES)) {
    const seat = (s.pricePerSeatCents / 100).toFixed(0);
    const suite = s.suiteFlatCents ? ` + R$${(s.suiteFlatCents / 100).toFixed(0)} suíte` : '';
    const setup = (s.setupFeeCents / 100).toFixed(0);
    console.log(
      `  • ${s.label.padEnd(13)} R$${seat}/atend (mín ${s.minSeats})${suite} | IA ${s.aiConversations} | setup R$${setup}`,
    );
  }
  console.log('\nPronto. Edite tudo em Super Admin → Planos.');
}

main()
  .then(() => prisma.$disconnect().then(() => process.exit(0)))
  .catch(async (e) => {
    console.error('ERRO:', e?.message ?? e);
    await prisma.$disconnect();
    process.exit(1);
  });

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
