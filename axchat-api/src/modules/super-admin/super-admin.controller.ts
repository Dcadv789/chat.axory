import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import { JwtAuthGuard, SuperAdminGuard } from '../../common/guards';
import { ToolRegistry } from '../ai-agents/tools/tool-registry.service';
import { AddOrganizationMemberDto } from './dto/add-organization-member.dto';
import { CreateOrganizationAdminDto } from './dto/create-organization-admin.dto';
import { CreateSuperUserDto } from './dto/create-super-user.dto';
import { UpdateSuperUserDto } from './dto/update-super-user.dto';
import { SuspendOrganizationDto } from './dto/suspend-organization.dto';
import { UpdateBillingDto } from './dto/update-billing.dto';
import { UpdateOrganizationPlanDto } from './dto/update-organization-plan.dto';
import { UpdatePlanTemplateDto } from './dto/update-plan-template.dto';
import { SuperAdminService } from './super-admin.service';

@ApiTags('Super Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('super-admin')
export class SuperAdminController {
  constructor(
    private readonly service: SuperAdminService,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  @Get('overview')
  overview(@CurrentUser('id') actorId: string) {
    return this.service.overview(actorId);
  }

  @Get('organizations')
  organizations(
    @CurrentUser('id') actorId: string,
    @Query('search') search?: string,
  ) {
    return this.service.organizations(actorId, search);
  }

  @Post('organizations')
  createOrganization(
    @CurrentUser('id') actorId: string,
    @Body() dto: CreateOrganizationAdminDto,
  ) {
    return this.service.createOrganization(actorId, dto);
  }

  @Patch('organizations/:id/plan')
  updateOrganizationPlan(
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationPlanDto,
  ) {
    return this.service.updateOrganizationPlan(actorId, id, dto);
  }

  @Get('plans')
  listPlanTemplates(@CurrentUser('id') actorId: string) {
    return this.service.listPlanTemplates(actorId);
  }

  @Patch('plans/:plan')
  updatePlanTemplate(
    @CurrentUser('id') actorId: string,
    @Param('plan') plan: string,
    @Body() dto: UpdatePlanTemplateDto,
  ) {
    return this.service.updatePlanTemplate(actorId, plan, dto);
  }

  @Patch('organizations/:id/billing')
  updateBilling(
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBillingDto,
  ) {
    return this.service.updateBilling(actorId, id, dto);
  }

  @Post('organizations/:id/suspend')
  suspendOrganization(
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Body() dto: SuspendOrganizationDto,
  ) {
    return this.service.suspendOrganization(actorId, id, dto.reason);
  }

  @Post('organizations/:id/unsuspend')
  unsuspendOrganization(
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
  ) {
    return this.service.unsuspendOrganization(actorId, id);
  }

  @Post('organizations/:id/members')
  addOrganizationMember(
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Body() dto: AddOrganizationMemberDto,
  ) {
    return this.service.addOrganizationMember(actorId, id, dto);
  }

  @Patch('organizations/:id/members/:membershipId')
  updateOrganizationMember(
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: { role: 'OWNER' | 'ADMIN' | 'AGENT' },
  ) {
    return this.service.updateOrganizationMember(actorId, id, membershipId, dto.role);
  }

  @Post('organizations/:id/members/:membershipId/remove')
  removeOrganizationMember(
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.service.removeOrganizationMember(actorId, id, membershipId);
  }

  @Post('organizations/:id/impersonate/:userId')
  impersonate(
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.service.impersonate(actorId, id, userId);
  }

  @Get('audit-logs')
  auditLogs(
    @Query('organizationId') organizationId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.auditLogs(organizationId, limit ? Number(limit) : undefined);
  }

  @Get('users')
  users(@Query('search') search?: string) {
    return this.service.users(search);
  }

  @Post('users')
  createUser(@CurrentUser('id') actorId: string, @Body() dto: CreateSuperUserDto) {
    return this.service.createUser(actorId, dto);
  }

  @Patch('users/:id/status')
  updateUserStatus(
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Body() dto: { isActive?: boolean; isSuperAdmin?: boolean },
  ) {
    return this.service.updateUserStatus(actorId, id, dto);
  }

  @Patch('users/:id')
  updateUser(
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSuperUserDto,
  ) {
    return this.service.updateUser(actorId, id, dto);
  }

  // ─── AI Agents ──────────────────────────────────────

  @Get('agents')
  @ApiOperation({ summary: 'List all AI agents across all organizations.' })
  listAllAgents(
    @CurrentUser('id') actorId: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.service.listAllAgents(actorId, organizationId);
  }

  @Post('agents/:id/copy')
  @ApiOperation({ summary: 'Copy an agent to another organization.' })
  copyAgent(
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Body('targetOrgId') targetOrgId: string,
  ) {
    return this.service.copyAgent(actorId, id, targetOrgId);
  }

  @Post('agents/copy-bulk')
  @ApiOperation({ summary: 'Copy all agents from one organization to another.' })
  copyAgentsBulk(
    @CurrentUser('id') actorId: string,
    @Body('sourceOrgId') sourceOrgId: string,
    @Body('targetOrgId') targetOrgId: string,
  ) {
    return this.service.copyAgentsBulk(actorId, sourceOrgId, targetOrgId);
  }

  @Patch('agents/:id')
  @ApiOperation({ summary: 'Update an AI agent (super admin override).' })
  updateAgent(
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Body() dto: Record<string, any>,
  ) {
    return this.service.updateAgent(actorId, id, dto);
  }

  @Get('organizations/:orgId/ai-models')
  @ApiOperation({ summary: 'List AI model providers for a specific organization.' })
  listOrgModels(
    @CurrentUser('id') actorId: string,
    @Param('orgId') orgId: string,
  ) {
    return this.service.listOrgModels(actorId, orgId);
  }

  // ─── Global Departments ─────────────────────────────

  @Get('departments')
  @ApiOperation({ summary: 'List all global departments.' })
  listDepartments(@CurrentUser('id') actorId: string) {
    return this.service.listDepartments(actorId);
  }

  @Post('departments')
  @ApiOperation({ summary: 'Create a new global department.' })
  createDepartment(
    @CurrentUser('id') actorId: string,
    @Body('name') name: string,
  ) {
    return this.service.createDepartment(actorId, name);
  }

  @Patch('departments/:id')
  @ApiOperation({ summary: 'Rename a global department.' })
  updateDepartment(
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Body('name') name: string,
  ) {
    return this.service.updateDepartment(actorId, id, name);
  }

  @Delete('departments/:id')
  @ApiOperation({ summary: 'Delete a global department.' })
  removeDepartment(
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
  ) {
    return this.service.removeDepartment(actorId, id);
  }

  // ─── Agent Sectors ───────────────────────────────────

  @Get('organizations/:orgId/sectors')
  @ApiOperation({ summary: 'List agent sectors for a specific organization.' })
  listOrgSectors(
    @CurrentUser('id') actorId: string,
    @Param('orgId') orgId: string,
  ) {
    return this.service.listOrgSectors(actorId, orgId);
  }

  @Post('sectors/:sectorId/agents')
  @ApiOperation({ summary: 'Add an agent to a sector (super admin).' })
  addAgentToSector(
    @CurrentUser('id') actorId: string,
    @Param('sectorId') sectorId: string,
    @Body('agentId') agentId: string,
  ) {
    return this.service.addAgentToSector(actorId, sectorId, agentId);
  }

  @Delete('sectors/:sectorId/agents/:agentId')
  @ApiOperation({ summary: 'Remove an agent from a sector (super admin).' })
  removeAgentFromSector(
    @CurrentUser('id') actorId: string,
    @Param('sectorId') sectorId: string,
    @Param('agentId') agentId: string,
  ) {
    return this.service.removeAgentFromSector(actorId, sectorId, agentId);
  }

  // ─── Built-in Tools (referência) ──────────────────────

  @Get('builtin-tools')
  @ApiOperation({ summary: 'Lista todas as tools built-in do sistema' })
  listBuiltinTools() {
    return this.toolRegistry.listAllBuiltin();
  }

  // ─── Skills Management ────────────────────────────────

  @Get('skills')
  @ApiOperation({ summary: 'List all skills across organizations' })
  listAllSkills(@Query('organizationId') organizationId?: string) {
    return this.service.listAllSkills(organizationId);
  }

  @Post('skills/:id/copy')
  @ApiOperation({ summary: 'Copy a skill to another organization (credentials NOT copied)' })
  copySkill(
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Body('targetOrgId') targetOrgId: string,
  ) {
    return this.service.copySkill(actorId, id, targetOrgId);
  }
}
