import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiSkill, AiTool } from '@prisma/client';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';
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

    // Modo dinâmico: o LLM gera a SQL (via input.generatedSql) em vez de usar sqlQuery fixa
    const isDynamic = !skill.sqlQuery && this.hasTables(skill);

    if (!isDynamic && !skill.sqlQuery) {
      return {
        output: {
          ok: false,
          error: 'Skill not fully configured (sqlQuery / sqlTables missing)',
        },
      };
    }

    if (isDynamic && !input?.['generatedSql']) {
      return {
        output: {
          ok: false,
          error: 'Modo dinâmico: o LLM precisa preencher o parâmetro "generatedSql" com a query SQL.',
        },
      };
    }

    if (!tool.sqlConnectionRef) {
      return {
        output: {
          ok: false,
          error: 'Tool sem sqlConnectionRef configurado',
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

    const sqlToExecute = isDynamic
      ? String(input['generatedSql'])
      : skill.sqlQuery!;

    if (skill.sqlReadOnly && this.hasMutatingVerb(sqlToExecute)) {
      return {
        output: {
          ok: false,
          error:
            'Skill is read-only mas a query contém verbo de escrita (INSERT/UPDATE/DELETE/etc).',
        },
      };
    }

    // Pool keyed pelo DSN (não pelo nome do ref): orgs diferentes têm DSNs
    // diferentes → conexões isoladas. Antes era keyed por refName, o que fazia
    // a org B reusar a conexão/DSN da org A (vazamento cross-tenant).
    const pool = this.getOrCreatePool(dsn);
    const params = isDynamic
      ? this.buildParamsFromInput(input)
      : this.buildParams(skill.sqlParamMap, { input, ctx });

    const startedAt = Date.now();
    const client = await pool.connect();
    try {
      // Transação real: SET LOCAL só vale dentro de um bloco transacional.
      // READ ONLY no nível do Postgres rejeita QUALQUER escrita (inclusive
      // CTE com DELETE/UPDATE e MERGE) — o regex hasMutatingVerb é só uma
      // checagem extra. Em autocommit (sem BEGIN), o SET LOCAL anterior era
      // um no-op e a query rodava READ WRITE.
      await client.query('BEGIN');
      await client.query(
        `SET LOCAL statement_timeout = ${Number(skill.timeoutMs ?? 15000)}`,
      );
      if (skill.sqlReadOnly) {
        await client.query('SET TRANSACTION READ ONLY');
      }

      const result = await client.query({
        text: sqlToExecute,
        values: params,
        rowMode: 'array',
      } as any);

      await client.query(skill.sqlReadOnly ? 'ROLLBACK' : 'COMMIT');

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
      await client.query('ROLLBACK').catch(() => undefined);
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

  private getOrCreatePool(dsn: string): Pool {
    // Cache keyed pelo hash do DSN (não pelo nome do ref) — garante isolamento
    // por org: DSNs distintos => pools distintos. Sem isso, o mesmo refName
    // ("SALES_DB_URL") fazia todas as orgs compartilharem a 1ª conexão criada.
    const key = createHash('sha256').update(dsn).digest('hex');
    let pool = this.pools.get(key);
    if (pool) return pool;
    // URL-encode automaticamente a senha pra evitar erro com caracteres especiais
    const safeDsn = this.encodePasswordInDsn(dsn);
    pool = new Pool({
      connectionString: safeDsn,
      max: 2,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on('error', (err) =>
      this.logger.error(`pg pool error [${key.slice(0, 8)}]: ${err.message}`),
    );
    this.pools.set(key, pool);
    return pool;
  }

  /**
   * Extrai a senha da connection string e aplica encodeURIComponent,
   * pra evitar erro se o usuário colocar caracteres especiais (@, :, /, etc).
   * Ex: postgresql://user:abc@123@host:5432/db -> postgresql://user:abc%40123@host:5432/db
   */
  private encodePasswordInDsn(dsn: string): string {
    const match = dsn.match(
      /^(postgres(?:ql)?:\/\/)([^:]+)(:)([^@]+)(@.+)$/,
    );
    if (!match) return dsn;
    const [, scheme, user, colon, password, rest] = match;
    const encoded = encodeURIComponent(password);
    if (encoded === password) return dsn;
    return `${scheme}${user}${colon}${encoded}${rest}`;
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

  /** Verifica se a skill tem sqlTables populado (modo dinâmico). */
  private hasTables(skill: AiSkill): boolean {
    return (
      Array.isArray(skill.sqlTables) && (skill.sqlTables as string[]).length > 0
    );
  }

  /** Constrói params a partir do input do LLM no modo dinâmico. */
  private buildParamsFromInput(
    input: Record<string, unknown>,
  ): unknown[] {
    const raw = input['params'];
    if (Array.isArray(raw)) return raw;
    return [];
  }

  private hasMutatingVerb(sql: string): boolean {
    const stripped = sql
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    // Verbo de escrita no início, após ';', OU dentro de uma CTE (WITH ... AS
    // (DELETE ...)). A transação READ ONLY do Postgres é a barreira real;
    // isto só bloqueia cedo os casos óbvios, inclusive MERGE e DML em CTE.
    return /(^|;|\()\s*(insert|update|delete|drop|alter|truncate|grant|revoke|create|merge|comment\s+on|call|do)\b/i.test(
      stripped,
    );
  }
}
