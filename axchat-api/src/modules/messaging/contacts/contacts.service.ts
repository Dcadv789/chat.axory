import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ContactsRepository } from './contacts.repository';
import { UpdateContactDto } from './dto/update-contact.dto';
import { CreateContactDto, ImportContactsDto } from './dto/create-contact.dto';

@Injectable()
export class ContactsService {
  constructor(private readonly repository: ContactsRepository) {}

  async findAll(
    organizationId: string,
    search: string | undefined,
    page: number,
    limit: number,
    filters?: { tagId?: string; campaign?: string },
  ) {
    const skip = (page - 1) * limit;
    const { contacts, total } = await this.repository.findByOrg(
      organizationId,
      search,
      skip,
      limit,
      filters,
    );
    return {
      contacts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, organizationId: string) {
    const contact = await this.repository.findById(id);
    if (!contact) throw new NotFoundException('Contact not found');
    if (contact.organizationId !== organizationId) throw new ForbiddenException();
    return contact;
  }

  async create(organizationId: string, dto: CreateContactDto) {
    const contact = await this.repository.create(organizationId, {
      name: dto.name?.trim() || null,
      phone: dto.phone?.trim() || null,
      email: dto.email?.trim() || null,
      notes: dto.notes?.trim() || null,
      campaign: dto.campaign?.trim() || null,
      source: dto.source?.trim() || 'manual',
    });
    if (dto.tags?.length) {
      const tagIds = await this.repository.resolveTagIdsByName(organizationId, dto.tags);
      await this.repository.setContactTags(contact.id, tagIds);
    }
    return this.repository.findById(contact.id);
  }

  async update(id: string, organizationId: string, dto: UpdateContactDto) {
    await this.findOne(id, organizationId);
    const { tagIds, ...rest } = dto;
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) data[k] = typeof v === 'string' ? v.trim() || null : v;
    }
    const updated = await this.repository.update(id, data);
    if (tagIds !== undefined) {
      await this.repository.setContactTags(id, tagIds);
      return this.repository.findById(id);
    }
    return updated;
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.repository.softDelete(id);
  }

  async listCampaigns(organizationId: string) {
    return { campaigns: await this.repository.listCampaigns(organizationId) };
  }

  /**
   * Import em lote a partir de linhas já parseadas da planilha (o front lê o
   * CSV). Dedupe por telefone/email: existente é ATUALIZADO (não duplica),
   * novo é criado. Tags por nome são criadas se faltarem. `campaign` global do
   * DTO tem prioridade sobre a da linha.
   */
  async importBulk(organizationId: string, dto: ImportContactsDto) {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < dto.contacts.length; i++) {
      const row = dto.contacts[i];
      const name = row.name?.trim() || null;
      const phone = row.phone?.trim() || null;
      const email = row.email?.trim() || null;
      const campaign = dto.campaign?.trim() || row.campaign?.trim() || null;

      // Linha sem nenhum identificador útil → pula.
      if (!phone && !email && !name) {
        skipped++;
        continue;
      }

      try {
        const dup = await this.repository.findDuplicate(organizationId, phone ?? undefined, email ?? undefined);
        let contactId: string;
        if (dup) {
          await this.repository.update(dup.id, {
            ...(name ? { name } : {}),
            ...(email ? { email } : {}),
            ...(campaign ? { campaign } : {}),
          });
          contactId = dup.id;
          updated++;
        } else {
          const c = await this.repository.create(organizationId, {
            name,
            phone,
            email,
            campaign,
            source: 'import',
          });
          contactId = c.id;
          created++;
        }
        if (row.tags?.length) {
          const tagIds = await this.repository.resolveTagIdsByName(organizationId, row.tags);
          // No import mantemos as tags existentes e só ADICIONAMOS as novas.
          const current = await this.repository.findById(contactId);
          const existingIds = (current?.tags ?? []).map((t: any) => t.tagId ?? t.tag?.id).filter(Boolean);
          await this.repository.setContactTags(contactId, [...new Set([...existingIds, ...tagIds])]);
        }
      } catch (err: any) {
        errors.push(`Linha ${i + 1}: ${err?.message ?? 'erro'}`);
      }
    }

    return { created, updated, skipped, errors, total: dto.contacts.length };
  }
}
