import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

type LimitKey = 'maxAgents' | 'maxChannels' | 'maxDepartments';

/**
 * Enforcement dos limites operacionais do plano, guardados em
 * `Organization.settings` (ex.: { maxAgents, maxChannels, maxDepartments }).
 *
 * Regras:
 *  - valor ausente / não-numérico  → ILIMITADO (não bloqueia).
 *  - valor numérico (inclusive 0)  → bloqueia quando currentCount >= limite.
 *
 * Chamar ANTES de criar o recurso, passando a contagem atual.
 */
export async function assertWithinPlanLimit(
  prisma: PrismaService,
  organizationId: string,
  key: LimitKey,
  currentCount: number,
  label: string,
): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const raw = settings[key];
  if (raw === null || raw === undefined || raw === '') return; // ilimitado
  const max = Number(raw);
  if (!Number.isFinite(max)) return; // valor inválido → não bloqueia
  if (currentCount >= max) {
    throw new ForbiddenException(
      `Limite do plano atingido: ${label} (máx. ${max}). Faça upgrade do plano ou fale com o suporte.`,
    );
  }
}
