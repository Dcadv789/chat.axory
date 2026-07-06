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
    let url: string | null = `/${businessAccountId}/message_templates`;

    try {
      while (url) {
        const { data }: { data?: { data?: any[]; paging?: { next?: string } } } = await client.get(url);
        if (data?.data) {
          templates = templates.concat(data.data);
        }
        if (data?.paging?.next) {
          url = data.paging.next;
        } else {
          url = null;
        }
      }

      this.logger.log(
        `Fetched ${templates.length} templates from Meta for channel ${channel.id}`,
      );
    } catch (error: any) {
      const msg =
        error.response?.data?.error?.message || error.message;
      this.logger.error(`Meta API template sync failed: ${msg}`);
      throw new Error(`Falha ao sincronizar templates: ${msg}`);
    }

    // Upsert each template into local DB
    let synced = 0;
    for (const t of templates) {
      const name = t.name;
      const language = t.language || 'pt_BR';
      const status = t.status || 'PENDING';
      const category = t.category || '';
      const metaTemplateId = t.id;

      // Build simplified components
      const components = (t.components || []).map((c: any) => ({
        type: c.type,
        text: c.text,
        example: c.example,
      }));

      await this.prisma.whatsappTemplate.upsert({
        where: {
          channelId_metaTemplateId: {
            channelId: channel.id,
            metaTemplateId,
          },
        },
        create: {
          channelId: channel.id,
          metaTemplateId,
          name,
          category,
          language,
          status,
          components,
          syncedAt: new Date(),
        },
        update: {
          name,
          category,
          language,
          status,
          components,
          syncedAt: new Date(),
        },
      });
      synced++;
    }

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
