import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { Pool } from 'pg';
import axios from 'axios';

export interface TableColumn {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  enumValues: string[];
}

export interface TableSchema {
  tableName: string;
  columns: TableColumn[];
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

@Injectable()
export class DatabaseIntrospectionService {
  private readonly logger = new Logger(DatabaseIntrospectionService.name);
  private readonly cache = new Map<string, { schemas: TableSchema[]; ts: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Lista TODOS os nomes de tabelas (public) do banco.
   */
  async listTableNames(
    organizationId: string,
    refKey: string,
  ): Promise<string[]> {
    const dsn = await this.resolveConnectionString(organizationId, refKey);
    if (!dsn) {
      this.logger.warn(`No DSN found for refKey="${refKey}"`);
      return [];
    }

    const safeDsn = this.encodePasswordInDsn(dsn);
    const pool = new Pool({
      connectionString: safeDsn,
      max: 1,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 5_000,
    });

    try {
      const result = await pool.query(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
         ORDER BY table_name`,
      );
      return result.rows.map((r: any) => r.table_name);
    } catch (err: any) {
      this.logger.error(`listTableNames failed: ${err.message}`);
      return [];
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  /**
   * Retorna o schema (nomes de colunas + tipos) das tabelas selecionadas.
   * Faz cache por (orgId + refKey) por CACHE_TTL.
   */
  async getTableSchemas(
    organizationId: string,
    refKey: string,
    tableNames: string[],
  ): Promise<TableSchema[]> {
    const cacheKey = `${organizationId}:${refKey}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL) {
      return cached.schemas;
    }

    const dsn = await this.resolveConnectionString(organizationId, refKey);
    if (!dsn) {
      this.logger.warn(`No DSN found for refKey="${refKey}"`);
      return tableNames.map((t) => ({ tableName: t, columns: [] }));
    }

    try {
      const schemas = await this.introspectTables(dsn, tableNames);
      this.cache.set(cacheKey, { schemas, ts: Date.now() });
      return schemas;
    } catch (err: any) {
      this.logger.error(`Introspection failed: ${err.message}`);
      return tableNames.map((t) => ({ tableName: t, columns: [] }));
    }
  }

  /** Descoberta real: query information_schema.columns */
  private async introspectTables(
    dsn: string,
    tableNames: string[],
  ): Promise<TableSchema[]> {
    if (tableNames.length === 0) return [];

    const safeDsn = this.encodePasswordInDsn(dsn);
    const pool = new Pool({
      connectionString: safeDsn,
      max: 1,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 5_000,
    });

    try {
      const placeholders = tableNames.map((_, i) => `$${i + 1}`).join(', ');
      const result = await pool.query(
        `SELECT c.table_name, c.column_name, c.data_type, c.is_nullable,
          COALESCE(
            (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
             FROM pg_type t
             JOIN pg_enum e ON e.enumtypid = t.oid
             WHERE t.typname = c.udt_name AND t.typtype = 'e'),
            '{}'
          ) AS enum_values
         FROM information_schema.columns c
         WHERE c.table_name IN (${placeholders})
         ORDER BY c.table_name, c.ordinal_position`,
        tableNames,
      );

      const grouped = new Map<string, TableColumn[]>();
      for (const row of result.rows) {
        const cols = grouped.get(row.table_name) ?? [];
        cols.push({
          columnName: row.column_name,
          dataType: row.data_type,
          isNullable: row.is_nullable === 'YES',
          enumValues: row.enum_values || [],
        });
        grouped.set(row.table_name, cols);
      }

      return tableNames.map((name) => ({
        tableName: name,
        columns: grouped.get(name) ?? [],
      }));
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  /**
   * Testa conexão SQL: tenta conectar e rodar SELECT 1.
   */
  async testSqlConnection(
    organizationId: string,
    refKey: string,
  ): Promise<ConnectionTestResult> {
    const dsn = await this.resolveConnectionString(organizationId, refKey);
    if (!dsn) {
      return { ok: false, message: `Variável "${refKey}" não encontrada (nem na org, nem no servidor)` };
    }

    const safeDsn = this.encodePasswordInDsn(dsn);
    const pool = new Pool({
      connectionString: safeDsn,
      max: 1,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 5_000,
    });

    try {
      const startedAt = Date.now();
      await pool.query('SELECT 1 AS ok');
      const latencyMs = Date.now() - startedAt;
      return { ok: true, message: 'Conexão OK', latencyMs };
    } catch (err: any) {
      return { ok: false, message: `Erro: ${err.message}` };
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  /**
   * Testa conexão HTTP: faz GET na base URL com os headers informados.
   */
  async testHttpConnection(
    baseUrl: string,
    headers: Record<string, string> = {},
  ): Promise<ConnectionTestResult> {
    if (!baseUrl) {
      return { ok: false, message: 'Base URL não informada' };
    }
    try {
      const startedAt = Date.now();
      await axios.get(baseUrl, {
        headers,
        timeout: 10_000,
        validateStatus: () => true, // aceita qualquer status
      });
      const latencyMs = Date.now() - startedAt;
      return { ok: true, message: 'Conexão OK (URL respondeu)', latencyMs };
    } catch (err: any) {
      return { ok: false, message: `Erro: ${err.message}` };
    }
  }

  /** Resolve DSN (público para uso externo). */
  async resolveConnectionString(
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

  /**
   * URL-encode automático da senha na connection string.
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
}
