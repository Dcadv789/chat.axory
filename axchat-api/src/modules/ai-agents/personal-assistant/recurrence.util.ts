import { PersonalRecurrence } from '@prisma/client';

/** Próxima ocorrência de um lembrete recorrente, a partir de `from`. */
export function nextOccurrence(
  from: Date,
  recurrence: PersonalRecurrence,
): Date | null {
  const d = new Date(from.getTime());
  switch (recurrence) {
    case 'DAILY':
      d.setUTCDate(d.getUTCDate() + 1);
      return d;
    case 'WEEKLY':
      d.setUTCDate(d.getUTCDate() + 7);
      return d;
    case 'MONTHLY':
      d.setUTCMonth(d.getUTCMonth() + 1);
      return d;
    case 'YEARLY':
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      return d;
    default:
      return null;
  }
}
