import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import {
  ChannelType,
  ChannelVisibility,
  ConversationStatus,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

/** Nome do canal interno de comando da crew (idempotência é por nome+tipo). */
const CREW_CHANNEL_NAME = 'Marketing — Falar com a crew';

/**
 * Provisiona/despausa a crew de marketing por organização — o add-on é
 * vendável (Organization.marketingEnabled). Chamado pelo Super Admin quando o
 * flag liga/desliga, pra que vender o plano JÁ entregue os agentes.
 *
 * Reusa os seeds testados (`scripts/seed-marketing-*.mjs`) escopados a uma org
 * via env SEED_ORG_ID — evita duplicar ~40 skills num segundo lugar (sem drift).
 * Tudo idempotente: re-rodar não duplica.
 */
@Injectable()
export class MarketingProvisioningService {
  private readonly logger = new Logger(MarketingProvisioningService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Cria (idempotente) tools, skills, agentes, vínculos e crons da org. */
  async provisionForOrg(organizationId: string): Promise<void> {
    const apiRoot = process.cwd(); // start scripts rodam a partir de axchat-api
    this.logger.log(`Provisionando crew de marketing p/ org ${organizationId}…`);
    // skills (IG/Google) primeiro, depois Meta/agentes/crew/crons.
    await this.runSeed('scripts/seed-marketing-skills.mjs', organizationId, apiRoot);
    await this.runSeed('scripts/seed-marketing-agents.mjs', organizationId, apiRoot);
    // Canal interno de comando + atalho na lateral (não pode derrubar o seed).
    try {
      await this.ensureCrewChannel(organizationId);
    } catch (err: any) {
      this.logger.warn(
        `ensureCrewChannel falhou p/ org ${organizationId}: ${err.message}`,
      );
    }
    this.logger.log(`Crew de marketing provisionada p/ org ${organizationId}.`);
  }

  /**
   * Cria (idempotente) o "console" interno da crew: um canal INTERNAL amarrado
   * ao orquestrador Magnus + conversa aberta + uma inbox view builtin pro dono,
   * que faz o atalho aparecer sozinho na lateral (mesmo padrão do Assistente
   * Pessoal). É o "menu pra falar com o setor de marketing".
   *
   * Idempotente: reusa canal/conversa/view existentes. Exposto pelo endpoint
   * POST /marketing/crew-channel para orgs que já tinham o add-on ligado antes
   * desta feature (não passaram pelo provisionamento novo).
   */
  async ensureCrewChannel(organizationId: string): Promise<{
    channelId: string;
    conversationId: string;
    viewId: string | null;
  } | null> {
    // 1) Orquestrador de marketing (Magnus).
    const magnus = await this.prisma.aiAgent.findFirst({
      where: {
        organizationId,
        sector: 'MARKETING',
        kind: 'ORCHESTRATOR',
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!magnus) {
      this.logger.warn(
        `ensureCrewChannel: nenhum orquestrador de marketing na org ${organizationId} (rode o provisionamento antes).`,
      );
      return null;
    }

    // 2) Canal INTERNAL (idempotente por nome+tipo). Visibilidade ORG: qualquer
    //    membro com acesso enxerga; sem webhook/provider.
    let channel = await this.prisma.channel.findFirst({
      where: {
        organizationId,
        type: ChannelType.INTERNAL,
        name: CREW_CHANNEL_NAME,
        deletedAt: null,
      },
    });
    if (!channel) {
      channel = await this.prisma.channel.create({
        data: {
          organizationId,
          type: ChannelType.INTERNAL,
          name: CREW_CHANNEL_NAME,
          config: { marketingCrew: true },
          visibility: ChannelVisibility.ORG,
          isActive: true,
          aiEnabled: true,
          defaultOrchestratorId: magnus.id,
        },
      });
    } else if (channel.defaultOrchestratorId !== magnus.id) {
      channel = await this.prisma.channel.update({
        where: { id: channel.id },
        data: { defaultOrchestratorId: magnus.id },
      });
    }

    // 3) Contato sintético + conversa aberta com o Magnus como agente ativo.
    const externalId = `marketing-crew-${channel.id}`;
    const link = await this.prisma.contactChannel.findFirst({
      where: { channelId: channel.id, externalId },
      include: { contact: true },
    });
    const contact =
      link?.contact ??
      (await this.prisma.contact.create({
        data: {
          organizationId,
          name: 'Crew de Marketing',
          metadata: { marketingCrew: true },
          channels: {
            create: { channelId: channel.id, externalId, profileName: 'Crew de Marketing' },
          },
        },
      }));

    let conversation = await this.prisma.conversation.findFirst({
      where: { channelId: channel.id, contactId: contact.id, deletedAt: null },
    });
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          organizationId,
          channelId: channel.id,
          contactId: contact.id,
          status: ConversationStatus.OPEN,
          subject: 'Marketing — Falar com a crew',
          aiEnabled: true,
          activeAgentId: magnus.id,
          metadata: { marketingCrew: true },
        },
      });
    } else if (
      conversation.activeAgentId !== magnus.id ||
      conversation.aiEnabled !== true
    ) {
      conversation = await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { activeAgentId: magnus.id, aiEnabled: true },
      });
    }

    // 4) Inbox view builtin pro dono — surfacing na lateral (canal interno fica
    //    oculto por padrão; a view filtrada é o atalho "de menu").
    const viewId = await this.ensureCrewInboxView(organizationId, channel.id);

    return {
      channelId: channel.id,
      conversationId: conversation.id,
      viewId,
    };
  }

  private async ensureCrewInboxView(
    organizationId: string,
    channelId: string,
  ): Promise<string | null> {
    const owner = await this.prisma.userOrganization.findFirst({
      where: { organizationId, role: 'OWNER' },
      orderBy: { joinedAt: 'asc' },
      select: { userId: true },
    });
    if (!owner) return null;

    const data = {
      name: 'Marketing (crew)',
      icon: 'Megaphone',
      color: 'pink',
      filters: { channelIds: [channelId] },
      metadata: { builtin: true, marketingCrew: true },
    };
    const existing = await this.prisma.inboxView.findFirst({
      where: {
        organizationId,
        userId: owner.userId,
        metadata: { path: ['marketingCrew'], equals: true },
      },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.inboxView.update({ where: { id: existing.id }, data });
      return existing.id;
    }
    const created = await this.prisma.inboxView.create({
      data: { organizationId, userId: owner.userId, order: -1, ...data },
    });
    return created.id;
  }

  /**
   * Desabilitou o add-on: PAUSA os crons da crew (não apaga nada). Reativar
   * o add-on re-roda o provisionamento, que volta os crons pra isActive=true.
   */
  async pauseForOrg(organizationId: string): Promise<void> {
    const agents = await this.prisma.aiAgent.findMany({
      where: { organizationId, sector: 'MARKETING', deletedAt: null },
      select: { id: true },
    });
    if (agents.length === 0) return;
    const agentIds = agents.map((a) => a.id);
    const res = await this.prisma.agentCron.updateMany({
      where: { organizationId, agentId: { in: agentIds }, deletedAt: null },
      data: { isActive: false, nextRunAt: null },
    });
    this.logger.log(
      `pauseForOrg(${organizationId}): ${res.count} cron(s) de marketing pausado(s).`,
    );
  }

  private runSeed(
    script: string,
    organizationId: string,
    cwd: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('node', [path.normalize(script)], {
        cwd,
        env: { ...process.env, SEED_ORG_ID: organizationId },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let buf = '';
      child.stdout.on('data', (d) => (buf += d.toString()));
      child.stderr.on('data', (d) => (buf += d.toString()));
      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        if (code === 0) {
          this.logger.log(`[${script}] ok p/ org ${organizationId}`);
          resolve();
        } else {
          reject(
            new Error(`${script} saiu com código ${code}: ${buf.slice(-600)}`),
          );
        }
      });
    });
  }
}
