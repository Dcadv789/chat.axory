import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

interface CatalogEntry {
  slug: string;
  name: string;
  category: string | null;
  shortLine: string;
}

interface CacheEntry {
  data: CatalogEntry[];
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Returns the compact product catalog for an organization, cached in memory.
 * The compact list is injected into every agent's system prompt as a
 * cacheable block — TTL of 5min keeps token cost predictable while
 * letting offer edits reach the agent within minutes.
 *
 * Source of truth: the `Product` table, managed via Settings > Produtos.
 * No longer depends on Trivapp external API.
 */
@Injectable()
export class CatalogSyncService {
  private readonly logger = new Logger(CatalogSyncService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async getCompactCatalog(organizationId: string): Promise<CatalogEntry[]> {
    const cached = this.cache.get(organizationId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    try {
      const products = await this.prisma.product.findMany({
        where: { organizationId, isActive: true },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: {
          slug: true,
          name: true,
          category: true,
          shortLine: true,
        },
      });

      this.cache.set(organizationId, {
        data: products,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return products;
    } catch (err: any) {
      this.logger.warn(
        `Catalog query failed for org ${organizationId}: ${err?.message ?? err}`,
      );
      const stale = this.cache.get(organizationId);
      if (stale) return stale.data;
      return [];
    }
  }

  /** Force-invalidate the cache (e.g. after editing a Product). */
  invalidate(organizationId: string) {
    this.cache.delete(organizationId);
  }
}
