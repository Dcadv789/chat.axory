/**
 * Testa o briefing diário: força a hora do briefing pra hora local atual da
 * org, roda o scan e mostra a mensagem entregue. Uso:
 * ORG_NAME="Axory Capital Group" npx ts-node scripts/test-briefing.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { DailyBriefingService } from '../src/modules/ai-agents/personal-assistant/daily-briefing.service';

async function main() {
  const orgName = process.env.ORG_NAME || 'Axory Capital Group';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const prisma = app.get(PrismaService);
    const briefing = app.get(DailyBriefingService);

    const org = await prisma.organization.findFirstOrThrow({
      where: { name: orgName, deletedAt: null },
      select: { id: true },
    });
    const cfg = await prisma.personalAssistantConfig.findFirstOrThrow({
      where: { organizationId: org.id },
    });

    // Força: hora local atual + zera lastBriefingSentAt pra não pular.
    const now = new Date();
    const localHour = Number(
      new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timezone, hour12: false, hour: '2-digit' })
        .format(now),
    ) % 24;
    await prisma.personalAssistantConfig.update({
      where: { uq_assistant_org_user: { organizationId: org.id, userId: cfg.userId } },
      data: { dailyBriefingHour: localHour, lastBriefingSentAt: null },
    });

    const sent = await briefing.runDue(now);
    console.log(`\nBriefings enviados: ${sent} (hora local ${localHour}h)`);

    const msg = await prisma.message.findFirst({
      where: {
        conversation: { channelId: cfg.channelId! },
        direction: 'OUTBOUND',
      },
      orderBy: { createdAt: 'desc' },
    });
    console.log('\n--- Briefing entregue ---\n' + ((msg?.content as any)?.text ?? '(nada)'));
  } finally {
    await app.close();
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('FALHOU:', e?.message, e?.stack); process.exit(1); });
