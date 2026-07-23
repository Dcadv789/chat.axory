import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { CreateCampaignDto, AudienceDto } from './dto/create-campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('campaigns') private readonly queue: Queue,
  ) {}

  /** Monta o `where` de contatos a partir da audiência escolhida. */
  private audienceWhere(organizationId: string, audience: AudienceDto): Prisma.ContactWhereInput {
    const where: Prisma.ContactWhereInput = { organizationId, deletedAt: null };
    if (audience.mode === 'tag' && audience.tagId) {
      where.tags = { some: { tagId: audience.tagId } };
    } else if (audience.mode === 'campaign' && audience.campaign) {
      where.campaign = audience.campaign;
    }
    return where;
  }

  /** Quantos contatos a audiência atinge (prévia, sem criar nada). */
  async previewAudience(organizationId: string, audience: AudienceDto) {
    const count = await this.prisma.contact.count({ where: this.audienceWhere(organizationId, audience) });
    return { count };
  }

  async create(organizationId: string, dto: CreateCampaignDto, userId?: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: dto.channelId, organizationId, deletedAt: null },
      select: { id: true, type: true },
    });
    if (!channel) throw new NotFoundException('Canal não encontrado.');

    const isWaOfficial = channel.type === 'WHATSAPP_OFFICIAL';
    // Regra da Meta: WhatsApp Official/Coex só dispara em massa por TEMPLATE.
    if (isWaOfficial && dto.messageType !== 'TEMPLATE') {
      throw new BadRequestException(
        'WhatsApp Official/Coexistência só permite campanha por Template aprovado (regra da Meta). Escolha um template.',
      );
    }
    if (!isWaOfficial && dto.messageType === 'TEMPLATE') {
      throw new BadRequestException('Templates só se aplicam ao WhatsApp Official. Use texto livre neste canal.');
    }

    // Monta o content conforme o tipo.
    let content: Record<string, unknown>;
    if (dto.messageType === 'TEMPLATE') {
      if (!dto.templateName) throw new BadRequestException('Escolha um template.');
      content = {
        templateName: dto.templateName,
        language: dto.templateLanguage || 'pt_BR',
        bodyParams: dto.templateBodyParams ?? [],
      };
    } else {
      if (!dto.text?.trim()) throw new BadRequestException('Escreva o texto da mensagem.');
      content = { text: dto.text.trim() };
    }

    // Resolve a audiência → snapshot dos contatos-alvo (id + nome + phone).
    const contacts = await this.prisma.contact.findMany({
      where: this.audienceWhere(organizationId, dto.audience),
      select: { id: true, name: true, phone: true },
      take: 20000,
    });
    if (contacts.length === 0) {
      throw new BadRequestException('Nenhum contato encontrado para a audiência escolhida.');
    }

    const campaign = await this.prisma.campaign.create({
      data: {
        organizationId,
        channelId: channel.id,
        channelType: channel.type,
        name: dto.name.trim(),
        messageType: dto.messageType,
        content: content as Prisma.InputJsonValue,
        audience: dto.audience as unknown as Prisma.InputJsonValue,
        total: contacts.length,
        createdById: userId ?? null,
        recipients: {
          createMany: {
            data: contacts.map((c) => ({
              contactId: c.id,
              name: c.name,
              externalId: c.phone, // resolvido de verdade no envio
            })),
          },
        },
      },
    });

    return this.get(organizationId, campaign.id);
  }

  async list(organizationId: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { recipients: true } } },
    });
    return { campaigns };
  }

  async get(organizationId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, organizationId },
      include: {
        recipients: { orderBy: { createdAt: 'asc' }, take: 500 },
        _count: { select: { recipients: true } },
      },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada.');
    return campaign;
  }

  /** Dispara a campanha: valida, marca SENDING e enfileira o worker. */
  async send(organizationId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, organizationId },
      select: { id: true, status: true, total: true },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada.');
    if (campaign.status !== 'DRAFT') {
      throw new BadRequestException(`Campanha já está "${campaign.status}" — não dá pra disparar de novo.`);
    }
    await this.prisma.campaign.update({
      where: { id },
      data: { status: 'SENDING', startedAt: new Date() },
    });
    await this.queue.add('run', { campaignId: id }, { attempts: 1, removeOnComplete: true, removeOnFail: false });
    return { ok: true, queued: campaign.total };
  }

  async cancel(organizationId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, organizationId },
      select: { id: true, status: true },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada.');
    // Só impede o que ainda não foi enfileirado (recipients PENDING).
    await this.prisma.$transaction([
      this.prisma.campaign.update({ where: { id }, data: { status: 'CANCELED', completedAt: new Date() } }),
      this.prisma.campaignRecipient.updateMany({
        where: { campaignId: id, status: 'PENDING' },
        data: { status: 'SKIPPED', error: 'Campanha cancelada' },
      }),
    ]);
    return { ok: true };
  }

  async remove(organizationId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!campaign) throw new NotFoundException('Campanha não encontrada.');
    await this.prisma.campaign.delete({ where: { id } });
    return { ok: true };
  }
}
