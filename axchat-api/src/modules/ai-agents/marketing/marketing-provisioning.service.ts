import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { PrismaService } from '../../../database/prisma.service';

/**
 * Provisiona/despausa a crew de marketing por organização — o add-on é
 * vendável (Organization.marketingEnabled). Chamado pelo Super Admin quando o
 * flag liga/desliga, pra que vender o plano JÁ entregue os agentes.
 *
 * Reusa os seeds testados (`scripts/seed-marketing-*.mjs`) escopados a uma org
 * via env SEED_ORG_ID — evita duplicar ~40 skills num segundo lugar (sem drift).
 * Tudo idempotente: re-rodar não duplica.
 */
@Injectable()
export class MarketingProvisioningService {
  private readonly logger = new Logger(MarketingProvisioningService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Cria (idempotente) tools, skills, agentes, vínculos e crons da org. */
  async provisionForOrg(organizationId: string): Promise<void> {
    const apiRoot = process.cwd(); // start scripts rodam a partir de axchat-api
    this.logger.log(`Provisionando crew de marketing p/ org ${organizationId}…`);
    // skills (IG/Google) primeiro, depois Meta/agentes/crew/crons.
    await this.runSeed('scripts/seed-marketing-skills.mjs', organizationId, apiRoot);
    await this.runSeed('scripts/seed-marketing-agents.mjs', organizationId, apiRoot);
    this.logger.log(`Crew de marketing provisionada p/ org ${organizationId}.`);
  }

  /**
   * Desabilitou o add-on: PAUSA os crons da crew (não apaga nada). Reativar
   * o add-on re-roda o provisionamento, que volta os crons pra isActive=true.
   */
  async pauseForOrg(organizationId: string): Promise<void> {
    const agents = await this.prisma.aiAgent.findMany({
      where: { organizationId, sector: 'MARKETING', deletedAt: null },
      select: { id: true },
    });
    if (agents.length === 0) return;
    const agentIds = agents.map((a) => a.id);
    const res = await this.prisma.agentCron.updateMany({
      where: { organizationId, agentId: { in: agentIds }, deletedAt: null },
      data: { isActive: false, nextRunAt: null },
    });
    this.logger.log(
      `pauseForOrg(${organizationId}): ${res.count} cron(s) de marketing pausado(s).`,
    );
  }

  private runSeed(
    script: string,
    organizationId: string,
    cwd: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('node', [path.normalize(script)], {
        cwd,
        env: { ...process.env, SEED_ORG_ID: organizationId },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let buf = '';
      child.stdout.on('data', (d) => (buf += d.toString()));
      child.stderr.on('data', (d) => (buf += d.toString()));
      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        if (code === 0) {
          this.logger.log(`[${script}] ok p/ org ${organizationId}`);
          resolve();
        } else {
          reject(
            new Error(`${script} saiu com código ${code}: ${buf.slice(-600)}`),
          );
        }
      });
    });
  }
}
