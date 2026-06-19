import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiSkill, AiTool } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaService } from '../../../database/prisma.service';
import { ToolContext, ToolResult } from './tool.types';

/**
 * Executes SQL-backed Skills. Connection (DSN env-var ref) comes from
 * AiTool, query + params + read-only + maxRows come from AiSkill.
 */
@Injectable()
export class SqlToolExecutorService implements OnModuleDestroy {
  private readonly logger = new Logger(SqlToolExecutorService.name);
  private readonly pools = new Map<string, Pool>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleDestroy() {
    for (const pool of this.pools.values()) {
      await pool.end().catch(() => undefined);
    }
  }

  async execute(
    skill: AiSkill,
    tool: AiTool,
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    if (skill.source !== 'SQL') {
      throw new Error(`Skill ${skill.name} is not a SQL skill`);
    }
    if (tool.source !== 'CUSTOM_SQL') {
      throw new Error(
        `Skill ${skill.name} is SQL but bound tool ${tool.name} isn't`,
      );
    }
    if (!skill.sqlQuery || !tool.sqlConnectionRef) {
      return {
        output: {
          ok: false,
          error: 'Skill not fully configured (sqlQuery / sqlConnectionRef missing)',
        },
      };
    }

    if (skill.sqlReadOnly && this.hasMutatingVerb(skill.sqlQuery)) {
      return {
        output: {
          ok: false,
          error:
            'Skill is read-only mas a query contém verbo de escrita (INSERT/UPDATE/DELETE/etc).',
        },
      };
    }

    // 1. Tenta resolver a conexão da OrganizationSecret (DB multi-tenant)
    // 2. Fallback pra env var do servidor
    const dsn = await this.resolveConnectionString(
      ctx.organizationId,
      tool.sqlConnectionRef,
    );
    if (!dsn) {
      return {
        output: {
          ok: false,
          error: `Env var "${tool.sqlConnectionRef}" não configurada (nem na org, nem no servidor)`,
        },
      };
    }

    const pool = this.getOrCreatePool(tool.sqlConnectionRef, dsn);
    const params = this.buildParams(skill.sqlParamMap, { input, ctx });

    const startedAt = Date.now();
    const client = await pool.connect();
    try {
      if (skill.sqlReadOnly) {
        await client.query('SET LOCAL TRANSACTION READ ONLY');
      }
      await client.query(`SET LOCAL statement_timeout = ${skill.timeoutMs ?? 15000}`);

      const result = await client.query({
        text: skill.sqlQuery,
        values: params,
        rowMode: 'array',
      } as any);

      const cols = (result.fields ?? []).map((f: any) => f.name);
      const rows = ((result.rows ?? []) as unknown[][])
        .slice(0, skill.sqlMaxRows ?? 50)
        .map((row) => {
          const obj: Record<string, unknown> = {};
          row.forEach((v, i) => {
            obj[cols[i] ?? `col_${i}`] = this.sanitizeValue(v);
          });
          return obj;
        });

      const durationMs = Date.now() - startedAt;
      this.logger.log(`[skill:${skill.name}] ${rows.length} rows in ${durationMs}ms`);

      return {
        output: {
          ok: true,
          rowCount: rows.length,
          truncated: (result.rows?.length ?? 0) > (skill.sqlMaxRows ?? 50),
          rows,
        },
      };
    } catch (err: any) {
      this.logger.error(`[skill:${skill.name}] failed: ${err?.message ?? err}`);
      return { output: { ok: false, error: err?.message ?? String(err) } };
    } finally {
      client.release();
    }
  }

  /** Resolve DSN: DB da org (OrganizationSecret) > env var do servidor. */
  private async resolveConnectionString(
    organizationId: string,
    refKey: string,
  ): Promise<string | null> {
    const secret = await this.prisma.organizationSecret.findUnique({
      where: { uq_org_secret_key: { organizationId, key: refKey } },
      select: { value: true },
    });
    if (secret?.value) return secret.value;
    return this.config.get<string>(refKey) ?? null;
  }

  private getOrCreatePool(refName: string, dsn: string): Pool {
    let pool = this.pools.get(refName);
    if (pool) return pool;
    pool = new Pool({
      connectionString: dsn,
      max: 2,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on('error', (err) =>
      this.logger.error(`pg pool error [${refName}]: ${err.message}`),
    );
    this.pools.set(refName, pool);
    return pool;
  }

  private buildParams(
    raw: unknown,
    scopes: { input: Record<string, unknown>; ctx: ToolContext },
  ): unknown[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((entry) => {
      const source = (entry as any)?.source as string;
      if (!source || typeof source !== 'string') return null;
      if (source.startsWith('literal:')) return source.slice('literal:'.length);
      const [scope, ...rest] = source.split('.');
      const path = rest.join('.');
      if (scope === 'input') return this.lookup(scopes.input, path) ?? null;
      if (scope === 'ctx') return this.lookup(scopes.ctx as any, path) ?? null;
      return null;
    });
  }

  private lookup(obj: unknown, path: string): unknown {
    return path
      .split('.')
      .reduce<unknown>(
        (acc, key) =>
          acc && typeof acc === 'object'
            ? (acc as Record<string, unknown>)[key]
            : undefined,
        obj,
      );
  }

  private sanitizeValue(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') {
      if (value instanceof Date) return value.toISOString();
      if (Buffer.isBuffer(value)) return value.toString('base64');
      try {
        JSON.stringify(value);
        return value;
      } catch {
        return String(value);
      }
    }
    if (typeof value === 'bigint') return value.toString();
    return value;
  }

  private hasMutatingVerb(sql: string): boolean {
    const stripped = sql
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    return /(^|;)\s*(insert|update|delete|drop|alter|truncate|grant|revoke|create|comment\s+on|call|do)\b/i.test(
      stripped,
    );
  }
}
