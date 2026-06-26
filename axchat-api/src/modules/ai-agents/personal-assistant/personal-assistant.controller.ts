import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { PersonalAssistantProvisioningService } from './personal-assistant-provisioning.service';
import { PersonalAssistantService } from './personal-assistant.service';
import { CurrentOrg, CurrentUser, Roles } from '../../../common/decorators';
import { JwtAuthGuard, OrgGuard, RolesGuard } from '../../../common/guards';

@ApiTags('Personal Assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard, RolesGuard)
@Controller('personal-assistant')
export class PersonalAssistantController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: PersonalAssistantProvisioningService,
    private readonly service: PersonalAssistantService,
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

  // ─── Dados pessoais do usuário logado (escopo org+userId) ───

  @Get('channels')
  @ApiOperation({ summary: 'Canais do assistente (+ disponíveis pra adicionar)' })
  async listChannels(@CurrentOrg('id') orgId: string, @CurrentUser('id') userId: string) {
    await this.ensureEnabled(orgId);
    return this.service.listChannels(orgId, userId);
  }

  @Post('channels')
  @ApiOperation({ summary: 'Adiciona um canal dedicado ao assistente' })
  async addChannel(
    @CurrentOrg('id') orgId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { channelId: string },
  ) {
    await this.ensureEnabled(orgId);
    return this.provisioning.attachChannel(orgId, userId, body.channelId);
  }

  @Delete('channels/:channelId')
  @ApiOperation({ summary: 'Remove um canal do assistente (não o principal)' })
  async removeChannel(
    @CurrentOrg('id') orgId: string,
    @CurrentUser('id') userId: string,
    @Param('channelId') channelId: string,
  ) {
    await this.ensureEnabled(orgId);
    return this.provisioning.detachChannel(orgId, userId, channelId);
  }

  @Get('overview')
  @ApiOperation({ summary: 'Painel: config, chat, métricas isoladas e listas' })
  async overview(@CurrentOrg('id') orgId: string, @CurrentUser('id') userId: string) {
    await this.ensureEnabled(orgId);
    return this.service.overview(orgId, userId);
  }

  @Patch('config')
  @ApiOperation({ summary: 'Atualiza config do assistente (briefing diário, fuso)' })
  async updateConfig(
    @CurrentOrg('id') orgId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { dailyBriefingHour?: number | null; timezone?: string },
  ) {
    await this.ensureEnabled(orgId);
    return this.service.updateConfig(orgId, userId, body);
  }

  @Get('tasks')
  async listTasks(@CurrentOrg('id') orgId: string, @CurrentUser('id') userId: string) {
    await this.ensureEnabled(orgId);
    return this.service.listTasks(orgId, userId);
  }

  @Post('tasks')
  async createTask(
    @CurrentOrg('id') orgId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { title: string; notes?: string; dueAt?: string; priority?: number },
  ) {
    await this.ensureEnabled(orgId);
    return this.service.createTask(orgId, userId, body);
  }

  @Patch('tasks/:id')
  async updateTask(
    @CurrentOrg('id') orgId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: { title?: string; notes?: string; dueAt?: string | null; status?: string },
  ) {
    await this.ensureEnabled(orgId);
    return this.service.updateTask(orgId, userId, id, body);
  }

  @Delete('tasks/:id')
  async deleteTask(
    @CurrentOrg('id') orgId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    await this.ensureEnabled(orgId);
    return this.service.deleteTask(orgId, userId, id);
  }

  @Get('notes')
  async listNotes(@CurrentOrg('id') orgId: string, @CurrentUser('id') userId: string) {
    await this.ensureEnabled(orgId);
    return this.service.listNotes(orgId, userId);
  }

  @Post('notes')
  async createNote(
    @CurrentOrg('id') orgId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { content: string; tags?: string[] },
  ) {
    await this.ensureEnabled(orgId);
    return this.service.createNote(orgId, userId, body);
  }

  @Delete('notes/:id')
  async deleteNote(
    @CurrentOrg('id') orgId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    await this.ensureEnabled(orgId);
    return this.service.deleteNote(orgId, userId, id);
  }

  @Get('events')
  async listEvents(@CurrentOrg('id') orgId: string, @CurrentUser('id') userId: string) {
    await this.ensureEnabled(orgId);
    return this.service.listEvents(orgId, userId);
  }

  @Post('events')
  async createEvent(
    @CurrentOrg('id') orgId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { title: string; startAt: string; endAt?: string; location?: string; description?: string },
  ) {
    await this.ensureEnabled(orgId);
    return this.service.createEvent(orgId, userId, body);
  }

  @Delete('reminders/:id')
  async cancelReminder(
    @CurrentOrg('id') orgId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    await this.ensureEnabled(orgId);
    return this.service.cancelReminder(orgId, userId, id);
  }
}
