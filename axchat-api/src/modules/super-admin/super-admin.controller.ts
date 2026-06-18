import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import { JwtAuthGuard, SuperAdminGuard } from '../../common/guards';
import { AddOrganizationMemberDto } from './dto/add-organization-member.dto';
import { CreateOrganizationAdminDto } from './dto/create-organization-admin.dto';
import { CreateSuperUserDto } from './dto/create-super-user.dto';
import { UpdateSuperUserDto } from './dto/update-super-user.dto';
import { SuspendOrganizationDto } from './dto/suspend-organization.dto';
import { UpdateBillingDto } from './dto/update-billing.dto';
import { UpdateOrganizationPlanDto } from './dto/update-organization-plan.dto';
import { SuperAdminService } from './super-admin.service';

@ApiTags('Super Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('super-admin')
export class SuperAdminController {
  constructor(private readonly service: SuperAdminService) {}

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
}
