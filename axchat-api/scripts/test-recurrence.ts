/**
 * Testa o engine de recorrência: cria um lembrete DAILY vencido, roda o
 * processor, e confere que ele ENTREGOU e RE-AGENDOU pro dia seguinte (não
 * re-disparou em loop). Uso: npx ts-node scripts/test-recurrence.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { ReminderProcessor } from '../src/modules/ai-agents/personal-assistant/reminder.processor';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const prisma = app.get(PrismaService);
    const processor = app.get(ReminderProcessor);
    const cfg = await prisma.personalAssistantConfig.findFirstOrThrow();

    const pastDue = new Date(Date.now() - 60_000); // 1 min atrás
    const rem = await prisma.personalReminder.create({
      data: {
        organizationId: cfg.organizationId,
        userId: cfg.userId,
        message: 'Tomar agua (teste recorrente)',
        remindAt: pastDue,
        recurrence: 'DAILY',
      },
    });

    const res = await processor.process({} as any);
    console.log('processor:', res);

    const after = await prisma.personalReminder.findUniqueOrThrow({ where: { id: rem.id } });
    const deltaH = (after.remindAt.getTime() - pastDue.getTime()) / 3600_000;
    console.log(`\nLembrete recorrente: status=${after.status} (deveria PENDING)`);
    console.log(`remindAt avançou ~${deltaH.toFixed(1)}h (deveria ~24h)`);
    console.log(after.status === 'PENDING' && deltaH > 23 && deltaH < 25 ? '✓ RE-AGENDOU certo' : '✗ ERRADO');

    // Rodar de novo NÃO deve re-disparar (já está no futuro).
    const res2 = await processor.process({} as any);
    console.log('2a rodada (deveria 0 reminders):', res2);

    // limpa
    await prisma.personalReminder.delete({ where: { id: rem.id } });
    await prisma.message.deleteMany({ where: { metadata: { path: ['personalReminderId'], equals: rem.id } } });
  } finally {
    await app.close();
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error('FALHOU:', e?.message, e?.stack); process.exit(1); });
