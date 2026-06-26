/**
 * Teste end-to-end multi-tenant: cria uma ORG NOVA, liga os add-ons (Marketing
 * e Assistente Pessoal) como o Super Admin faz, e prova que tudo provisiona SÓ
 * pra ela e fica ISOLADO das outras orgs. Limpa a org de teste no fim.
 * Uso: npx ts-node scripts/test-multitenant.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { MarketingProvisioningService } from '../src/modules/ai-agents/marketing/marketing-provisioning.service';
import { PersonalAssistantProvisioningService } from '../src/modules/ai-agents/personal-assistant/personal-assistant-provisioning.service';

const ok = (b: boolean) => (b ? '✓' : '✗ FALHOU');

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const marketing = app.get(MarketingProvisioningService);
  const assistant = app.get(PersonalAssistantProvisioningService);
  const stamp = Date.now();
  let orgId = '';

  try {
    // ── 1) Cria org NOVA + dono ────────────────────────────────
    const user = await prisma.user.create({
      data: { name: 'Dono Teste', email: `teste-${stamp}@exemplo.com`, password: 'x' },
    });
    const org = await prisma.organization.create({
      data: { name: `Org Teste ${stamp}`, slug: `org-teste-${stamp}` },
    });
    orgId = org.id;
    await prisma.userOrganization.create({
      data: { userId: user.id, organizationId: org.id, role: 'OWNER' },
    });
    console.log(`\nOrg nova: ${org.name} (${org.id})`);

    // ── 2) Baseline: sem marketing, sem assistente ─────────────
    const baseMkt = await prisma.aiAgent.count({ where: { organizationId: org.id, sector: 'MARKETING' } });
    const baseAsst = await prisma.personalAssistantConfig.count({ where: { organizationId: org.id } });
    console.log(`\n[baseline] agentes marketing=${baseMkt} (esperado 0) ${ok(baseMkt === 0)}`);
    console.log(`[baseline] assistente config=${baseAsst} (esperado 0) ${ok(baseAsst === 0)}`);

    // ── 3) Liga MARKETING (flag + provisiona, como o Super Admin) ─
    await prisma.organization.update({ where: { id: org.id }, data: { marketingEnabled: true } });
    await marketing.provisionForOrg(org.id);
    const mktAgents = await prisma.aiAgent.count({ where: { organizationId: org.id, sector: 'MARKETING', deletedAt: null } });
    const mktTools = await prisma.aiTool.count({ where: { organizationId: org.id, deletedAt: null } });
    const mktCrons = await prisma.agentCron.count({ where: { organizationId: org.id, deletedAt: null } });
    console.log(`\n[marketing ON] agentes=${mktAgents} (esperado 6) ${ok(mktAgents === 6)}`);
    console.log(`[marketing ON] tools=${mktTools} (>=3) ${ok(mktTools >= 3)} | crons=${mktCrons} (>=1) ${ok(mktCrons >= 1)}`);

    // ── 4) Liga ASSISTENTE (flag + provisiona) ─────────────────
    await prisma.organization.update({ where: { id: org.id }, data: { assistantEnabled: true } });
    await assistant.provisionForOrg(org.id);
    const cfg = await prisma.personalAssistantConfig.findFirst({ where: { organizationId: org.id } });
    const asstAgent = await prisma.aiAgent.findFirst({ where: { organizationId: org.id, sector: 'PESSOAL', deletedAt: null } });
    const asstChannel = cfg?.channelId ? await prisma.channel.findUnique({ where: { id: cfg.channelId }, select: { type: true, visibility: true } }) : null;
    const view = await prisma.inboxView.findFirst({ where: { organizationId: org.id, metadata: { path: ['assistant'], equals: true } } });
    console.log(`\n[assistente ON] config criada=${!!cfg} ${ok(!!cfg)} | contato canônico=${!!cfg?.contactId} ${ok(!!cfg?.contactId)}`);
    console.log(`[assistente ON] agente PESSOAL=${!!asstAgent} ${ok(!!asstAgent)} | canal=${asstChannel?.type}/${asstChannel?.visibility} ${ok(asstChannel?.type === 'INTERNAL' && asstChannel?.visibility === 'PRIVATE')}`);
    console.log(`[assistente ON] visão fixa no inbox=${!!view} ${ok(!!view)}`);

    // ── 5) ISOLAMENTO entre orgs ───────────────────────────────
    // 5a) Agentes de marketing da org nova ≠ de outra org (Axory)
    const otherOrg = await prisma.organization.findFirst({ where: { name: 'Axory Capital Group' }, select: { id: true } });
    const newIds = (await prisma.aiAgent.findMany({ where: { organizationId: org.id, sector: 'MARKETING' }, select: { id: true } })).map((a) => a.id);
    const otherIds = otherOrg ? (await prisma.aiAgent.findMany({ where: { organizationId: otherOrg.id, sector: 'MARKETING' }, select: { id: true } })).map((a) => a.id) : [];
    const overlap = newIds.filter((id) => otherIds.includes(id));
    console.log(`\n[isolamento] agentes marketing compartilhados c/ Axory=${overlap.length} (esperado 0) ${ok(overlap.length === 0)}`);

    // 5b) Dados pessoais isolados: cria tarefa na org nova, confere que NÃO
    //     aparece pra outra org e que cada org só vê o seu.
    await prisma.personalTask.create({ data: { organizationId: org.id, userId: user.id, title: 'Tarefa secreta da org nova' } });
    const newOrgTasks = await prisma.personalTask.count({ where: { organizationId: org.id } });
    const leakToOther = otherOrg ? await prisma.personalTask.count({ where: { organizationId: otherOrg.id, title: 'Tarefa secreta da org nova' } }) : 0;
    console.log(`[isolamento] tarefas da org nova=${newOrgTasks} (1) ${ok(newOrgTasks === 1)} | vazou pra Axory=${leakToOther} (0) ${ok(leakToOther === 0)}`);

    // 5c) Secrets/tools são por org (a org nova não herda nada de outra)
    const newSecrets = await prisma.organizationSecret.count({ where: { organizationId: org.id } });
    console.log(`[isolamento] secrets da org nova=${newSecrets} (0 — não herda credenciais) ${ok(newSecrets === 0)}`);

    console.log('\n=== Resumo: org nova começou limpa → ligou flags → provisionou só pra ela → dados isolados ===');
  } finally {
    // ── 6) Limpeza (cascade apaga tudo da org de teste) ────────
    if (orgId) {
      await prisma.organization.delete({ where: { id: orgId } }).catch((e) => console.log('cleanup org:', e?.message));
      // remove o usuário de teste
      await prisma.user.deleteMany({ where: { email: { startsWith: 'teste-' + stamp } } }).catch(() => {});
      console.log('\n(org de teste removida)');
    }
    await app.close();
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERRO:', e?.message, e?.stack); process.exit(1); });
