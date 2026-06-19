import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { UpsertSecretDto } from './dto/upsert-secret.dto';

@Injectable()
export class OrganizationSecretService {
  private readonly logger = new Logger(OrganizationSecretService.name);

  constructor(private readonly prisma: PrismaService) {}

  private readonly _unique = (
    orgId: string,
    key: string,
  ): Prisma.OrganizationSecretWhereUniqueInput => ({
    uq_org_secret_key: { organizationId: orgId, key },
  });

  /** Lista todas as secrets da organização (o valor vem mascarado parcialmente). */
  async list(organizationId: string) {
    const secrets = await this.prisma.organizationSecret.findMany({
      where: { organizationId },
      orderBy: { key: 'asc' },
    });
    return secrets.map((s) => ({
      ...s,
      // Máscara parcial no valor pra não expor na UI
      value: this.mask(s.value),
    }));
  }

  /** Lista bruta (sem máscara) — usado internamente pelos executors. */
  async listRaw(organizationId: string) {
    return this.prisma.organizationSecret.findMany({
      where: { organizationId },
    });
  }

  /** Busca uma secret específica (valor real). */
  async findValue(organizationId: string, key: string): Promise<string | null> {
    const secret = await this.prisma.organizationSecret.findUnique({
      where: this._unique(organizationId, key),
    });
    return secret?.value ?? null;
  }

  /** Cria ou atualiza uma secret. */
  async upsert(organizationId: string, dto: UpsertSecretDto) {
    const secret = await this.prisma.organizationSecret.upsert({
      where: this._unique(organizationId, dto.key),
      update: { value: dto.value },
      create: { organizationId, key: dto.key, value: dto.value },
    });
    this.logger.log(`Secret "${dto.key}" upserted for org ${organizationId}`);
    return { ...secret, value: this.mask(secret.value) };
  }

  /** Remove uma secret. */
  async remove(organizationId: string, key: string) {
    const secret = await this.prisma.organizationSecret.findUnique({
      where: this._unique(organizationId, key),
    });
    if (!secret) throw new NotFoundException(`Secret "${key}" not found`);
    await this.prisma.organizationSecret.delete({
      where: this._unique(organizationId, key),
    });
    this.logger.log(`Secret "${key}" removed from org ${organizationId}`);
  }

  private mask(value: string): string {
    if (value.length <= 4) return '****';
    return value.slice(0, 4) + '****' + value.slice(-2);
  }
}
