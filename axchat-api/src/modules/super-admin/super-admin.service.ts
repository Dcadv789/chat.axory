import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AiAgentSector, BillingStatus, OrgRole, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import type { SignOptions } from 'jsonwebtoken';
import { PrismaService } from '../../database/prisma.service';
import { AddOrganizationMemberDto } from './dto/add-organization-member.dto';
import { CreateOrganizationAdminDto } from './dto/create-organization-admin.dto';
import { CreateSuperUserDto } from './dto/create-super-user.dto';
import { UpdateSuperUserDto } from './dto/update-super-user.dto';
import { UpdateBillingDto } from './dto/update-billing.dto';
import { UpdateOrganizationPlanDto } from './dto/update-organization-plan.dto';
import { UpdatePlanTemplateDto } from './dto/update-plan-template.dto';
import { MarketingProvisioningService } from '../ai-agents/marketing/marketing-provisioning.service';
import { PersonalAssistantProvisioningService } from '../ai-agents/personal-assistant/personal-assistant-provisioning.service';

const BCRYPT_ROUNDS = 12;
const PLAN_TEMPLATES_KEY = 'plan_templates';
const PRICING_META_KEY = 'pricing_meta';
const META_COEXISTENCE_KEY = 'meta_coexistence';
// Catálogo comercial real do AxChat (sem plano grátis — trial de 7 dias).
const KNOWN_PLANS = ['inbox', 'essencial', 'profissional', 'performance'] as const;

/**
 * Template de plano = limites operacionais + dados COMERCIAIS (anotados pra
 * referência da equipe; não é landing page). Preços em centavos (BRL).
 */
type PlanTemplate = {
  label: string;
  description: string;
  // Comercial
  pricePerSeatCents: number; // mensal por atendente
  minSeats: number; // mínimo de atendentes
  suiteFlatCents: number; // caixa fixa por org (Marketing+Assistente no Performance); 0 = não tem
  aiConversations: number; // cota de conversas de IA/mês (0 = sem IA)
  includesMarketing: boolean;
  includesAssistant: boolean;
  setupFeeCents: number; // taxa única de implantação
  // Operacional
  maxAgents: number;
  maxChannels: number;
  maxDepartments: number;
};

const BUILTIN_PLAN_TEMPLATES: Record<string, PlanTemplate> = {
  inbox: {
    label: 'Inbox',
    description: 'Caixa de entrada omnichannel + ferramentas de atendimento humano. Sem IA.',
    pricePerSeatCents: 7900,
    minSeats: 2,
    suiteFlatCents: 0,
    aiConversations: 0,
    includesMarketing: false,
    includesAssistant: false,
    setupFeeCents: 49700,
    maxAgents: 0,
    maxChannels: 5,
    maxDepartments: 3,
  },
  essencial: {
    label: 'Essencial',
    description: 'Inbox + IA de atendimento (~1k conversas/mês).',
    pricePerSeatCents: 9700,
    minSeats: 2,
    suiteFlatCents: 0,
    aiConversations: 1000,
    includesMarketing: false,
    includesAssistant: false,
    setupFeeCents: 79700,
    maxAgents: 5,
    maxChannels: 5,
    maxDepartments: 5,
  },
  profissional: {
    label: 'Profissional',
    description: 'IA avançada, watchdog, automações (~3k conversas/mês). Add-ons disponíveis.',
    pricePerSeatCents: 19700,
    minSeats: 3,
    suiteFlatCents: 0,
    aiConversations: 3000,
    includesMarketing: false,
    includesAssistant: false,
    setupFeeCents: 129700,
    maxAgents: 25,
    maxChannels: 15,
    maxDepartments: 15,
  },
  performance: {
    label: 'Performance',
    description: 'Profissional + Suíte (Marketing + Assistente) inclusa (~8k conversas/mês).',
    pricePerSeatCents: 19700,
    minSeats: 3,
    suiteFlatCents: 69700,
    aiConversations: 8000,
    includesMarketing: true,
    includesAssistant: true,
    setupFeeCents: 249700,
    maxAgents: 999,
    maxChannels: 999,
    maxDepartments: 999,
  },
};

/** Referência comercial global (add-ons avulsos, pacotes de IA, notas). */
type PricingMeta = {
  trialDays: number;
  addons: { key: string; label: string; priceCents: number; note: string }[];
  aiPackages: { label: string; conversations: number; priceCents: number }[];
  notes: string;
};

const BUILTIN_PRICING_META: PricingMeta = {
  trialDays: 7,
  addons: [
    { key: 'marketing', label: 'Marketing (crew completa)', priceCents: 69700, note: 'Caixa fixa por org. Substitui ~4 analistas. Implantação assistida recomendada.' },
    { key: 'assistant', label: 'Assistente Pessoal', priceCents: 19700, note: 'Caixa fixa por org, para o dono/gestor.' },
    { key: 'marketing_managed', label: 'Acompanhamento Marketing (opcional)', priceCents: 49700, note: 'Recorrente. Especialista supervisiona a crew. Faixa R$497–997/mês.' },
  ],
  aiPackages: [
    { label: '+1.000 conversas', conversations: 1000, priceCents: 9700 },
    { label: '+5.000 conversas', conversations: 5000, priceCents: 39700 },
    { label: '+10.000 conversas', conversations: 10000, priceCents: 69700 },
  ],
  notes:
    'Sem plano grátis — trial de 7 dias. Cobrança por atendente (seat) + cota de IA; Marketing e Assistente são caixas fixas por org. Implantação grátis (ou 50% off) no plano anual. Setup de Marketing/Performance é assistido (não self-service).',
};

@Injectable()
export class SuperAdminService {
  private readonly logger = new Logger(SuperAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly marketingProvisioning: MarketingProvisioningService,
    private readonly assistantProvisioning: PersonalAssistantProvisioningService,
  ) {}

  /**
   * Clona os agentes de IA de uma empresa-modelo (origem) pra outra (destino),
   * por SETOR INTEIRO. Copia definição + hierarquia (orquestrador/workers),
   * liga aos canais ativos do destino e copia vínculos de skill quando a skill
   * existir no destino (match por nome). NÃO toca na origem. Idempotente: pula
   * agentes que já existem no destino (mesmo nome) — re-rodar não duplica.
   */
  async cloneAgents(
    sourceOrgId: string,
    targetOrgId: string,
    sectors: AiAgentSector[],
    departments?: string[],
  ): Promise<{
    created: string[];
    skipped: string[];
    channelsLinked: number;
    toolsCreated: number;
    skillsCreated: number;
    skillsLinked: number;
  }> {
    if (sourceOrgId === targetOrgId) {
      throw new BadRequestException(
        'Origem e destino não podem ser a mesma empresa.',
      );
    }
    if (!sectors?.length) {
      throw new BadRequestException('Selecione pelo menos um setor.');
    }

    const [source, target] = await Promise.all([
      this.prisma.organization.findFirst({
        where: { id: sourceOrgId, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.organization.findFirst({
        where: { id: targetOrgId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (!source) throw new NotFoundException('Empresa de origem não encontrada.');
    if (!target) throw new NotFoundException('Empresa de destino não encontrada.');

    const sourceAgents = await this.prisma.aiAgent.findMany({
      where: {
        organizationId: sourceOrgId,
        deletedAt: null,
        sector: { in: sectors },
        // Os PRINCIPAIS (isCore) vão SEMPRE; os ACRÉSCIMOS só dos departamentos
        // escolhidos. Sem departamento marcado = só os principais.
        OR: [
          { isCore: true },
          ...(departments && departments.length > 0
            ? [{ department: { in: departments } }]
            : []),
        ],
      },
      include: { skills: true },
    });
    if (sourceAgents.length === 0) {
      throw new BadRequestException(
        'A empresa de origem não tem agentes (principais ou nos departamentos escolhidos) nesses setores.',
      );
    }

    const existing = await this.prisma.aiAgent.findMany({
      where: { organizationId: targetOrgId, deletedAt: null },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((a) => a.name));

    const idMap = new Map<string, string>(); // id de origem -> id novo
    const created: string[] = [];
    const skipped: string[] = [];

    // Pass 1: cria os agentes (sem parentAgentId — definido no pass 2).
    for (const a of sourceAgents) {
      if (existingNames.has(a.name)) {
        skipped.push(a.name);
        continue;
      }
      const clone = await this.prisma.aiAgent.create({
        data: {
          organizationId: targetOrgId,
          name: a.name,
          description: a.description,
          avatarUrl: a.avatarUrl,
          kind: a.kind,
          sector: a.sector,
          category: a.category,
          capabilities: a.capabilities,
          department: a.department,
          squad: a.squad,
          modelId: a.modelId,
          modelParams:
            a.modelParams === null
              ? Prisma.JsonNull
              : (a.modelParams as Prisma.InputJsonValue),
          systemPrompt: a.systemPrompt,
          temperature: a.temperature,
          maxTokens: a.maxTokens,
          canRespondDirectly: a.canRespondDirectly,
          isActive: a.isActive,
          followUpEnabled: a.followUpEnabled,
          followUpCadenceHours: a.followUpCadenceHours,
          // operationalContext NÃO é copiado — é contexto do dia, por empresa.
        },
      });
      idMap.set(a.id, clone.id);
      created.push(a.name);
    }

    // Pass 2: remapeia a hierarquia (orquestrador ← workers) entre os clones.
    for (const a of sourceAgents) {
      const newId = idMap.get(a.id);
      if (!newId || !a.parentAgentId) continue;
      const newParent = idMap.get(a.parentAgentId);
      if (newParent) {
        await this.prisma.aiAgent.update({
          where: { id: newId },
          data: { parentAgentId: newParent },
        });
      }
    }

    // Skills: copia a SKILL e a TOOL (definição HTTP/SQL) pro destino quando
    // não existirem (por nome) e vincula os agentes. Os SEGREDOS não são
    // copiados — a tool usa templates {{env.X}} e cada empresa configura os
    // seus (token Meta, chaves, etc.) nas suas variáveis/secrets.
    let toolsCreated = 0;
    let skillsCreated = 0;
    let skillsLinked = 0;
    const json = (v: Prisma.JsonValue | null): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
      v === null ? Prisma.JsonNull : (v as Prisma.InputJsonValue);

    const usedSkillIds = [
      ...new Set(sourceAgents.flatMap((a) => a.skills.map((s) => s.skillId))),
    ];
    if (usedSkillIds.length > 0) {
      const srcSkills = await this.prisma.aiSkill.findMany({
        where: { id: { in: usedSkillIds } },
        include: { tool: true },
      });

      const tgtTools = await this.prisma.aiTool.findMany({
        where: { organizationId: targetOrgId, deletedAt: null },
        select: { id: true, name: true },
      });
      const tgtToolIdByName = new Map(tgtTools.map((t) => [t.name, t.id]));
      const tgtSkills = await this.prisma.aiSkill.findMany({
        where: { organizationId: targetOrgId, deletedAt: null },
        select: { id: true, name: true },
      });
      const tgtSkillIdByName = new Map(tgtSkills.map((s) => [s.name, s.id]));

      // Nome -> id de TODOS os agentes do destino (recém-criados + já
      // existentes), pra vincular skills mesmo em agentes que já estavam lá
      // (re-clone na empresa-modelo, por ex.).
      const tgtAgents = await this.prisma.aiAgent.findMany({
        where: { organizationId: targetOrgId, deletedAt: null },
        select: { id: true, name: true },
      });
      const targetAgentIdByName = new Map(tgtAgents.map((a) => [a.name, a.id]));

      const skillIdMap = new Map<string, string>(); // skill origem -> skill destino

      for (const s of srcSkills) {
        // 1) Garante a TOOL no destino (se a skill referencia uma).
        let targetToolId: string | null = null;
        if (s.tool) {
          const existing = tgtToolIdByName.get(s.tool.name);
          if (existing) {
            targetToolId = existing;
          } else {
            const newTool = await this.prisma.aiTool.create({
              data: {
                organizationId: targetOrgId,
                name: s.tool.name,
                description: s.tool.description,
                source: s.tool.source,
                httpBaseUrl: s.tool.httpBaseUrl,
                httpHeaders: json(s.tool.httpHeaders),
                sqlConnectionRef: s.tool.sqlConnectionRef,
                isActive: s.tool.isActive,
              },
            });
            targetToolId = newTool.id;
            tgtToolIdByName.set(s.tool.name, newTool.id);
            toolsCreated++;
          }
        }

        // 2) Garante a SKILL no destino.
        const existingSkillId = tgtSkillIdByName.get(s.name);
        if (existingSkillId) {
          skillIdMap.set(s.id, existingSkillId);
        } else {
          const newSkill = await this.prisma.aiSkill.create({
            data: {
              organizationId: targetOrgId,
              name: s.name,
              description: s.description,
              category: s.category,
              promptInstructions: s.promptInstructions,
              source: s.source,
              parameters: json(s.parameters),
              toolId: targetToolId,
              httpMethod: s.httpMethod,
              httpPath: s.httpPath,
              httpHeadersExtra: json(s.httpHeadersExtra),
              httpBodyTemplate: s.httpBodyTemplate,
              responseMap: json(s.responseMap),
              sqlQuery: s.sqlQuery,
              sqlParamMap: json(s.sqlParamMap),
              sqlTables: json(s.sqlTables),
              sqlReadOnly: s.sqlReadOnly,
              sqlMaxRows: s.sqlMaxRows,
              timeoutMs: s.timeoutMs,
              isActive: s.isActive,
            },
          });
          skillIdMap.set(s.id, newSkill.id);
          tgtSkillIdByName.set(s.name, newSkill.id);
          skillsCreated++;
        }
      }

      // 3) Vincula os agentes clonados às skills do destino.
      const bindings: {
        agentId: string;
        skillId: string;
        requiresApproval: boolean;
      }[] = [];
      for (const a of sourceAgents) {
        const targetAgentId = targetAgentIdByName.get(a.name);
        if (!targetAgentId) continue;
        for (const b of a.skills) {
          const tgtSkillId = skillIdMap.get(b.skillId);
          if (tgtSkillId) {
            bindings.push({
              agentId: targetAgentId,
              skillId: tgtSkillId,
              requiresApproval: b.requiresApproval,
            });
          }
        }
      }
      if (bindings.length > 0) {
        const res = await this.prisma.aiAgentSkill.createMany({
          data: bindings,
          skipDuplicates: true,
        });
        skillsLinked = res.count;
      }
    }

    // Canais: liga os novos agentes aos canais ATIVOS do destino (AUTONOMOUS).
    let channelsLinked = 0;
    const newAgentIds = [...idMap.values()];
    if (newAgentIds.length > 0) {
      const channels = await this.prisma.channel.findMany({
        where: { organizationId: targetOrgId, isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (channels.length > 0) {
        const res = await this.prisma.aiAgentChannel.createMany({
          data: newAgentIds.flatMap((agentId) =>
            channels.map((c) => ({
              agentId,
              channelId: c.id,
              mode: 'AUTONOMOUS' as const,
              trigger: 'ALWAYS' as const,
            })),
          ),
          skipDuplicates: true,
        });
        channelsLinked = res.count;
      }
    }

    return {
      created,
      skipped,
      channelsLinked,
      toolsCreated,
      skillsCreated,
      skillsLinked,
    };
  }

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
        billingProfile: true,
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

      const planKey = dto.plan || 'inbox';
      const planTemplate = await this.resolvePlanTemplate(planKey);
      const organization = await tx.organization.create({
        data: {
          name: dto.organizationName,
          slug,
          plan: planKey,
          settings: {
            maxAgents: planTemplate.maxAgents,
            maxChannels: planTemplate.maxChannels,
            maxDepartments: planTemplate.maxDepartments,
          },
          // Cota de IA vem do plano (conversas/mês). Inbox = 0 → sem IA.
          monthlyConversationLimit: planTemplate.aiConversations,
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

    const settingsToSet =
      dto.settings !== undefined
        ? dto.settings
        : dto.plan !== undefined
          ? await this.resolvePlanSettings(dto.plan)
          : undefined;

    // Trocar de plano redefine a cota de conversas de IA a partir do template,
    // a menos que o admin tenha mandado um valor explícito no mesmo update.
    const quotaFromPlan =
      dto.plan !== undefined && dto.monthlyConversationLimit === undefined
        ? (await this.resolvePlanTemplate(dto.plan)).aiConversations
        : undefined;

    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        ...(dto.plan !== undefined ? { plan: dto.plan } : {}),
        ...(settingsToSet !== undefined
          ? { settings: settingsToSet as Prisma.InputJsonValue }
          : {}),
        ...(quotaFromPlan !== undefined
          ? { monthlyConversationLimit: quotaFromPlan }
          : {}),
        ...(dto.aiEnabled !== undefined ? { aiEnabled: dto.aiEnabled } : {}),
        ...(dto.marketingEnabled !== undefined
          ? { marketingEnabled: dto.marketingEnabled }
          : {}),
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
        marketingEnabled: organization.marketingEnabled,
        aiMonthlyTokenCap: organization.aiMonthlyTokenCap,
        monthlyConversationLimit: organization.monthlyConversationLimit,
      },
      after: {
        plan: updated.plan,
        aiEnabled: updated.aiEnabled,
        marketingEnabled: updated.marketingEnabled,
        aiMonthlyTokenCap: updated.aiMonthlyTokenCap,
        monthlyConversationLimit: updated.monthlyConversationLimit,
      },
    });

    // Add-on de Marketing ligou/desligou → provisiona/pausa a crew.
    const wasEnabled = organization.marketingEnabled;
    const nowEnabled = updated.marketingEnabled;
    if (!wasEnabled && nowEnabled) {
      // Provisionar pode levar alguns segundos (roda os seeds) — não bloqueia
      // a resposta do admin; loga erro se falhar.
      this.marketingProvisioning.provisionForOrg(id).catch((err) =>
        this.logger.error(
          `Auto-provisionamento de marketing falhou (org ${id}): ${err?.message ?? err}`,
        ),
      );
    } else if (wasEnabled && !nowEnabled) {
      await this.marketingProvisioning
        .pauseForOrg(id)
        .catch((err) =>
          this.logger.error(
            `Pausa de marketing falhou (org ${id}): ${err?.message ?? err}`,
          ),
        );
    }

    // Add-on de Assistente Pessoal ligou → provisiona o assistente do dono.
    if (!organization.assistantEnabled && updated.assistantEnabled) {
      this.assistantProvisioning.provisionForOrg(id).catch((err) =>
        this.logger.error(
          `Auto-provisionamento de assistente falhou (org ${id}): ${err?.message ?? err}`,
        ),
      );
    }

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
        ...(dto.billingProfile !== undefined
          ? { billingProfile: dto.billingProfile as Prisma.InputJsonValue }
          : {}),
      },
    });

    await this.audit(actorId, 'UPDATE_BILLING', 'organization', id, id, {
      billingStatus: updated.billingStatus,
      billingAmountCents: updated.billingAmountCents,
      billingCycle: updated.billingCycle,
      billingProfile: (updated.billingProfile ?? null) as Prisma.InputJsonValue,
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

  // ─── AI Agents Management (Super Admin) ─────────────────

  async listAllAgents(actorId: string, organizationId?: string) {
    const where: Prisma.AiAgentWhereInput = { deletedAt: null };
    if (organizationId) {
      where.organizationId = organizationId;
    }
    const agents = await this.prisma.aiAgent.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true } },
        channels: {
          include: { channel: { select: { id: true, name: true, type: true } } },
        },
        _count: { select: { runs: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    await this.audit(actorId, 'LIST_AGENTS', 'platform', null, null);
    return agents;
  }

  async copyAgent(actorId: string, agentId: string, targetOrgId: string) {
    const agent = await this.prisma.aiAgent.findUnique({
      where: { id: agentId },
      include: {
        sectorMemberships: { include: { sector: true } },
      },
    });
    if (!agent) throw new NotFoundException('Agent not found');
    if (agent.organizationId === targetOrgId) {
      throw new BadRequestException('Source and target organization are the same');
    }

    const targetOrg = await this.prisma.organization.findUnique({
      where: { id: targetOrgId },
    });
    if (!targetOrg) throw new NotFoundException('Target organization not found');

    const newAgent = await this.prisma.aiAgent.create({
      data: {
        organizationId: targetOrgId,
        name: agent.name,
        description: agent.description,
        avatarUrl: agent.avatarUrl,
        kind: agent.kind,
        category: agent.category,
        capabilities: agent.capabilities,
        modelId: agent.modelId,
        modelParams: (agent.modelParams ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        systemPrompt: agent.systemPrompt,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        canRespondDirectly: agent.canRespondDirectly,
        isActive: agent.isActive,
        parentAgentId: null,
        department: agent.department,
        squad: agent.squad,
        operationalContext: null,
      },
    });

    // Copia vínculos de setores (cria setor no destino se não existir)
    for (const membership of agent.sectorMemberships) {
      const sourceSector = membership.sector;
      let targetSector = await this.prisma.agentSector.findFirst({
        where: { organizationId: targetOrgId, name: sourceSector.name },
      });
      if (!targetSector) {
        targetSector = await this.prisma.agentSector.create({
          data: {
            organizationId: targetOrgId,
            name: sourceSector.name,
            description: sourceSector.description,
            icon: sourceSector.icon,
            color: sourceSector.color,
            order: sourceSector.order,
          },
        });
      }
      await this.prisma.agentSectorAgent
        .create({
          data: { sectorId: targetSector.id, agentId: newAgent.id },
        })
        .catch(() => undefined);
    }

    await this.audit(actorId, 'COPY_AGENT', 'aiAgent', newAgent.id, targetOrgId, {
      sourceAgentId: agentId,
      sourceOrgId: agent.organizationId,
      agentName: agent.name,
    });

    return newAgent;
  }

  async copyAgentsBulk(actorId: string, sourceOrgId: string, targetOrgId: string) {
    if (sourceOrgId === targetOrgId) {
      throw new BadRequestException('Source and target organization are the same');
    }

    // 1. Copia setores de operação
    const sourceSectors = await this.prisma.agentSector.findMany({
      where: { organizationId: sourceOrgId },
      include: { agents: true },
      orderBy: { order: 'asc' },
    });

    const sectorIdMap = new Map<string, string>();
    for (const sector of sourceSectors) {
      let targetSector = await this.prisma.agentSector.findFirst({
        where: { organizationId: targetOrgId, name: sector.name },
      });
      if (!targetSector) {
        targetSector = await this.prisma.agentSector.create({
          data: {
            organizationId: targetOrgId,
            name: sector.name,
            description: sector.description,
            icon: sector.icon,
            color: sector.color,
            order: sector.order,
          },
        });
      } else {
        targetSector = await this.prisma.agentSector.update({
          where: { id: targetSector.id },
          data: {
            description: sector.description,
            icon: sector.icon,
            color: sector.color,
            order: sector.order,
          },
        });
      }
      sectorIdMap.set(sector.id, targetSector.id);
    }

    // 2. Copia agentes
    const agents = await this.prisma.aiAgent.findMany({
      where: { organizationId: sourceOrgId, deletedAt: null },
    });

    const agentIdMap = new Map<string, string>();
    const created = [];
    for (const agent of agents) {
      const newAgent = await this.prisma.aiAgent.create({
        data: {
          organizationId: targetOrgId,
          name: agent.name,
          description: agent.description,
          avatarUrl: agent.avatarUrl,
          kind: agent.kind,
          category: agent.category,
          capabilities: agent.capabilities,
          modelId: agent.modelId,
          modelParams: (agent.modelParams ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          systemPrompt: agent.systemPrompt,
          temperature: agent.temperature,
          maxTokens: agent.maxTokens,
          canRespondDirectly: agent.canRespondDirectly,
          isActive: agent.isActive,
          parentAgentId: null,
          department: agent.department,
          squad: agent.squad,
          operationalContext: null,
        },
      });
      agentIdMap.set(agent.id, newAgent.id);
      created.push({ id: newAgent.id, name: newAgent.name });
    }

    // 3. Recria vínculos agente ↔ setor
    for (const sector of sourceSectors) {
      const targetSectorId = sectorIdMap.get(sector.id);
      if (!targetSectorId) continue;
      for (const link of sector.agents) {
        const newAgentId = agentIdMap.get(link.agentId);
        if (!newAgentId) continue;
        await this.prisma.agentSectorAgent
          .create({
            data: { sectorId: targetSectorId, agentId: newAgentId },
          })
          .catch(() => undefined);
      }
    }

    await this.audit(actorId, 'BULK_COPY_AGENTS', 'platform', null, targetOrgId, {
      sourceOrgId,
      count: created.length,
      sectorsCopied: sourceSectors.length,
      agentIds: created.map((a) => a.id),
    });

    return { copied: created.length, sectorsCopied: sourceSectors.length, agents: created };
  }

  async updateAgent(actorId: string, id: string, dto: Record<string, any>) {
    const agent = await this.prisma.aiAgent.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    const safe: Record<string, any> = {};
    const allowedFields = ['name', 'description', 'modelId', 'systemPrompt', 'temperature',
      'parentAgentId', 'department', 'squad', 'operationalContext', 'isActive',
      'category', 'maxTokens', 'canRespondDirectly', 'isCore'];
    for (const field of allowedFields) {
      if (dto[field] !== undefined) safe[field] = dto[field];
    }

    const updated = await this.prisma.aiAgent.update({
      where: { id },
      data: safe,
    });

    await this.audit(actorId, 'UPDATE_AGENT', 'aiAgent', id, agent.organizationId, {
      changedFields: Object.keys(safe),
    });

    return updated;
  }

  // ─── Skills Management (Super Admin) ──────────────────

  async listAllSkills(organizationId?: string) {
    const where: Prisma.AiSkillWhereInput = { deletedAt: null };
    if (organizationId) {
      where.organizationId = organizationId;
    }
    return this.prisma.aiSkill.findMany({
      where,
      include: {
        tool: { select: { id: true, name: true, source: true, sqlConnectionRef: true } },
        organization: { select: { id: true, name: true } },
        _count: { select: { agents: true, versions: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  /**
   * Copia uma skill + tool vinculada para outra organização.
   * NUNCA copia OrganizationSecret (credenciais) — a org destino precisa
   * configurar suas próprias variáveis de ambiente pelo Settings > Variáveis.
   */
  async copySkill(actorId: string, skillId: string, targetOrgId: string) {
    const skill = await this.prisma.aiSkill.findUnique({
      where: { id: skillId },
      include: { tool: true },
    });
    if (!skill) throw new NotFoundException('Skill not found');
    if (skill.organizationId === targetOrgId) {
      throw new BadRequestException('Source and target organization are the same');
    }

    const targetOrg = await this.prisma.organization.findUnique({
      where: { id: targetOrgId },
    });
    if (!targetOrg) throw new NotFoundException('Target organization not found');

    // Resolve tool no destino: usa existente se achar pelo nome, ou cria nova
    // (sem as credenciais — httpHeaders e sqlConnectionRef NÃO são copiados)
    let targetToolId: string | null = null;
    if (skill.tool) {
      const existingTool = await this.prisma.aiTool.findFirst({
        where: { organizationId: targetOrgId, name: skill.tool.name, deletedAt: null },
      });
      if (existingTool) {
        targetToolId = existingTool.id;
      } else {
        const newTool = await this.prisma.aiTool.create({
          data: {
            organizationId: targetOrgId,
            name: skill.tool.name,
            description: skill.tool.description,
            source: skill.tool.source,
            // httpBaseUrl é seguro — é a URL base pública, não credencial
            httpBaseUrl: skill.tool.httpBaseUrl,
            // httpHeaders NÃO é copiado (contém {{env.X}} que referencia secrets da org)
            httpHeaders: Prisma.JsonNull,
            // sqlConnectionRef NÃO é copiado (referencia env var com credenciais)
            sqlConnectionRef: null,
            isActive: true,
          },
        });
        targetToolId = newTool.id;
      }
    }

    // Verifica conflito de nome
    const clash = await this.prisma.aiSkill.findFirst({
      where: { organizationId: targetOrgId, name: skill.name, deletedAt: null },
    });
    const targetName = clash
      ? `${skill.name} (cópia ${Date.now()})`
      : skill.name;

    const newSkill = await this.prisma.aiSkill.create({
      data: {
        organizationId: targetOrgId,
        name: targetName,
        description: skill.description,
        category: skill.category,
        promptInstructions: skill.promptInstructions,
        source: skill.source,
        parameters: (skill.parameters ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        toolId: targetToolId,
        httpMethod: skill.httpMethod,
        httpPath: skill.httpPath,
        httpHeadersExtra: (skill.httpHeadersExtra ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        httpBodyTemplate: skill.httpBodyTemplate,
        responseMap: (skill.responseMap ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        sqlQuery: skill.sqlQuery,
        sqlParamMap: (skill.sqlParamMap ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        sqlReadOnly: skill.sqlReadOnly ?? true,
        sqlMaxRows: skill.sqlMaxRows ?? 50,
        timeoutMs: skill.timeoutMs ?? 15000,
        isActive: skill.isActive,
        currentVersion: 1,
      },
    });

    await this.audit(actorId, 'COPY_SKILL', 'aiSkill', newSkill.id, targetOrgId, {
      sourceSkillId: skillId,
      sourceOrgId: skill.organizationId,
      skillName: skill.name,
      credentialsCopied: false,
    });

    return newSkill;
  }

  async listOrgModels(actorId: string, organizationId: string) {
    const models = await this.prisma.aiModelProvider.findMany({
      where: { organizationId },
      orderBy: [{ provider: 'asc' }, { name: 'asc' }],
    });
    await this.audit(actorId, 'LIST_ORG_MODELS', 'organization', organizationId, organizationId);
    return models;
  }

  // ─── Global Departments ─────────────────────────────

  async listDepartments(actorId: string) {
    const deps = await this.prisma.globalDepartment.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    await this.audit(actorId, 'LIST_DEPARTMENTS', 'platform', null, null);
    return deps;
  }

  async createDepartment(actorId: string, name: string) {
    const trimmed = name.trim().toUpperCase();
    if (!trimmed) throw new BadRequestException('Department name is required');
    const existing = await this.prisma.globalDepartment.findUnique({ where: { name: trimmed } });
    if (existing) throw new ConflictException('Department already exists');
    const max = await this.prisma.globalDepartment.aggregate({ _max: { sortOrder: true } });
    const dept = await this.prisma.globalDepartment.create({
      data: { name: trimmed, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    });
    await this.audit(actorId, 'CREATE_DEPARTMENT', 'platform', null, null, { name: trimmed });
    return dept;
  }

  async updateDepartment(actorId: string, id: string, name: string) {
    const trimmed = name.trim().toUpperCase();
    if (!trimmed) throw new BadRequestException('Department name is required');
    const existing = await this.prisma.globalDepartment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Department not found');
    const dup = await this.prisma.globalDepartment.findUnique({ where: { name: trimmed } });
    if (dup && dup.id !== id) throw new ConflictException('Another department already has this name');
    const dept = await this.prisma.globalDepartment.update({
      where: { id },
      data: { name: trimmed },
    });
    await this.audit(actorId, 'UPDATE_DEPARTMENT', 'platform', null, null, { id, name: trimmed });
    return dept;
  }

  async removeDepartment(actorId: string, id: string) {
    const existing = await this.prisma.globalDepartment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Department not found');
    await this.prisma.globalDepartment.delete({ where: { id } });
    await this.audit(actorId, 'DELETE_DEPARTMENT', 'platform', null, null, { id, name: existing.name });
    return { success: true };
  }

  // ─── Agent Sectors (Super Admin) ────────────────────

  async listOrgSectors(actorId: string, organizationId: string) {
    const sectors = await this.prisma.agentSector.findMany({
      where: { organizationId },
      orderBy: { order: 'asc' },
      include: {
        agents: {
          include: {
            agent: {
              select: { id: true, name: true, kind: true, department: true, modelId: true, isActive: true },
            },
          },
          orderBy: { agent: { name: 'asc' } },
        },
      },
    });
    await this.audit(actorId, 'LIST_ORG_SECTORS', 'organization', organizationId, organizationId);
    return sectors;
  }

  async addAgentToSector(actorId: string, sectorId: string, agentId: string) {
    const sector = await this.prisma.agentSector.findUnique({ where: { id: sectorId } });
    if (!sector) throw new NotFoundException('Setor não encontrado');

    const agent = await this.prisma.aiAgent.findUnique({ where: { id: agentId } });
    if (!agent) throw new NotFoundException('Agente não encontrado');

    const existing = await this.prisma.agentSectorAgent.findUnique({
      where: { sectorId_agentId: { sectorId, agentId } },
    });
    if (existing) throw new ConflictException('Agente já está neste setor');

    await this.prisma.agentSectorAgent.create({ data: { sectorId, agentId } });
    await this.audit(actorId, 'ADD_AGENT_TO_SECTOR', 'agent_sector', sectorId, sector.organizationId, { agentId });
    return { success: true };
  }

  async removeAgentFromSector(actorId: string, sectorId: string, agentId: string) {
    const sector = await this.prisma.agentSector.findUnique({ where: { id: sectorId } });
    if (!sector) throw new NotFoundException('Setor não encontrado');

    const link = await this.prisma.agentSectorAgent.findUnique({
      where: { sectorId_agentId: { sectorId, agentId } },
    });
    if (!link) throw new NotFoundException('Agente não está neste setor');

    await this.prisma.agentSectorAgent.delete({
      where: { sectorId_agentId: { sectorId, agentId } },
    });
    await this.audit(actorId, 'REMOVE_AGENT_FROM_SECTOR', 'agent_sector', sectorId, sector.organizationId, { agentId });
    return { success: true };
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

  async listPlanTemplates(actorId: string) {
    await this.audit(actorId, 'LIST_PLAN_TEMPLATES', 'platform', null, null);

    const templates = await this.loadPlanTemplates();
    const planRows = await this.prisma.organization.groupBy({
      by: ['plan'],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    const counts = Object.fromEntries(planRows.map((row) => [row.plan, row._count._all]));

    return KNOWN_PLANS.map((plan) => ({
      plan,
      count: counts[plan] ?? 0,
      settings: templates[plan] ?? templates.inbox,
    }));
  }

  async updatePlanTemplate(actorId: string, plan: string, dto: UpdatePlanTemplateDto) {
    if (!KNOWN_PLANS.includes(plan as (typeof KNOWN_PLANS)[number])) {
      throw new BadRequestException('Plano invalido');
    }

    const templates = await this.loadPlanTemplates();
    const current = templates[plan] ?? BUILTIN_PLAN_TEMPLATES[plan] ?? BUILTIN_PLAN_TEMPLATES.inbox;
    // Mescla só os campos enviados (todos opcionais) sobre o template atual.
    const next: PlanTemplate = {
      label: dto.label ?? current.label,
      description: dto.description ?? current.description,
      pricePerSeatCents: dto.pricePerSeatCents ?? current.pricePerSeatCents,
      minSeats: dto.minSeats ?? current.minSeats,
      suiteFlatCents: dto.suiteFlatCents ?? current.suiteFlatCents,
      aiConversations: dto.aiConversations ?? current.aiConversations,
      includesMarketing: dto.includesMarketing ?? current.includesMarketing,
      includesAssistant: dto.includesAssistant ?? current.includesAssistant,
      setupFeeCents: dto.setupFeeCents ?? current.setupFeeCents,
      maxAgents: dto.maxAgents ?? current.maxAgents,
      maxChannels: dto.maxChannels ?? current.maxChannels,
      maxDepartments: dto.maxDepartments ?? current.maxDepartments,
    };
    templates[plan] = next;

    try {
      await this.prisma.platformSetting.upsert({
        where: { key: PLAN_TEMPLATES_KEY },
        create: { key: PLAN_TEMPLATES_KEY, value: templates as Prisma.InputJsonValue },
        update: { value: templates as Prisma.InputJsonValue },
      });
    } catch {
      throw new BadRequestException(
        'Nao foi possivel salvar os planos. Execute a migration do banco (platform_settings).',
      );
    }

    let updatedOrganizations = 0;
    if (dto.applyToExisting) {
      // Aplica só os limites operacionais às orgs do plano (não mexe em
      // billing/flags pra não auto-provisionar sem querer).
      const opLimits = {
        maxAgents: next.maxAgents,
        maxChannels: next.maxChannels,
        maxDepartments: next.maxDepartments,
      };
      const result = await this.prisma.organization.updateMany({
        where: { plan, deletedAt: null },
        data: { settings: opLimits as Prisma.InputJsonValue },
      });
      updatedOrganizations = result.count;
    }

    await this.audit(actorId, 'UPDATE_PLAN_TEMPLATE', 'platform', plan, null, {
      settings: next,
      applyToExisting: !!dto.applyToExisting,
      updatedOrganizations,
    });

    return { plan, settings: next, updatedOrganizations };
  }

  // ─── Referência comercial (add-ons, pacotes de IA, notas) ───

  async getPricingMeta() {
    const row = await this.prisma.platformSetting
      .findUnique({ where: { key: PRICING_META_KEY } })
      .catch(() => null);
    const stored =
      row?.value && typeof row.value === 'object' && !Array.isArray(row.value)
        ? (row.value as Partial<PricingMeta>)
        : {};
    return { ...BUILTIN_PRICING_META, ...stored };
  }

  async updatePricingMeta(actorId: string, dto: Partial<PricingMeta>) {
    const current = await this.getPricingMeta();
    const next: PricingMeta = {
      trialDays: dto.trialDays ?? current.trialDays,
      addons: dto.addons ?? current.addons,
      aiPackages: dto.aiPackages ?? current.aiPackages,
      notes: dto.notes ?? current.notes,
    };
    try {
      await this.prisma.platformSetting.upsert({
        where: { key: PRICING_META_KEY },
        create: { key: PRICING_META_KEY, value: next as Prisma.InputJsonValue },
        update: { value: next as Prisma.InputJsonValue },
      });
    } catch {
      throw new BadRequestException(
        'Nao foi possivel salvar a referência comercial. Execute a migration (platform_settings).',
      );
    }
    await this.audit(actorId, 'UPDATE_PRICING_META', 'platform', null, null, { ...next });
    return next;
  }

  private async loadPlanTemplates(): Promise<Record<string, PlanTemplate>> {
    try {
      const row = await this.prisma.platformSetting.findUnique({
        where: { key: PLAN_TEMPLATES_KEY },
      });
      const stored =
        row?.value && typeof row.value === 'object' && !Array.isArray(row.value)
          ? (row.value as Record<string, Partial<PlanTemplate>>)
          : {};

      // Mescla campo-a-campo sobre o builtin pra que planos antigos/parciais
      // no banco não derrubem os defaults.
      const merged: Record<string, PlanTemplate> = {};
      for (const plan of KNOWN_PLANS) {
        merged[plan] = { ...BUILTIN_PLAN_TEMPLATES[plan], ...(stored[plan] ?? {}) };
      }
      return merged;
    } catch {
      return { ...BUILTIN_PLAN_TEMPLATES };
    }
  }

  // ─── Meta Coexistence (Embedded Signup) ──────────────
  // App ID/Secret/config_id são do NOSSO app Meta (Tech Provider), válidos
  // para a plataforma inteira — guardados em PlatformSetting, não por tenant.

  async getMetaCoexistence() {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: META_COEXISTENCE_KEY },
    });
    const value =
      row?.value && typeof row.value === 'object' && !Array.isArray(row.value)
        ? (row.value as Record<string, unknown>)
        : {};
    return {
      appId: typeof value.appId === 'string' ? value.appId : '',
      configId: typeof value.configId === 'string' ? value.configId : '',
      // Nunca devolve o secret em texto — só informa se já está salvo.
      hasSecret: typeof value.appSecret === 'string' && value.appSecret.length > 0,
    };
  }

  async updateMetaCoexistence(dto: {
    appId?: string;
    appSecret?: string;
    configId?: string;
  }) {
    const existing = await this.prisma.platformSetting.findUnique({
      where: { key: META_COEXISTENCE_KEY },
    });
    const current =
      existing?.value &&
      typeof existing.value === 'object' &&
      !Array.isArray(existing.value)
        ? (existing.value as Record<string, unknown>)
        : {};

    const next: Record<string, unknown> = {
      appId: dto.appId ?? current.appId ?? '',
      configId: dto.configId ?? current.configId ?? '',
      // Só sobrescreve o secret quando um novo valor não-vazio é enviado.
      appSecret:
        dto.appSecret && dto.appSecret.length > 0
          ? dto.appSecret
          : current.appSecret ?? '',
    };

    await this.prisma.platformSetting.upsert({
      where: { key: META_COEXISTENCE_KEY },
      create: { key: META_COEXISTENCE_KEY, value: next as Prisma.InputJsonValue },
      update: { value: next as Prisma.InputJsonValue },
    });

    return {
      appId: next.appId as string,
      configId: next.configId as string,
      hasSecret: (next.appSecret as string).length > 0,
    };
  }

  /** Só os limites OPERACIONAIS vão pra Organization.settings (sem comercial). */
  private async resolvePlanSettings(plan: string) {
    const t = await this.resolvePlanTemplate(plan);
    return {
      maxAgents: t.maxAgents,
      maxChannels: t.maxChannels,
      maxDepartments: t.maxDepartments,
    };
  }

  /** Template completo (comercial + operacional) do plano. */
  private async resolvePlanTemplate(plan: string): Promise<PlanTemplate> {
    const templates = await this.loadPlanTemplates();
    return templates[plan] ?? templates.inbox;
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

function sanitizeUser<T extends { password: string }>(user: T) {
  const { password: _, ...rest } = user;
  return rest;
}
