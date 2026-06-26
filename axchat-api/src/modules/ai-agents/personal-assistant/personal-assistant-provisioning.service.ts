import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  ChannelType,
  ChannelVisibility,
  ConversationStatus,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

const DEFAULT_MODEL = process.env.AI_DEFAULT_MODEL_ID || 'deepseek-chat';

function buildSystemPrompt(userName: string): string {
  return `Voce e o assistente pessoal de ${userName}. Voce serve UMA pessoa — ${userName} — e cuida da vida dela: compromissos, tarefas, lembretes, anotacoes, ideias e duvidas do dia a dia (pessoais e de trabalho).

Tom: proximo, direto e proativo, como um chefe de gabinete competente. Trate por voce. Seja conciso.

O que voce faz e como:
- TAREFAS: createPersonalTask / listPersonalTasks / updatePersonalTask (DONE conclui). Sempre que ${userName} mencionar algo "a fazer", registre.
- NOTAS / BRAINSTORM: createPersonalNote / listPersonalNotes. Capture ideias e anotacoes rapidas; ajude a organizar e relembrar.
- AGENDA: createPersonalEvent / listPersonalEvents (agenda nativa; funciona mesmo sem Google). Use a "Hora atual" do contexto pra calcular datas.
- LEMBRETES: createPersonalReminder. Para "me lembra X" num horario, passe remindAt em ISO calculado a partir da Hora atual. Para "me lembra 30 min antes do compromisso", primeiro ache o evento (listPersonalEvents) e passe eventId + minutesBefore=30. No horario, voce notifica automaticamente.

Conduta:
- Confirme datas/horas com clareza (ex: "marquei pra quinta, 30/06 as 15h"). Se a pessoa for vaga ("semana que vem"), pergunte o dia/hora.
- Seja um cerebro externo: nao deixe nada cair. Ao concluir algo, registre/atualize.
- Tudo aqui e PRIVADO de ${userName}. Nunca exponha esses dados a mais ninguem.
- Voce nao atende clientes nem mexe em marketing — voce e so o assistente pessoal.`;
}

/**
 * Provisiona (idempotente) o Assistente Pessoal de UM usuario numa org:
 * agente (sector=PESSOAL) + canal PRIVADO (so o dono enxerga) + contato/conversa
 * interna + PersonalAssistantConfig. Reaproveitado pelo botao "replicar p/ novo
 * cliente" e exigivel quando o add-on (assistantEnabled) e ligado.
 */
@Injectable()
export class PersonalAssistantProvisioningService {
  private readonly logger = new Logger(
    PersonalAssistantProvisioningService.name,
  );

  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param organizationId org alvo
   * @param userId usuario dono (default: o OWNER da org)
   */
  async provisionForOrg(
    organizationId: string,
    userId?: string,
  ): Promise<{ agentId: string; channelId: string; configId: string }> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, assistantEnabled: true },
    });
    if (!org) throw new BadRequestException('Organização não encontrada.');

    // Resolve o dono: userId informado ou o OWNER da org.
    const membership = userId
      ? await this.prisma.userOrganization.findFirst({
          where: { organizationId, userId },
          include: { user: { select: { id: true, name: true } } },
        })
      : await this.prisma.userOrganization.findFirst({
          where: { organizationId, role: 'OWNER' },
          include: { user: { select: { id: true, name: true } } },
          orderBy: { joinedAt: 'asc' },
        });
    if (!membership) {
      throw new BadRequestException(
        'Nenhum usuário dono encontrado para vincular o assistente.',
      );
    }
    const ownerUserId = membership.user.id;
    const ownerName = membership.user.name || 'voce';

    // Idempotência: se já existe config p/ esse usuário, retorna o que há.
    const existingCfg = await this.prisma.personalAssistantConfig.findUnique({
      where: { uq_assistant_org_user: { organizationId, userId: ownerUserId } },
    });
    if (existingCfg?.agentId && existingCfg?.channelId) {
      this.logger.log(
        `Assistente já provisionado p/ user ${ownerUserId} (org ${organizationId}).`,
      );
      return {
        agentId: existingCfg.agentId,
        channelId: existingCfg.channelId,
        configId: existingCfg.id,
      };
    }

    // 1) Agente pessoal (sector=PESSOAL).
    const agent = await this.upsertAgent(organizationId, ownerName);

    // 2) Canal PRIVADO interno (só o dono enxerga via ChannelAgent).
    const channel = await this.upsertPrivateChannel(
      organizationId,
      ownerName,
      agent.id,
    );

    // 3) Grant de acesso ao dono (ChannelAgent) — é o que torna privado-só-dele.
    await this.prisma.channelAgent.upsert({
      where: {
        channelId_userOrganizationId: {
          channelId: channel.id,
          userOrganizationId: membership.id,
        },
      },
      update: {},
      create: { channelId: channel.id, userOrganizationId: membership.id },
    });

    // 4) Contato + conversa internos (onde o dono fala com o assistente).
    const contact = await this.ensureContact(organizationId, channel.id, ownerName);
    await this.ensureConversation(organizationId, channel.id, contact.id, agent.id);

    // 5) Vincula o agente ao canal (AUTONOMOUS) + default orchestrator.
    await this.prisma.aiAgentChannel.upsert({
      where: { agentId_channelId: { agentId: agent.id, channelId: channel.id } },
      update: { mode: 'AUTONOMOUS', trigger: 'ALWAYS' },
      create: {
        agentId: agent.id,
        channelId: channel.id,
        mode: 'AUTONOMOUS',
        trigger: 'ALWAYS',
      },
    });
    await this.prisma.channel.update({
      where: { id: channel.id },
      data: { defaultOrchestratorId: agent.id },
    });

    // 6) Config do assistente.
    const cfg = await this.prisma.personalAssistantConfig.upsert({
      where: {
        uq_assistant_org_user: { organizationId, userId: ownerUserId },
      },
      update: { agentId: agent.id, channelId: channel.id },
      create: {
        organizationId,
        userId: ownerUserId,
        agentId: agent.id,
        channelId: channel.id,
        dailyBriefingHour: 8,
      },
    });

    this.logger.log(
      `Assistente pessoal provisionado: org=${organizationId} user=${ownerUserId} agent=${agent.id}`,
    );
    return { agentId: agent.id, channelId: channel.id, configId: cfg.id };
  }

  private async upsertAgent(organizationId: string, ownerName: string) {
    const name = `Assistente de ${ownerName}`;
    const existing = await this.prisma.aiAgent.findFirst({
      where: { organizationId, sector: 'PESSOAL', deletedAt: null },
      select: { id: true },
    });
    const data = {
      organizationId,
      name,
      description: `Assistente pessoal de ${ownerName}.`,
      kind: 'ORCHESTRATOR' as const,
      sector: 'PESSOAL' as const,
      category: 'Assistente pessoal',
      capabilities: ['tarefas', 'agenda', 'lembretes', 'notas'],
      department: 'PESSOAL',
      squad: 'Assistente Pessoal',
      modelId: DEFAULT_MODEL,
      modelParams: {},
      systemPrompt: buildSystemPrompt(ownerName),
      temperature: 0.5,
      maxTokens: 1800,
      canRespondDirectly: true,
      isActive: true,
      followUpEnabled: false,
      followUpCadenceHours: [],
    };
    if (existing) {
      return this.prisma.aiAgent.update({ where: { id: existing.id }, data });
    }
    return this.prisma.aiAgent.create({ data });
  }

  private async upsertPrivateChannel(
    organizationId: string,
    ownerName: string,
    _agentId: string,
  ) {
    const name = `Assistente Pessoal — ${ownerName}`;
    const existing = await this.prisma.channel.findFirst({
      where: {
        organizationId,
        type: ChannelType.INTERNAL,
        name,
        deletedAt: null,
      },
    });
    if (existing) return existing;
    return this.prisma.channel.create({
      data: {
        organizationId,
        type: ChannelType.INTERNAL,
        name,
        config: { personalAssistant: true },
        visibility: ChannelVisibility.PRIVATE,
        isActive: true,
        aiEnabled: true,
      },
    });
  }

  private async ensureContact(
    organizationId: string,
    channelId: string,
    ownerName: string,
  ) {
    const externalId = `assistant-owner-${channelId}`;
    const link = await this.prisma.contactChannel.findFirst({
      where: { channelId, externalId },
      include: { contact: true },
    });
    if (link?.contact) return link.contact;
    return this.prisma.contact.create({
      data: {
        organizationId,
        name: ownerName,
        metadata: { personalAssistantOwner: true },
        channels: {
          create: { channelId, externalId, profileName: ownerName },
        },
      },
    });
  }

  private async ensureConversation(
    organizationId: string,
    channelId: string,
    contactId: string,
    agentId: string,
  ) {
    const existing = await this.prisma.conversation.findFirst({
      where: { channelId, contactId, deletedAt: null },
    });
    if (existing) {
      if (existing.activeAgentId !== agentId || existing.aiEnabled !== true) {
        return this.prisma.conversation.update({
          where: { id: existing.id },
          data: { activeAgentId: agentId, aiEnabled: true },
        });
      }
      return existing;
    }
    return this.prisma.conversation.create({
      data: {
        organizationId,
        channelId,
        contactId,
        status: ConversationStatus.OPEN,
        subject: 'Assistente Pessoal',
        aiEnabled: true,
        activeAgentId: agentId,
        metadata: { personalAssistant: true },
      },
    });
  }
}
