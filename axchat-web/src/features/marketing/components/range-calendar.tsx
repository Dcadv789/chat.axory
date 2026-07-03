'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

export interface DateRange {
  since: Date;
  until: Date;
}

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']; // começo no domingo (BR)

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
export function fmtBR(d: Date) { return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; }
export function toISODate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

/** Matriz do mês começando no domingo. Retorna células (Date | null). */
function monthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay(); // 0=domingo
  const dim = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const SHORTCUTS = [
  { label: '7 dias', days: 7 },
  { label: '15 dias', days: 15 },
  { label: '30 dias', days: 30 },
];

export function RangeCalendar({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => addMonths(new Date(value.until.getFullYear(), value.until.getMonth(), 1), -1));
  const [anchor, setAnchor] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Solta o mouse em qualquer lugar → conclui a seleção do arraste.
  useEffect(() => {
    if (!anchor) return;
    const onUp = () => {
      if (anchor && hover) {
        const since = startOfDay(anchor <= hover ? anchor : hover);
        const until = startOfDay(anchor <= hover ? hover : anchor);
        onChange({ since, until });
      }
      setAnchor(null);
      setHover(null);
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, hover]);

  const applyShortcut = (days: number) => {
    const until = startOfDay(new Date());
    const since = startOfDay(new Date(Date.now() - (days - 1) * 86400000));
    onChange({ since, until });
    setViewMonth(addMonths(new Date(until.getFullYear(), until.getMonth(), 1), -1));
  };

  const rangeStart = anchor && hover ? (anchor <= hover ? anchor : hover) : value.since;
  const rangeEnd = anchor && hover ? (anchor <= hover ? hover : anchor) : value.until;
  const inRange = (d: Date) => d >= startOfDay(rangeStart) && d <= startOfDay(rangeEnd);
  const isEdge = (d: Date) => sameDay(d, rangeStart) || sameDay(d, rangeEnd);

  const renderMonth = (base: Date) => {
    const cells = monthGrid(base.getFullYear(), base.getMonth());
    return (
      <div className="select-none">
        <p className="mb-2 text-center text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          {MONTHS[base.getMonth()]} {base.getFullYear()}
        </p>
        <div className="grid grid-cols-7 gap-0.5">
          {WEEKDAYS.map((w, i) => (
            <div key={i} className="py-1 text-center text-[10px] font-medium uppercase text-zinc-400">{w}</div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="h-8" />;
            const sel = inRange(d);
            const edge = isEdge(d);
            return (
              <button
                key={i}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setAnchor(d); setHover(d); }}
                onMouseEnter={() => anchor && setHover(d)}
                className={`h-8 text-xs font-medium transition-colors ${
                  edge
                    ? 'rounded-md bg-primary text-primary-foreground'
                    : sel
                      ? 'bg-primary/15 text-primary dark:bg-primary/25'
                      : 'rounded-md text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10'
                }`}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-200 dark:hover:bg-white/5"
      >
        <Calendar className="h-3.5 w-3.5 text-primary" />
        {fmtBR(value.since)} – {fmtBR(value.until)}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-white/10 dark:bg-black">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-zinc-400">Atalhos:</span>
            {SHORTCUTS.map((s) => (
              <button
                key={s.days}
                type="button"
                onClick={() => applyShortcut(s.days)}
                className="rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-medium text-zinc-600 hover:bg-primary/10 hover:text-primary dark:bg-white/5 dark:text-zinc-300"
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex items-start gap-4">
            <button type="button" onClick={() => setViewMonth((m) => addMonths(m, -1))} className="mt-1 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex gap-5">
              <div className="w-52">{renderMonth(viewMonth)}</div>
              <div className="w-52">{renderMonth(addMonths(viewMonth, 1))}</div>
            </div>
            <button type="button" onClick={() => setViewMonth((m) => addMonths(m, 1))} className="mt-1 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-white/10">
            <span className="text-xs text-zinc-500">{fmtBR(value.since)} – {fmtBR(value.until)}</span>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
