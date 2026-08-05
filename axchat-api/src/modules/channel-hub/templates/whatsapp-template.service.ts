import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Channel } from '@prisma/client';
import axios from 'axios';

@Injectable()
export class WhatsappTemplateService {
  private readonly logger = new Logger(WhatsappTemplateService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Retorna templates salvos no banco para este canal, ordenados por status
   * (APPROVED primeiro) e depois por nome.
   */
  async listByChannel(channelId: string) {
    return this.prisma.whatsappTemplate.findMany({
      where: { channelId },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Sincroniza templates da Meta Cloud API para o banco local.
   * Busca templates do WABA associado ao canal e faz upsert.
   */
  async syncFromMeta(channel: Channel) {
    const config = channel.config as Record<string, any>;
    const businessAccountId = config.businessAccountId;
    if (!businessAccountId) {
      throw new NotFoundException(
        'businessAccountId nao configurado neste canal WhatsApp',
      );
    }

    const waConfig = this.getConfig(channel);
    const client = axios.create({
      baseURL: `https://graph.facebook.com/${waConfig.apiVersion}`,
      headers: { Authorization: `Bearer ${waConfig.accessToken}` },
      timeout: 30000,
    });

    let templates: any[] = [];
    // Pede explicitamente os campos (inclui `status`) e um limite alto, pra não
    // depender do default da Graph API (25) nem de campos omitidos.
    let url: string | null =
      `/${businessAccountId}/message_templates?limit=200&fields=name,status,category,language,components`;

    try {
      while (url) {
        const { data }: { data?: { data?: any[]; paging?: { next?: string } } } = await client.get(url);
        if (data?.data) {
          templates = templates.concat(data.data);
        }
        // `paging.next` é uma URL absoluta (o axios ignora o baseURL nela).
        url = data?.paging?.next ?? null;
      }

      const byStatus = templates.reduce((acc: Record<string, number>, t: any) => {
        const s = t?.status || 'PENDING';
        acc[s] = (acc[s] ?? 0) + 1;
        return acc;
      }, {});
      this.logger.log(
        `Fetched ${templates.length} templates from Meta (WABA ${businessAccountId}, canal ${channel.id}): ${JSON.stringify(byStatus)}`,
      );
    } catch (error: any) {
      const msg =
        error.response?.data?.error?.message || error.message;
      this.logger.error(`Meta API template sync failed (WABA ${businessAccountId}): ${msg}`);
      throw new Error(`Falha ao sincronizar templates: ${msg}`);
    }

    if (templates.length === 0) {
      this.logger.warn(
        `Meta retornou 0 templates (WABA ${businessAccountId}, canal ${channel.id}). ` +
          `Cheque se o token tem a permissao 'whatsapp_business_management' e se o businessAccountId e o WABA correto.`,
      );
    }

    // Upsert de cada template, isolado num try/catch pra que UM template com
    // shape inesperado nao aborte todo o sync (era o motivo de "retorna 0").
    let synced = 0;
    let failed = 0;
    for (const t of templates) {
      try {
        const metaTemplateId = t.id;
        if (!metaTemplateId || !t.name) {
          failed++;
          this.logger.warn(`Template ignorado (sem id/nome): ${JSON.stringify(t)?.slice(0, 200)}`);
          continue;
        }
        const components = (t.components || []).map((c: any) => ({
          type: c.type,
          text: c.text,
          example: c.example,
        }));
        const payload = {
          name: t.name,
          category: t.category || '',
          language: t.language || 'pt_BR',
          status: t.status || 'PENDING',
          components,
          syncedAt: new Date(),
        };
        await this.prisma.whatsappTemplate.upsert({
          where: { channelId_metaTemplateId: { channelId: channel.id, metaTemplateId } },
          create: { channelId: channel.id, metaTemplateId, ...payload },
          update: payload,
        });
        synced++;
      } catch (err: any) {
        failed++;
        this.logger.error(`Falha ao salvar template ${t?.name ?? t?.id}: ${err?.message ?? err}`);
      }
    }

    this.logger.log(
      `Templates sync canal ${channel.id}: ${synced} salvos, ${failed} falharam de ${templates.length}.`,
    );
    return { synced, total: templates.length };
  }

  private getConfig(channel: Channel) {
    const config = channel.config as Record<string, any>;
    return {
      accessToken: config.accessToken,
      phoneNumberId: config.phoneNumberId,
      businessAccountId: config.businessAccountId,
      apiVersion: config.apiVersion || 'v25.0',
    };
  }
}
