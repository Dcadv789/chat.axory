import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { PersonalAssistantProvisioningService } from './personal-assistant-provisioning.service';
import { CurrentOrg, Roles } from '../../../common/decorators';
import { JwtAuthGuard, OrgGuard, RolesGuard } from '../../../common/guards';

@ApiTags('Personal Assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard, RolesGuard)
@Controller('personal-assistant')
export class PersonalAssistantController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: PersonalAssistantProvisioningService,
  ) {}

  private async ensureEnabled(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { assistantEnabled: true },
    });
    if (!org?.assistantEnabled) {
      throw new ForbiddenException(
        'Add-on de Assistente Pessoal não habilitado para esta organização.',
      );
    }
  }

  @Get('config')
  @ApiOperation({ summary: 'Configuração do assistente pessoal da org' })
  async config(@CurrentOrg('id') orgId: string) {
    await this.ensureEnabled(orgId);
    const cfg = await this.prisma.personalAssistantConfig.findFirst({
      where: { organizationId: orgId },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!cfg) return null;
    // agentId/channelId são campos simples (sem FK relation); resolve o nome do
    // agente à parte pra UI.
    const agent = cfg.agentId
      ? await this.prisma.aiAgent.findUnique({
          where: { id: cfg.agentId },
          select: { id: true, name: true },
        })
      : null;
    return { ...cfg, agent };
  }

  @Post('provision')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({
    summary:
      'Provisiona (ou re-aplica) o assistente pessoal para o dono da org. Botão "replicar para novo cliente".',
  })
  async provision(
    @CurrentOrg('id') orgId: string,
    @Body() body: { userId?: string },
  ) {
    await this.ensureEnabled(orgId);
    return this.provisioning.provisionForOrg(orgId, body?.userId);
  }
}
