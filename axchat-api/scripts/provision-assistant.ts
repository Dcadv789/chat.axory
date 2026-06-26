/**
 * Provisiona o Assistente Pessoal de uma org via o serviço real (sem duplicar
 * lógica). Uso: ORG_NAME="Axory Capital Group" npx ts-node scripts/provision-assistant.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { PersonalAssistantProvisioningService } from '../src/modules/ai-agents/personal-assistant/personal-assistant-provisioning.service';

async function main() {
  const orgName = process.env.ORG_NAME || 'Axory Capital Group';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const prisma = app.get(PrismaService);
    const provisioning = app.get(PersonalAssistantProvisioningService);

    const org = await prisma.organization.findFirst({
      where: { name: orgName, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!org) throw new Error(`Org "${orgName}" não encontrada`);

    // Garante o add-on ligado.
    await prisma.organization.update({
      where: { id: org.id },
      data: { assistantEnabled: true },
    });

    const result = await provisioning.provisionForOrg(org.id);
    console.log(`OK — assistente provisionado para "${org.name}":`, result);
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FALHOU:', err?.message ?? err);
    process.exit(1);
  });
