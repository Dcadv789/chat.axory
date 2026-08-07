import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';

// Dois níveis, de propósito:
//
//   • `AUTOMATIONS_ENABLED` (env) — botão de pânico da PLATAFORMA. Desligado,
//     o OutboxPoller drena os eventos marcando PROCESSED com `killed_by_switch`
//     (nenhum job enfileirado, nenhuma ação executada) e o worker se
//     autoverifica, pra job antigo do BullMQ não escapar num deploy parcial.
//     Use isto ANTES de qualquer resposta a incidente.
//
//   • `organization.automationsEnabled` (banco) — decisão de PRODUTO do dono.
//     Uma empresa pode usar automação e a vizinha não. Nasce desligado:
//     automação que dispara sem ninguém ter ligado publica coisa no Instagram
//     do cliente sem aviso.
@Injectable()
export class KillSwitchService {
  private readonly logger = new Logger(KillSwitchService.name);
  private readonly enabled: boolean;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const raw = config.get<string>('AUTOMATIONS_ENABLED', 'false');
    this.enabled = raw === 'true' || raw === '1';
    this.logger.log(
      `Automations engine kill switch: ${this.enabled ? 'ENABLED' : 'DISABLED'}`,
    );
  }

  /** Chave global da plataforma. */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Global ligada E a empresa habilitada. */
  async isEnabledForOrg(organizationId: string): Promise<boolean> {
    if (!this.enabled) return false;
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { automationsEnabled: true },
    });
    return org?.automationsEnabled === true;
  }
}
