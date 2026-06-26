import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../database/prisma.service';
import { ToolContext } from '../../tool.types';

/**
 * Resolve QUAL usuário (dono) o assistente pessoal atende, a partir do
 * ToolContext. O vínculo está em PersonalAssistantConfig (organizationId+agentId).
 * Todas as ferramentas pessoais escopam suas queries por (organizationId+userId).
 */
@Injectable()
export class PersonalContextService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveUserId(ctx: ToolContext): Promise<string | null> {
    const cfg = await this.prisma.personalAssistantConfig.findFirst({
      where: { organizationId: ctx.organizationId, agentId: ctx.agentId },
      select: { userId: true },
    });
    return cfg?.userId ?? null;
  }
}
