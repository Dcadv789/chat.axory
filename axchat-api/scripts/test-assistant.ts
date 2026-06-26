/**
 * Teste end-to-end do assistente pessoal: manda uma mensagem real pro agente
 * (via o runner) e checa se ele criou evento + lembrete. Usa a chave de LLM
 * da org. Uso: ORG_NAME="Axory Capital Group" npx ts-node scripts/test-assistant.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { AiAgentRunnerService } from '../src/modules/ai-agents/runner/agent-runner.service';

async function main() {
  const orgName = process.env.ORG_NAME || 'Axory Capital Group';
  const prompt =
    process.env.ASSISTANT_PROMPT ||
    'Marca um dentista quinta-feira às 15h e me lembra 30 minutos antes.';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const prisma = app.get(PrismaService);
    const runner = app.get(AiAgentRunnerService);

    const org = await prisma.organization.findFirst({
      where: { name: orgName, deletedAt: null },
      select: { id: true },
    });
    if (!org) throw new Error(`Org "${orgName}" não encontrada`);

    const cfg = await prisma.personalAssistantConfig.findFirst({
      where: { organizationId: org.id },
    });
    if (!cfg?.channelId) throw new Error('Assistente não provisionado');

    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { channelId: cfg.channelId, deletedAt: null },
    });

    const triggerMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'INBOUND',
        type: 'TEXT',
        content: { text: prompt },
        status: 'DELIVERED',
        senderName: 'Dono',
      },
    });

    console.log(`\n>> Mensagem: "${prompt}"\n`);
    await runner.run({ conversation, triggerMessage, chainDepth: 1 });

    // Lê a resposta do agente + o que ele criou.
    const reply = await prisma.message.findFirst({
      where: { conversationId: conversation.id, direction: 'OUTBOUND' },
      orderBy: { createdAt: 'desc' },
    });
    const events = await prisma.personalCalendarEvent.findMany({
      where: { organizationId: org.id, userId: cfg.userId },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
    const reminders = await prisma.personalReminder.findMany({
      where: { organizationId: org.id, userId: cfg.userId },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    console.log('<< Resposta do assistente:', (reply?.content as any)?.text ?? '(sem resposta)');
    console.log('\nEventos criados:', events.map((e) => `${e.title} @ ${e.startAt.toISOString()}`));
    console.log('Lembretes criados:', reminders.map((r) => `"${r.message}" @ ${r.remindAt.toISOString()}`));
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FALHOU:', err?.message ?? err);
    console.error(err?.stack ?? '');
    process.exit(1);
  });
