import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';
import { AgentCronsService } from './agent-crons.service';
import { CreateAgentCronDto } from './dto/create-agent-cron.dto';
import { UpdateAgentCronDto } from './dto/update-agent-cron.dto';
import { CurrentOrg, Roles } from '../../../common/decorators';
import { JwtAuthGuard, OrgGuard, RolesGuard } from '../../../common/guards';

@ApiTags('AI Agent Crons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard, RolesGuard)
@Controller('agent-crons')
export class AgentCronsController {
  constructor(private readonly service: AgentCronsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista os crons de agente da organização' })
  list(@CurrentOrg('id') orgId: string) {
    return this.service.list(orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um cron' })
  findOne(@CurrentOrg('id') orgId: string, @Param('id') id: string) {
    return this.service.findOne(orgId, id);
  }

  @Post()
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Cria um cron de agente' })
  create(@CurrentOrg('id') orgId: string, @Body() dto: CreateAgentCronDto) {
    return this.service.create(orgId, dto);
  }

  @Patch(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Atualiza um cron de agente' })
  update(
    @CurrentOrg('id') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAgentCronDto,
  ) {
    return this.service.update(orgId, id, dto);
  }

  @Delete(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Remove (soft-delete) um cron' })
  remove(@CurrentOrg('id') orgId: string, @Param('id') id: string) {
    return this.service.remove(orgId, id);
  }

  @Post(':id/run-now')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Dispara o cron imediatamente (sem esperar o agendamento)' })
  runNow(@CurrentOrg('id') orgId: string, @Param('id') id: string) {
    return this.service.runNow(orgId, id);
  }
}
