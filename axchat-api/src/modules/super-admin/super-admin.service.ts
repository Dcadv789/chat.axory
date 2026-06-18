import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BillingStatus, OrgRole, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import type { SignOptions } from 'jsonwebtoken';
import { PrismaService } from '../../database/prisma.service';
import { AddOrganizationMemberDto } from './dto/add-organization-member.dto';
import { CreateOrganizationAdminDto } from './dto/create-organization-admin.dto';
import { CreateSuperUserDto } from './dto/create-super-user.dto';
import { UpdateSuperUserDto } from './dto/update-super-user.dto';
import { UpdateBillingDto } from './dto/update-billing.dto';
import { UpdateOrganizationPlanDto } from './dto/update-organization-plan.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async overview(actorId: string) {
    const [
      organizations,
      activeOrganizations,
      suspendedOrganizations,
      users,
      superAdmins,
      channels,
      activeChannels,
      agents,
      conversations,
      messages,
      planRows,
      billingRows,
    ] = await Promise.all([
      this.prisma.organization.count({ where: { deletedAt: null } }),
      this.prisma.organization.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.organization.count({ where: { deletedAt: null, status: 'SUSPENDED' } }),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, isSuperAdmin: true } }),
      this.prisma.channel.count({ where: { deletedAt: null } }),
      this.prisma.channel.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.aiAgent.count({ where: { deletedAt: null } }),
      this.prisma.conversation.count({ where: { deletedAt: null } }),
      this.prisma.message.count(),
      this.prisma.organization.groupBy({
        by: ['plan'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.organization.groupBy({
        by: ['billingStatus'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
    ]);

    await this.audit(actorId, 'VIEW_OVERVIEW', 'platform', null, null);

    return {
      organizations,
      activeOrganizations,
      suspendedOrganizations,
      users,
      superAdmins,
      channels,
      activeChannels,
      agents,
      conversations,
      messages,
      plans: planRows.map((row) => ({ plan: row.plan, count: row._count._all })),
      billing: billingRows.map((row) => ({
        status: row.billingStatus,
        count: row._count._all,
      })),
    };
  }

  async organizations(actorId: string, search?: string) {
    await this.audit(actorId, 'LIST_ORGANIZATIONS', 'platform', null, null, {
      search: search || null,
    });

    return this.prisma.organization.findMany({
      where: {
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { slug: { contains: search, mode: 'insensitive' } },
                { plan: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        settings: true,
        status: true,
        suspendedAt: true,
        suspendedReason: true,
        billingStatus: true,
        billingEmail: true,
        billingAmountCents: true,
        billingCurrency: true,
        billingCycle: true,
        billingDueDay: true,
        trialEndsAt: true,
        currentPeriodEndsAt: true,
        aiEnabled: true,
        aiMonthlyTokenCap: true,
        monthlyConversationLimit: true,
        createdAt: true,
        _count: {
          select: {
            members: true,
            channels: true,
            conversations: true,
            aiAgents: true,
          },
        },
        members: {
          orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
          select: {
            id: true,
            userId: true,
            role: true,
            joinedAt: true,
            user: { select: { name: true, email: true, isActive: true } },
          },
        },
      },
    });
  }

  async users(search?: string) {
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        isActive: true,
        isSuperAdmin: true,
        createdAt: true,
        organizations: {
          select: {
            id: true,
            role: true,
            joinedAt: true,
            organization: {
              select: { id: true, name: true, slug: true, plan: true, status: true },
            },
          },
        },
      },
    });
  }

  async createUser(actorId: string, dto: CreateSuperUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password,
        isActive: true,
        isSuperAdmin: dto.isSuperAdmin ?? false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        isSuperAdmin: true,
        createdAt: true,
      },
    });

    await this.audit(actorId, 'CREATE_USER', 'user', user.id, null, {
      email: user.email,
      isSuperAdmin: user.isSuperAdmin,
    });

    return user;
  }

  async createOrganization(actorId: string, dto: CreateOrganizationAdminDto) {
    const slug = dto.slug?.trim() || this.slugify(dto.organizationName);
    const [existingOrg, existingUser] = await Promise.all([
      this.prisma.organization.findUnique({ where: { slug } }),
      this.prisma.user.findUnique({ where: { email: dto.ownerEmail } }),
    ]);

    if (existingOrg) throw new ConflictException('Organization slug already exists');
    if (existingUser) throw new ConflictException('Owner email already registered');

    const password = await bcrypt.hash(dto.ownerPassword, BCRYPT_ROUNDS);

    const result = await this.prisma.$transaction(async (tx) => {
      const owner = await tx.user.create({
        data: {
          name: dto.ownerName,
          email: dto.ownerEmail,
          password,
          isActive: true,
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: dto.organizationName,
          slug,
          plan: dto.plan || 'free',
          settings: defaultSettingsForPlan(dto.plan || 'free'),
        },
      });

      const membership = await tx.userOrganization.create({
        data: { userId: owner.id, organizationId: organization.id, role: 'OWNER' },
      });

      const department = await tx.department.create({
        data: {
          organizationId: organization.id,
          name: 'Geral',
          description: 'Departamento padrao',
          isDefault: true,
        },
      });

      await tx.departmentAgent.create({
        data: { departmentId: department.id, userOrganizationId: membership.id },
      });

      return { organization, owner: sanitizeUser(owner) };
    });

    await this.audit(
      actorId,
      'CREATE_ORGANIZATION',
      'organization',
      result.organization.id,
      result.organization.id,
      { ownerEmail: dto.ownerEmail, plan: result.organization.plan },
    );

    return result;
  }

  async updateOrganizationPlan(
    actorId: string,
    id: string,
    dto: UpdateOrganizationPlanDto,
  ) {
    const organization = await this.ensureOrganization(id);

    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        ...(dto.plan !== undefined ? { plan: dto.plan } : {}),
        ...(dto.settings !== undefined
          ? { settings: dto.settings as Prisma.InputJsonValue }
          : {}),
        ...(dto.aiEnabled !== undefined ? { aiEnabled: dto.aiEnabled } : {}),
        ...(dto.aiMonthlyTokenCap !== undefined
          ? { aiMonthlyTokenCap: dto.aiMonthlyTokenCap }
          : {}),
        ...(dto.monthlyConversationLimit !== undefined
          ? { monthlyConversationLimit: dto.monthlyConversationLimit }
          : {}),
      },
    });

    await this.audit(actorId, 'UPDATE_ORGANIZATION_PLAN', 'organization', id, id, {
      before: {
        plan: organization.plan,
        aiEnabled: organization.aiEnabled,
        aiMonthlyTokenCap: organization.aiMonthlyTokenCap,
        monthlyConversationLimit: organization.monthlyConversationLimit,
      },
      after: {
        plan: updated.plan,
        aiEnabled: updated.aiEnabled,
        aiMonthlyTokenCap: updated.aiMonthlyTokenCap,
        monthlyConversationLimit: updated.monthlyConversationLimit,
      },
    });

    return updated;
  }

  async updateBilling(actorId: string, id: string, dto: UpdateBillingDto) {
    await this.ensureOrganization(id);
    const billingStatus = dto.billingStatus as BillingStatus | undefined;

    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        ...(billingStatus !== undefined ? { billingStatus } : {}),
        ...(dto.billingEmail !== undefined ? { billingEmail: dto.billingEmail || null } : {}),
        ...(dto.billingAmountCents !== undefined
          ? { billingAmountCents: dto.billingAmountCents }
          : {}),
        ...(dto.billingCurrency !== undefined ? { billingCurrency: dto.billingCurrency } : {}),
        ...(dto.billingCycle !== undefined ? { billingCycle: dto.billingCycle } : {}),
        ...(dto.billingDueDay !== undefined ? { billingDueDay: dto.billingDueDay } : {}),
        ...(dto.trialEndsAt !== undefined
          ? { trialEndsAt: dto.trialEndsAt ? new Date(dto.trialEndsAt) : null }
          : {}),
        ...(dto.currentPeriodEndsAt !== undefined
          ? {
              currentPeriodEndsAt: dto.currentPeriodEndsAt
                ? new Date(dto.currentPeriodEndsAt)
                : null,
            }
          : {}),
      },
    });

    await this.audit(actorId, 'UPDATE_BILLING', 'organization', id, id, {
      billingStatus: updated.billingStatus,
      billingAmountCents: updated.billingAmountCents,
      billingCycle: updated.billingCycle,
    });

    return updated;
  }

  async suspendOrganization(actorId: string, id: string, reason?: string) {
    await this.ensureOrganization(id);
    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        status: 'SUSPENDED',
        suspendedAt: new Date(),
        suspendedReason: reason || 'Suspended by super admin',
      },
    });

    await this.audit(actorId, 'SUSPEND_ORGANIZATION', 'organization', id, id, {
      reason: updated.suspendedReason,
    });

    return updated;
  }

  async unsuspendOrganization(actorId: string, id: string) {
    await this.ensureOrganization(id);
    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        suspendedAt: null,
        suspendedReason: null,
      },
    });

    await this.audit(actorId, 'UNSUSPEND_ORGANIZATION', 'organization', id, id);
    return updated;
  }

  async addOrganizationMember(
    actorId: string,
    id: string,
    dto: AddOrganizationMemberDto,
  ) {
    const [organization, user] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id } }),
      this.prisma.user.findUnique({ where: { email: dto.email } }),
    ]);
    if (!organization) throw new NotFoundException('Organization not found');
    if (!user) throw new NotFoundException('User not found. Create the user first.');

    const existing = await this.prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: id } },
    });
    if (existing) throw new ConflictException('User is already a member of this organization');

    const membership = await this.prisma.$transaction(async (tx) => {
      const created = await tx.userOrganization.create({
        data: { userId: user.id, organizationId: id, role: dto.role },
        include: { user: { select: { name: true, email: true, isActive: true } } },
      });

      const defaultDept = await tx.department.findFirst({
        where: { organizationId: id, isDefault: true },
      });
      if (defaultDept) {
        await tx.departmentAgent.create({
          data: {
            departmentId: defaultDept.id,
            userOrganizationId: created.id,
          },
        });
      }

      return created;
    });

    await this.audit(actorId, 'ADD_ORGANIZATION_MEMBER', 'membership', membership.id, id, {
      userId: user.id,
      email: user.email,
      role: membership.role,
    });

    return membership;
  }

  async updateOrganizationMember(
    actorId: string,
    organizationId: string,
    membershipId: string,
    role: OrgRole,
  ) {
    const membership = await this.prisma.userOrganization.findFirst({
      where: { id: membershipId, organizationId },
    });
    if (!membership) throw new NotFoundException('Membership not found');

    const updated = await this.prisma.userOrganization.update({
      where: { id: membershipId },
      data: { role },
      include: { user: { select: { name: true, email: true, isActive: true } } },
    });

    await this.audit(actorId, 'UPDATE_ORGANIZATION_MEMBER', 'membership', membershipId, organizationId, {
      beforeRole: membership.role,
      afterRole: updated.role,
    });

    return updated;
  }

  async removeOrganizationMember(
    actorId: string,
    organizationId: string,
    membershipId: string,
  ) {
    const membership = await this.prisma.userOrganization.findFirst({
      where: { id: membershipId, organizationId },
      include: { user: { select: { email: true } } },
    });
    if (!membership) throw new NotFoundException('Membership not found');

    if (membership.role === 'OWNER') {
      const owners = await this.prisma.userOrganization.count({
        where: { organizationId, role: 'OWNER' },
      });
      if (owners <= 1) {
        throw new ForbiddenException('Cannot remove the last owner of an organization');
      }
    }

    await this.prisma.userOrganization.delete({ where: { id: membershipId } });
    await this.audit(actorId, 'REMOVE_ORGANIZATION_MEMBER', 'membership', membershipId, organizationId, {
      userId: membership.userId,
      email: membership.user.email,
      role: membership.role,
    });

    return { removed: true };
  }

  async updateUser(actorId: string, id: string, dto: UpdateSuperUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw new NotFoundException('User not found');
    if (actorId === id && dto.isActive === false) {
      throw new BadRequestException('You cannot deactivate your own user');
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) throw new ConflictException('Email already registered');
    }

    const password =
      dto.password !== undefined ? await bcrypt.hash(dto.password, BCRYPT_ROUNDS) : undefined;

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email.trim().toLowerCase() } : {}),
        ...(password !== undefined ? { password } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.isSuperAdmin !== undefined ? { isSuperAdmin: dto.isSuperAdmin } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        isSuperAdmin: true,
        createdAt: true,
        organizations: {
          select: {
            id: true,
            role: true,
            joinedAt: true,
            organization: {
              select: { id: true, name: true, slug: true, plan: true, status: true },
            },
          },
        },
      },
    });

    await this.audit(actorId, 'UPDATE_USER', 'user', id, null, {
      before: {
        name: user.name,
        email: user.email,
        isActive: user.isActive,
        isSuperAdmin: user.isSuperAdmin,
        passwordChanged: false,
      },
      after: {
        name: updated.name,
        email: updated.email,
        isActive: updated.isActive,
        isSuperAdmin: updated.isSuperAdmin,
        passwordChanged: password !== undefined,
      },
    });

    return updated;
  }

  async updateUserStatus(
    actorId: string,
    id: string,
    dto: { isActive?: boolean; isSuperAdmin?: boolean },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (actorId === id && dto.isActive === false) {
      throw new BadRequestException('You cannot deactivate your own user');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.isSuperAdmin !== undefined ? { isSuperAdmin: dto.isSuperAdmin } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        isSuperAdmin: true,
      },
    });

    await this.audit(actorId, 'UPDATE_USER_STATUS', 'user', id, null, {
      before: { isActive: user.isActive, isSuperAdmin: user.isSuperAdmin },
      after: { isActive: updated.isActive, isSuperAdmin: updated.isSuperAdmin },
    });

    return updated;
  }

  async impersonate(actorId: string, organizationId: string, userId: string) {
    const membership = await this.prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: {
        user: true,
        organization: true,
      },
    });

    if (!membership || membership.organization.deletedAt) {
      throw new NotFoundException('User is not a member of this organization');
    }
    if (!membership.user.isActive || membership.user.deletedAt) {
      throw new ForbiddenException('Cannot impersonate an inactive user');
    }

    const memberships = await this.prisma.userOrganization.findMany({
      where: { userId },
      include: {
        organization: true,
        channelAgents: { select: { channelId: true } },
      },
    });

    const tokens = await this.generateTokens(userId, membership.user.email, actorId);

    await this.audit(actorId, 'IMPERSONATE_USER', 'user', userId, organizationId, {
      email: membership.user.email,
      organization: membership.organization.slug,
    });

    return {
      user: sanitizeUser(membership.user),
      organizations: memberships
        .filter((item) => !item.organization.deletedAt)
        .map((item) => ({
          id: item.organization.id,
          name: item.organization.name,
          slug: item.organization.slug,
          plan: item.organization.plan,
          role: item.role,
          userOrganizationId: item.id,
          channelIds: item.channelAgents.map((grant) => grant.channelId),
        })),
      impersonatedBy: actorId,
      ...tokens,
    };
  }

  async auditLogs(organizationId?: string, limit = 100) {
    const take = Math.max(1, Math.min(Number.isFinite(limit) ? limit : 100, 200));
    return this.prisma.superAdminAuditLog.findMany({
      where: organizationId ? { organizationId } : undefined,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        actor: { select: { id: true, name: true, email: true } },
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  private async ensureOrganization(id: string) {
    const organization = await this.prisma.organization.findUnique({ where: { id } });
    if (!organization || organization.deletedAt) {
      throw new NotFoundException('Organization not found');
    }
    return organization;
  }

  private async generateTokens(userId: string, email: string, impersonatedBy?: string) {
    const payload = { sub: userId, email, impersonatedBy };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET')!,
        expiresIn: this.configService.get<string>(
          'JWT_REFRESH_EXPIRATION',
          '7d',
        ) as SignOptions['expiresIn'],
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async audit(
    actorId: string | null,
    action: string,
    targetType: string,
    targetId: string | null,
    organizationId: string | null,
    metadata: Prisma.InputJsonValue = {},
  ) {
    try {
      await this.prisma.superAdminAuditLog.create({
        data: {
          actorId,
          action,
          targetType,
          targetId,
          organizationId,
          metadata,
        },
      });
    } catch {
      // Audit failure must not break the admin operation.
    }
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}

function defaultSettingsForPlan(plan: string) {
  const settingsByPlan: Record<string, Record<string, number>> = {
    free: { maxAgents: 2, maxChannels: 1, maxDepartments: 1 },
    starter: { maxAgents: 5, maxChannels: 2, maxDepartments: 3 },
    pro: { maxAgents: 25, maxChannels: 10, maxDepartments: 10 },
    enterprise: { maxAgents: 999, maxChannels: 999, maxDepartments: 999 },
  };
  return settingsByPlan[plan] ?? settingsByPlan.free;
}

function sanitizeUser<T extends { password: string }>(user: T) {
  const { password: _, ...rest } = user;
  return rest;
}
