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
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';
import { AgentSectorsService } from './agent-sectors.service';
import {
  CreateAgentSectorDto,
  UpdateAgentSectorDto,
  AddAgentToSectorDto,
  ReorderSectorsDto,
} from './dto/agent-sector.dto';
import { JwtAuthGuard, OrgGuard, RolesGuard } from '../../common/guards';
import { CurrentOrg, Roles } from '../../common/decorators';

@ApiTags('Agent Sectors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard, RolesGuard)
@Controller('agent-sectors')
export class AgentSectorsController {
  constructor(private readonly service: AgentSectorsService) {}

  @Get()
  @ApiOperation({ summary: 'List all agent sectors for the current organization' })
  list(@CurrentOrg('id') orgId: string) {
    return this.service.list(orgId);
  }

  @Patch('reorder')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Reorder agent sectors' })
  reorder(@CurrentOrg('id') orgId: string, @Body() dto: ReorderSectorsDto) {
    return this.service.reorder(orgId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single agent sector with its agents' })
  getById(@CurrentOrg('id') orgId: string, @Param('id') id: string) {
    return this.service.getById(orgId, id);
  }

  @Post()
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Create a new agent sector' })
  create(@CurrentOrg('id') orgId: string, @Body() dto: CreateAgentSectorDto) {
    return this.service.create(orgId, dto);
  }

  @Patch(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Update an agent sector' })
  update(
    @CurrentOrg('id') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAgentSectorDto,
  ) {
    return this.service.update(orgId, id, dto);
  }

  @Delete(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Delete an agent sector' })
  remove(@CurrentOrg('id') orgId: string, @Param('id') id: string) {
    return this.service.remove(orgId, id);
  }

  @Post(':id/agents')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Add an agent to a sector' })
  addAgent(
    @CurrentOrg('id') orgId: string,
    @Param('id') id: string,
    @Body() dto: AddAgentToSectorDto,
  ) {
    return this.service.addAgent(orgId, id, dto);
  }

  @Delete(':id/agents/:agentId')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Remove an agent from a sector' })
  removeAgent(
    @CurrentOrg('id') orgId: string,
    @Param('id') id: string,
    @Param('agentId') agentId: string,
  ) {
    return this.service.removeAgent(orgId, id, agentId);
  }
}
