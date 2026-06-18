import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ContactNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async findByContact(contactId: string) {
    return this.prisma.contactNote.findMany({
      where: { contactId },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(contactId: string, authorId: string, content: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true },
    });
    if (!contact) throw new NotFoundException('Contact not found');

    return this.prisma.contactNote.create({
      data: { contactId, authorId, content },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  async remove(id: string) {
    const note = await this.prisma.contactNote.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!note) throw new NotFoundException('Contact note not found');
    return this.prisma.contactNote.delete({ where: { id } });
  }
}
