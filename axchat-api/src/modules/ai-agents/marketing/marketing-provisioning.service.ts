import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
    const magnus = await this.getMagnus(organizationId);
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
   * Re-aplica correções nas definições de skills da crew DIRETO no banco
   * (in-process, sem spawnar o seed — spawn a partir de request HTTP é frágil
   * em prod: cwd, presença dos scripts no container, etc). Idempotente.
   *
   * Só patcheia skills cuja definição mudou e precisa chegar a orgs já
   * provisionadas. Hoje: analyzeInstagramMedia (métrica "impressions" removida
   * pela Meta → 400).
   */
  async resyncSkills(organizationId: string): Promise<{ updated: number }> {
    const patches: Array<{ name: string; data: Record<string, unknown> }> = [
      {
        name: 'analyzeInstagramMedia',
        data: {
          description:
            'Lê uma mídia específica do Instagram com métricas de engajamento (alcance, salvos, comentários, curtidas, etc).',
          promptInstructions:
            'Use quando o usuário pedir análise de performance de um post específico do Instagram. Requer o mediaId. Métricas via campo `metrics` (CSV): padrão "reach,likes,comments,saved,shares,total_interactions". IMPORTANTE: NÃO use "impressions" — a Meta removeu essa métrica das insights de mídia e qualquer chamada que a inclua retorna erro 400. Para vídeos/Reels use "views". Em caso de erro 400, reduza para "reach,likes,comments,saved".',
          parameters: {
            type: 'object',
            properties: {
              mediaId: {
                type: 'string',
                description: 'ID da mídia no Instagram (obtido via /me/media).',
              },
              metrics: {
                type: 'string',
                description:
                  'Lista CSV de métricas de insights de mídia. Válidas atuais: reach, likes, comments, saved, shares, total_interactions (e views para vídeos/Reels). NÃO inclua "impressions" — foi removida pela Meta e causa erro 400.',
                default: 'reach,likes,comments,saved,shares,total_interactions',
              },
            },
            required: ['mediaId', 'metrics'],
            additionalProperties: false,
          },
        },
      },
    ];

    let updated = 0;
    for (const p of patches) {
      const res = await this.prisma.aiSkill.updateMany({
        where: { organizationId, name: p.name, deletedAt: null },
        data: p.data,
      });
      updated += res.count;
    }

    // Patch dos prompts (in-place): instrui os workers a usar as ferramentas de
    // captura em lote (captureInstagramMetrics / captureMetaAdsMetrics) em vez de
    // medir item a item. String-append idempotente (só adiciona se faltar).
    await this.patchAgentPrompts(organizationId);

    this.logger.log(
      `resyncSkills(${organizationId}): ${updated} skill(s) atualizada(s) in-process.`,
    );
    return { updated };
  }

  /**
   * Reset dos dados de TESTE da crew: análises, atividades e as conversas das
   * crons de marketing (histórico poluído de teste falho vira few-shot ruim —
   * o modelo lê os fechamentos sem execução e repete o padrão). NÃO apaga
   * métricas de posts/anúncios (série temporal) nem a conversa do console da
   * crew. As conversas de cron são arquivadas (soft-delete) e recriadas
   * limpas no próximo disparo.
   */
  async resetTestData(organizationId: string): Promise<{
    analyses: number;
    activities: number;
    conversations: number;
  }> {
    const [analyses, activities] = await this.prisma.$transaction([
      this.prisma.marketingAnalysis.deleteMany({ where: { organizationId } }),
      this.prisma.marketingActivity.deleteMany({ where: { organizationId } }),
    ]);

    const crons = await this.prisma.agentCron.findMany({
      where: {
        organizationId,
        deletedAt: null,
        agent: { sector: 'MARKETING' },
      },
      select: { id: true, conversationId: true },
    });
    const withConv = crons.filter((c) => c.conversationId);
    const convIds = withConv.map((c) => c.conversationId as string);
    if (convIds.length > 0) {
      await this.prisma.$transaction([
        this.prisma.conversation.updateMany({
          where: { id: { in: convIds }, organizationId },
          data: { deletedAt: new Date() },
        }),
        this.prisma.agentCron.updateMany({
          where: { id: { in: withConv.map((c) => c.id) } },
          data: { conversationId: null },
        }),
      ]);
    }

    this.logger.log(
      `resetTestData(${organizationId}): ${analyses.count} análise(s), ${activities.count} atividade(s), ${convIds.length} conversa(s) de cron arquivada(s).`,
    );
    return {
      analyses: analyses.count,
      activities: activities.count,
      conversations: convIds.length,
    };
  }

  private async patchAgentPrompts(organizationId: string): Promise<void> {
    const IG_NOTE =
      'IMPORTANTE: para analisar/medir a performance dos posts do Instagram, use a ferramenta captureInstagramMetrics (mede TODOS os posts do periodo de uma vez e salva com legenda). Nao meça post a post quando o pedido for sobre varios/todos os posts.';
    const ADS_NOTE =
      'IMPORTANTE: para o PANORAMA dos anuncios (metricas de todas as campanhas), use a ferramenta captureMetaAdsMetrics (mede TODAS as campanhas do periodo de uma vez e salva). Nao meça campanha a campanha nesse caso.';
    const HANDBACK_NOTE =
      'TRABALHO DELEGADO: se voce foi acionado por DELEGACAO do orquestrador, ao TERMINAR a sua parte responda com a entrega E chame handBackToOrchestrator (reason = resumo de 1 frase do que entregou). E o hand-back que devolve a bola pro orquestrador continuar o ciclo — sem ele, o fluxo PARA em voce. So nao devolva quando um humano te acionou diretamente (sem delegacao).';
    const CYCLE_NOTE_V1 =
      'CICLO DIARIO / DECISAO DE VERBA: antes de decidir aumentar/diminuir orcamento, pausar campanha ou criar criativo novo, consulte (1) getRecentMarketingAnalyses — o que ja foi analisado/decidido nos ultimos dias, pra manter continuidade e nao contradizer decisao recente sem motivo; e (2) getBudgetPacing — teto mensal x gasto real do mes x dias restantes, com verba diaria sugerida. Decida com base nesses numeros (nao calcule pacing de cabeca) e registre a decisao do dia com recordMarketingAnalysis.';
    const CYCLE_NOTE_V2 =
      'CICLO DIARIO / DECISAO DE VERBA: antes de decidir aumentar/diminuir orcamento, pausar campanha ou criar criativo novo, consulte (1) getRecentMarketingAnalyses — o que ja foi analisado/decidido nos ultimos dias, pra manter continuidade e nao contradizer decisao recente sem motivo; e (2) getBudgetPacing — teto mensal x gasto real do mes x dias restantes, com verba diaria sugerida. Decida com base nesses numeros (nao calcule pacing de cabeca) e registre a decisao do dia com recordMarketingAnalysis. EXECUCAO: decidiu, EXECUTE — NAO pare o ciclo pra pedir permissao em texto. Delegue ao especialista e ele deve CHAMAR as ferramentas normalmente: acao sensivel vira automaticamente um CARD DE APROVACAO na propria conversa (o humano clica em Aprovar ou Rejeitar; validade de 24h). Na resposta final, liste o que ficou pendente e aponte pros cards da conversa.';
    const CYCLE_NOTE =
      'CICLO DIARIO / DECISAO DE VERBA: antes de decidir aumentar/diminuir orcamento, pausar campanha ou criar criativo novo, consulte (1) getRecentMarketingAnalyses — o que ja foi analisado/decidido nos ultimos dias, pra manter continuidade e nao contradizer decisao recente sem motivo; e (2) getBudgetPacing — teto mensal x gasto real do mes x dias restantes, com verba diaria sugerida. Decida com base nesses numeros (nao calcule pacing de cabeca) e registre a decisao do dia com recordMarketingAnalysis. EXECUCAO: decidiu, EXECUTE — NAO pare o ciclo pra pedir permissao em texto. Delegue ao especialista e ele deve CHAMAR as ferramentas normalmente: acao sensivel vira automaticamente um CARD DE APROVACAO na propria conversa (o humano clica em Aprovar ou Rejeitar; validade de 24h). LEMBRE: getRecentMarketingAnalyses mostra o que foi DECIDIDO, nao o que foi EXECUTADO — decisao registrada NAO e decisao executada. Se o plano tem acao que ainda nao virou card de aprovacao nem foi executada, DELEGUE agora, mesmo que a analise ja esteja gravada. Na resposta final, liste o que ficou pendente e aponte pros cards da conversa.';

    // Regra antiga do Magnus escrita quando o teto de encadeamento era 3 —
    // ensinava a NÃO seguir o ciclo ("nao tente encadear os 5"). Hoje o teto
    // interno é 12 e essa frase fazia ele parar no meio.
    const MAGNUS_RULE_OLD =
      '- Delegue UMA etapa por vez e consolide o retorno antes da proxima. A profundidade de delegacao e limitada — nao tente encadear os 5 numa tacada so; avance por etapas, uma delegacao de cada vez.';
    const MAGNUS_RULE_NEW =
      '- Delegue UMA etapa por vez e consolide o retorno antes da proxima — e SIGA o ciclo ATE O FIM (analise > decisao > execucao > fechamento). NAO pare no meio nem encerre so com a analise: quando um especialista entrega, delegue a PROXIMA etapa a quem EXECUTA. Cada especialista roda no maximo 1x por ciclo (re-delegacao a quem ja entregou e bloqueada pelo sistema).';

    const agents = await this.prisma.aiAgent.findMany({
      where: { organizationId, sector: 'MARKETING', deletedAt: null },
      select: { id: true, name: true, kind: true, systemPrompt: true },
    });
    for (const a of agents) {
      if (!a.systemPrompt) continue;
      let p = a.systemPrompt;
      if (a.name === 'Magnus' && p.includes(MAGNUS_RULE_OLD)) {
        p = p.replace(MAGNUS_RULE_OLD, MAGNUS_RULE_NEW);
      }
      // Alaric e Edda medem IG; Wystan/Alaric/Edda medem ads.
      const wantsIg = ['Alaric', 'Edda'].includes(a.name);
      const wantsAds = ['Wystan', 'Alaric', 'Edda'].includes(a.name);
      // Quem decide/executa verba e quem orquestra o ciclo diário.
      const wantsCycle = ['Magnus', 'Alaric', 'Wystan', 'Edda'].includes(a.name);
      if (wantsIg && !p.includes('captureInstagramMetrics')) p += `\n\n${IG_NOTE}`;
      if (wantsAds && !p.includes('captureMetaAdsMetrics')) p += `\n\n${ADS_NOTE}`;
      if (wantsCycle) {
        // Upgrade v1/v2 → v3 (v3 acrescenta "decidido ≠ executado").
        if (p.includes(CYCLE_NOTE_V1)) p = p.replace(CYCLE_NOTE_V1, CYCLE_NOTE);
        else if (p.includes(CYCLE_NOTE_V2)) p = p.replace(CYCLE_NOTE_V2, CYCLE_NOTE);
        else if (!p.includes('CARD DE APROVACAO')) p += `\n\n${CYCLE_NOTE}`;
      }
      // Todo WORKER precisa devolver a bola ao terminar tarefa delegada.
      if (a.kind === 'WORKER' && !p.includes('handBackToOrchestrator')) {
        p += `\n\n${HANDBACK_NOTE}`;
      }
      if (p !== a.systemPrompt) {
        await this.prisma.aiAgent.update({
          where: { id: a.id },
          data: { systemPrompt: p },
        });
        this.logger.log(`patchAgentPrompts: ${a.name} atualizado (org ${organizationId}).`);
      }
    }
  }

  private getMagnus(organizationId: string) {
    return this.prisma.aiAgent.findFirst({
      where: {
        organizationId,
        sector: 'MARKETING',
        kind: 'ORCHESTRATOR',
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
  }

  /**
   * Lista os canais atendidos pela crew (defaultOrchestrator = Magnus) +
   * os canais externos disponíveis pra vincular. O canal interno principal
   * vem marcado como `isPrimary` (não pode ser desvinculado).
   */
  async listCrewChannels(organizationId: string) {
    const magnus = await this.getMagnus(organizationId);
    if (!magnus) return { channels: [], available: [] };

    const attached = await this.prisma.channel.findMany({
      where: { organizationId, defaultOrchestratorId: magnus.id, deletedAt: null },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    });
    const channels = attached.map((c) => ({
      ...c,
      isPrimary: c.type === ChannelType.INTERNAL && c.name === CREW_CHANNEL_NAME,
    }));
    const inUse = new Set(channels.map((c) => c.id));

    // Só oferecemos canais EXTERNOS pra vincular (Telegram, WhatsApp, IG…).
    // O console interno já existe; não faz sentido plugar outro interno.
    const all = await this.prisma.channel.findMany({
      where: {
        organizationId,
        isActive: true,
        deletedAt: null,
        type: { not: ChannelType.INTERNAL },
      },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    });
    const available = all.filter((c) => !inUse.has(c.id));
    return { channels, available };
  }

  /**
   * Vincula um canal externo à crew: aponta o defaultOrchestrator dele pro
   * Magnus e cria o link do agente (AUTONOMOUS/ALWAYS). A partir daí, mensagens
   * que chegam nesse canal são atendidas pela crew — ex.: falar pelo Telegram.
   */
  async attachCrewChannel(
    organizationId: string,
    channelId: string,
  ): Promise<{ ok: boolean }> {
    const magnus = await this.getMagnus(organizationId);
    if (!magnus) {
      throw new BadRequestException('Crew de marketing não provisionada.');
    }
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!channel) throw new BadRequestException('Canal não encontrado.');

    await this.prisma.aiAgentChannel.upsert({
      where: { agentId_channelId: { agentId: magnus.id, channelId } },
      update: { mode: 'AUTONOMOUS', trigger: 'ALWAYS' },
      create: { agentId: magnus.id, channelId, mode: 'AUTONOMOUS', trigger: 'ALWAYS' },
    });
    await this.prisma.channel.update({
      where: { id: channelId },
      data: { defaultOrchestratorId: magnus.id },
    });
    return { ok: true };
  }

  /** Desvincula um canal da crew (não permite remover o console interno). */
  async detachCrewChannel(
    organizationId: string,
    channelId: string,
  ): Promise<{ ok: boolean }> {
    const magnus = await this.getMagnus(organizationId);
    if (!magnus) {
      throw new BadRequestException('Crew de marketing não provisionada.');
    }
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, organizationId, deletedAt: null },
      select: { id: true, type: true, name: true },
    });
    if (!channel) throw new BadRequestException('Canal não encontrado.');
    if (channel.type === ChannelType.INTERNAL && channel.name === CREW_CHANNEL_NAME) {
      throw new BadRequestException(
        'O console interno da crew não pode ser desvinculado.',
      );
    }
    await this.prisma.aiAgentChannel.deleteMany({
      where: { agentId: magnus.id, channelId },
    });
    // Só limpa o defaultOrchestrator se ainda for o Magnus (não pisa em outro).
    await this.prisma.channel.updateMany({
      where: { id: channelId, defaultOrchestratorId: magnus.id },
      data: { defaultOrchestratorId: null },
    });
    return { ok: true };
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
