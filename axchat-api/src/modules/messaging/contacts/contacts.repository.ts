import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

const CONTACT_INCLUDE = {
  channels: { include: { channel: { select: { id: true, type: true, name: true } } } },
  tags: { include: { tag: true } },
  contactNotes: {
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { createdAt: 'desc' as const },
    take: 20,
  },
  _count: { select: { conversations: true } },
};

@Injectable()
export class ContactsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByOrg(
    organizationId: string,
    search: string | undefined,
    skip: number,
    take: number,
    filters?: { tagId?: string; campaign?: string },
  ) {
    const where: Prisma.ContactWhereInput = { organizationId, deletedAt: null };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (filters?.tagId) {
      where.tags = { some: { tagId: filters.tagId } };
    }
    if (filters?.campaign) {
      where.campaign = filters.campaign;
    }

    const [contacts, total] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where,
        include: CONTACT_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.contact.count({ where }),
    ]);

    return { contacts, total };
  }

  async findById(id: string) {
    return this.prisma.contact.findFirst({
      where: { id, deletedAt: null },
      include: {
        channels: { include: { channel: { select: { id: true, type: true, name: true } } } },
        tags: { include: { tag: true } },
        contactNotes: {
          include: { author: { select: { id: true, name: true, avatarUrl: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        conversations: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            channel: { select: { type: true, name: true } },
            messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true, type: true, createdAt: true } },
          },
        },
      },
    });
  }

  async create(organizationId: string, data: Prisma.ContactCreateWithoutOrganizationInput) {
    return this.prisma.contact.create({
      data: { ...data, organization: { connect: { id: organizationId } } },
      include: CONTACT_INCLUDE,
    });
  }

  async update(id: string, data: Prisma.ContactUpdateInput) {
    return this.prisma.contact.update({ where: { id }, data, include: CONTACT_INCLUDE });
  }

  async softDelete(id: string) {
    return this.prisma.contact.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /** Campanhas distintas já usadas na org (pro filtro/autocomplete). */
  async listCampaigns(organizationId: string): Promise<string[]> {
    const rows = await this.prisma.contact.findMany({
      where: { organizationId, deletedAt: null, campaign: { not: null } },
      select: { campaign: true },
      distinct: ['campaign'],
      orderBy: { campaign: 'asc' },
    });
    return rows.map((r) => r.campaign!).filter(Boolean);
  }

  /**
   * Resolve nomes de tags → ids (criando as que faltam), tudo na org. Case dá
   * match pela unique (org, name). Retorna os ids na ordem dos nomes válidos.
   */
  async resolveTagIdsByName(organizationId: string, names: string[]): Promise<string[]> {
    const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    if (clean.length === 0) return [];
    const ids: string[] = [];
    for (const name of clean) {
      const tag = await this.prisma.tag.upsert({
        where: { organizationId_name: { organizationId, name } },
        update: {},
        create: { organizationId, name },
        select: { id: true },
      });
      ids.push(tag.id);
    }
    return ids;
  }

  /** Substitui o conjunto de tags do contato pelos tagIds dados. */
  async setContactTags(contactId: string, tagIds: string[]) {
    await this.prisma.$transaction([
      this.prisma.contactTag.deleteMany({ where: { contactId } }),
      ...(tagIds.length
        ? [
            this.prisma.contactTag.createMany({
              data: tagIds.map((tagId) => ({ contactId, tagId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  }

  /** Busca um contato existente por telefone ou email (dedupe no import). */
  async findDuplicate(organizationId: string, phone?: string, email?: string) {
    const or: Prisma.ContactWhereInput[] = [];
    if (phone?.trim()) or.push({ phone: phone.trim() });
    if (email?.trim()) or.push({ email: email.trim() });
    if (or.length === 0) return null;
    return this.prisma.contact.findFirst({
      where: { organizationId, deletedAt: null, OR: or },
      select: { id: true },
    });
  }
}
