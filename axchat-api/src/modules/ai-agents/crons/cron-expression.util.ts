/**
 * Avaliador de expressões cron de 5 campos (sem dependência externa).
 *
 *   ┌─ minuto       (0-59)
 *   │ ┌─ hora       (0-23)
 *   │ │ ┌─ dia-mês  (1-31)
 *   │ │ │ ┌─ mês     (1-12)
 *   │ │ │ │ ┌─ dia-semana (0-7, 0 e 7 = domingo)
 *   * * * * *
 *
 * Suporta por campo: `*`, listas `a,b`, ranges `a-b`, steps `*\/n` e `a-b/n`.
 * Semântica de dom/dow segue o Vixie cron: se AMBOS estão restritos (não `*`),
 * casa quando QUALQUER um casa; se um é `*`, usa só o outro.
 *
 * `computeNextRun` avança minuto a minuto (timezone-aware via Intl) a partir
 * do próximo minuto cheio, até achar um match — limitado a ~366 dias.
 */

interface CronFields {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
}

const LIMITS = {
  minute: [0, 59],
  hour: [0, 23],
  dom: [1, 31],
  month: [1, 12],
  dow: [0, 7],
} as const;

function parseField(raw: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of raw.split(',')) {
    const piece = part.trim();
    if (!piece) throw new Error(`campo cron vazio em "${raw}"`);

    let range = piece;
    let step = 1;
    const slash = piece.indexOf('/');
    if (slash !== -1) {
      range = piece.slice(0, slash);
      step = Number(piece.slice(slash + 1));
      if (!Number.isInteger(step) || step <= 0) {
        throw new Error(`step inválido em "${piece}"`);
      }
    }

    let lo = min;
    let hi = max;
    if (range !== '*') {
      const dash = range.indexOf('-');
      if (dash !== -1) {
        lo = Number(range.slice(0, dash));
        hi = Number(range.slice(dash + 1));
      } else {
        lo = hi = Number(range);
      }
      if (!Number.isInteger(lo) || !Number.isInteger(hi)) {
        throw new Error(`valor não-inteiro em "${piece}"`);
      }
      if (lo < min || hi > max || lo > hi) {
        throw new Error(`fora do intervalo [${min},${max}] em "${piece}"`);
      }
    }

    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

export function parseCron(expression: string): CronFields {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(
      `expressão cron precisa de 5 campos (recebido ${fields.length}): "${expression}"`,
    );
  }
  const [min, hour, dom, month, dowRaw] = fields;

  const dow = parseField(dowRaw, LIMITS.dow[0], LIMITS.dow[1]);
  // Normaliza domingo: 7 → 0.
  if (dow.has(7)) {
    dow.delete(7);
    dow.add(0);
  }

  return {
    minute: parseField(min, LIMITS.minute[0], LIMITS.minute[1]),
    hour: parseField(hour, LIMITS.hour[0], LIMITS.hour[1]),
    dom: parseField(dom, LIMITS.dom[0], LIMITS.dom[1]),
    month: parseField(month, LIMITS.month[0], LIMITS.month[1]),
    dow,
    domRestricted: dom.trim() !== '*',
    dowRestricted: dowRaw.trim() !== '*',
  };
}

export function isValidCronExpression(expression: string): boolean {
  try {
    parseCron(expression);
    return true;
  } catch {
    return false;
  }
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

interface WallClock {
  minute: number;
  hour: number;
  day: number;
  month: number;
  weekday: number;
}

/** Quebra um instante (Date UTC) nos campos de "relógio de parede" do timezone. */
function partsInTimezone(date: Date, timeZone: string): WallClock {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '';

  let hour = Number(get('hour'));
  if (hour === 24) hour = 0; // alguns ambientes retornam "24" à meia-noite

  return {
    minute: Number(get('minute')),
    hour,
    day: Number(get('day')),
    month: Number(get('month')),
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
  };
}

function matches(fields: CronFields, wc: WallClock): boolean {
  if (!fields.minute.has(wc.minute)) return false;
  if (!fields.hour.has(wc.hour)) return false;
  if (!fields.month.has(wc.month)) return false;

  // Vixie cron: dom e dow restritos juntos → OR; senão usa o que estiver setado.
  if (fields.domRestricted && fields.dowRestricted) {
    return fields.dom.has(wc.day) || fields.dow.has(wc.weekday);
  }
  if (fields.domRestricted) return fields.dom.has(wc.day);
  if (fields.dowRestricted) return fields.dow.has(wc.weekday);
  return true;
}

const ONE_MINUTE = 60_000;
const MAX_ITERATIONS = 366 * 24 * 60; // ~1 ano de minutos

/**
 * Próximo instante (UTC) em que a expressão dispara, estritamente após `from`.
 * Retorna null se nada casar dentro de ~1 ano (cron impossível, ex: "0 0 30 2 *").
 */
export function computeNextRun(
  expression: string,
  from: Date = new Date(),
  timeZone = 'America/Sao_Paulo',
): Date | null {
  const fields = parseCron(expression);

  // Começa no próximo minuto cheio (zera segundos/ms).
  let candidate = new Date(
    Math.floor(from.getTime() / ONE_MINUTE) * ONE_MINUTE + ONE_MINUTE,
  );

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const wc = partsInTimezone(candidate, timeZone);
    if (matches(fields, wc)) return candidate;
    candidate = new Date(candidate.getTime() + ONE_MINUTE);
  }
  return null;
}
