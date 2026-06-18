'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Popover,
  PopoverButton,
  PopoverPanel,
} from '@headlessui/react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type CalendarView = 'days' | 'months' | 'years';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

const MONTHS_SHORT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const;

const YEARS_PER_PAGE = 12;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function toYmd(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseYmd(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function buildCalendarDays(viewMonth: Date): Array<Date | null> {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const offset = new Date(year, month, 1).getDay();
  const total = daysInMonth(year, month);
  const cells: Array<Date | null> = [];

  for (let i = 0; i < offset; i += 1) cells.push(null);
  for (let day = 1; day <= total; day += 1) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

function formatDisplay(value: string) {
  return parseYmd(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function isBetween(date: Date, from: Date, to: Date) {
  const time = date.getTime();
  return time >= from.getTime() && time <= to.getTime();
}

function yearPageStart(year: number) {
  return Math.floor(year / YEARS_PER_PAGE) * YEARS_PER_PAGE;
}

function buildYearRange(startYear: number) {
  return Array.from({ length: YEARS_PER_PAGE }, (_, index) => startYear + index);
}

interface DateRangePickerProps {
  from?: string;
  to?: string;
  active?: boolean;
  onChange: (from: string, to: string) => void;
  onClear?: () => void;
}

export function DateRangePicker({
  from,
  to,
  active = false,
  onChange,
  onClear,
}: DateRangePickerProps) {
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const [viewMonth, setViewMonth] = useState(() =>
    from ? parseYmd(from) : today,
  );
  const [viewMode, setViewMode] = useState<CalendarView>('days');
  const [draftFrom, setDraftFrom] = useState<string | undefined>(from);
  const [draftTo, setDraftTo] = useState<string | undefined>(to);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  useEffect(() => {
    setDraftFrom(from);
    setDraftTo(to);
    if (from) setViewMonth(parseYmd(from));
  }, [from, to]);

  const calendarDays = useMemo(
    () => buildCalendarDays(viewMonth),
    [viewMonth],
  );

  const yearPage = yearPageStart(viewMonth.getFullYear());
  const yearOptions = useMemo(() => buildYearRange(yearPage), [yearPage]);

  const rangeFrom = draftFrom ? parseYmd(draftFrom) : null;
  const rangeTo = draftTo ? parseYmd(draftTo) : null;
  const previewTo =
    draftFrom && !draftTo && hoverDate ? parseYmd(hoverDate) : null;

  const label =
    from && to
      ? `${formatDisplay(from)} — ${formatDisplay(to)}`
      : 'Selecionar período';

  const resetView = () => setViewMode('days');

  const handleDayClick = (day: Date, close: () => void) => {
    const ymd = toYmd(day);
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(ymd);
      setDraftTo(undefined);
      return;
    }

    const start = parseYmd(draftFrom);
    const end = day < start ? start : day;
    const startYmd = day < start ? ymd : draftFrom;
    const endYmd = toYmd(end);

    setDraftFrom(startYmd);
    setDraftTo(endYmd);
    onChange(startYmd, endYmd);
    resetView();
    close();
  };

  const handleMonthSelect = (monthIndex: number) => {
    setViewMonth(new Date(viewMonth.getFullYear(), monthIndex, 1));
    setViewMode('days');
  };

  const handleYearSelect = (year: number) => {
    setViewMonth(new Date(year, viewMonth.getMonth(), 1));
    setViewMode('months');
  };

  const handlePrev = () => {
    if (viewMode === 'days') {
      setViewMonth(
        new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1),
      );
      return;
    }
    if (viewMode === 'months') {
      setViewMonth(
        new Date(viewMonth.getFullYear() - 1, viewMonth.getMonth(), 1),
      );
      return;
    }
    setViewMonth(
      new Date(yearPage - YEARS_PER_PAGE, viewMonth.getMonth(), 1),
    );
  };

  const handleNext = () => {
    if (viewMode === 'days') {
      setViewMonth(
        new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1),
      );
      return;
    }
    if (viewMode === 'months') {
      setViewMonth(
        new Date(viewMonth.getFullYear() + 1, viewMonth.getMonth(), 1),
      );
      return;
    }
    setViewMonth(
      new Date(yearPage + YEARS_PER_PAGE, viewMonth.getMonth(), 1),
    );
  };

  const handleClear = (close: () => void) => {
    setDraftFrom(undefined);
    setDraftTo(undefined);
    setHoverDate(null);
    resetView();
    onClear?.();
    close();
  };

  const prevLabel =
    viewMode === 'days'
      ? 'Mês anterior'
      : viewMode === 'months'
        ? 'Ano anterior'
        : 'Década anterior';

  const nextLabel =
    viewMode === 'days'
      ? 'Próximo mês'
      : viewMode === 'months'
        ? 'Próximo ano'
        : 'Próxima década';

  return (
    <Popover className="relative">
      <PopoverButton
        className={cn(
          'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium outline-none transition-colors',
          'hover:bg-zinc-50 dark:hover:bg-white/10',
          'data-[open]:border-primary/40 data-[open]:bg-primary/5 dark:data-[open]:bg-primary/10',
          active
            ? 'border-primary/40 bg-primary/5 text-primary dark:border-primary/50 dark:bg-primary/10 dark:text-primary'
            : 'border-zinc-200 bg-white text-zinc-700 dark:border-white/10 dark:bg-black dark:text-zinc-200',
        )}
      >
        <Calendar className="h-3.5 w-3.5 shrink-0 opacity-70" />
        <span className="whitespace-nowrap">{label}</span>
      </PopoverButton>

      <PopoverPanel
        anchor="bottom start"
        transition
        className={cn(
          'z-50 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xl outline-none',
          'transition duration-150 ease-out data-[closed]:scale-95 data-[closed]:opacity-0',
          'dark:border-white/10 dark:bg-black [--anchor-gap:0.5rem]',
        )}
      >
        {({ close }) => (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handlePrev}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-white/10 dark:hover:text-zinc-100"
                aria-label={prevLabel}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="text-center">
                {viewMode === 'days' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setViewMode('months')}
                      className="block w-full rounded-md px-2 py-0.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 dark:text-zinc-50 dark:hover:bg-white/10"
                    >
                      {MONTHS[viewMonth.getMonth()]}
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('years')}
                      className="mt-0.5 block w-full rounded-md px-2 py-0.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                    >
                      {viewMonth.getFullYear()}
                    </button>
                  </>
                )}

                {viewMode === 'months' && (
                  <button
                    type="button"
                    onClick={() => setViewMode('years')}
                    className="rounded-md px-2 py-1 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 dark:text-zinc-50 dark:hover:bg-white/10"
                  >
                    {viewMonth.getFullYear()}
                  </button>
                )}

                {viewMode === 'years' && (
                  <p className="px-2 py-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {yearPage} – {yearPage + YEARS_PER_PAGE - 1}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handleNext}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-white/10 dark:hover:text-zinc-100"
                aria-label={nextLabel}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {viewMode === 'days' && (
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    className="py-1 text-center text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500"
                  >
                    {day}
                  </div>
                ))}

                {calendarDays.map((day, index) => {
                  if (!day) {
                    return <div key={`empty-${index}`} className="h-9" />;
                  }

                  const ymd = toYmd(day);
                  const isToday = isSameDay(day, today);
                  const isStart = draftFrom === ymd;
                  const isEnd = draftTo === ymd;
                  const inRange =
                    rangeFrom &&
                    rangeTo &&
                    isBetween(day, rangeFrom, rangeTo) &&
                    !isStart &&
                    !isEnd;
                  const inPreview =
                    rangeFrom &&
                    previewTo &&
                    !draftTo &&
                    isBetween(
                      day,
                      rangeFrom < previewTo ? rangeFrom : previewTo,
                      rangeFrom < previewTo ? previewTo : rangeFrom,
                    ) &&
                    ymd !== draftFrom &&
                    ymd !== hoverDate;

                  return (
                    <button
                      key={ymd}
                      type="button"
                      onClick={() => handleDayClick(day, close)}
                      onMouseEnter={() => setHoverDate(ymd)}
                      onMouseLeave={() => setHoverDate(null)}
                      className={cn(
                        'relative h-9 text-sm font-medium transition-colors',
                        'text-zinc-700 dark:text-zinc-200',
                        isToday && !(isStart || isEnd) && 'ring-1 ring-primary/25 ring-inset',
                        (inRange || inPreview) && 'rounded-none bg-primary/12 text-primary dark:bg-primary/20',
                        (isStart || isEnd) &&
                          'z-[1] rounded-md bg-primary text-primary-foreground shadow-sm hover:bg-primary dark:hover:bg-primary',
                        !(isStart || isEnd || inRange || inPreview) &&
                          'rounded-md hover:bg-zinc-100 dark:hover:bg-white/10',
                        isStart && isEnd && 'rounded-md',
                        isStart && !isEnd && 'rounded-l-md rounded-r-none',
                        isEnd && !isStart && 'rounded-r-md rounded-l-none',
                      )}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            )}

            {viewMode === 'months' && (
              <div className="grid grid-cols-3 gap-2">
                {MONTHS_SHORT.map((month, index) => {
                  const isCurrentMonth =
                    viewMonth.getFullYear() === today.getFullYear() &&
                    index === today.getMonth();
                  const isSelectedMonth = index === viewMonth.getMonth();

                  return (
                    <button
                      key={month}
                      type="button"
                      onClick={() => handleMonthSelect(index)}
                      className={cn(
                        'h-10 rounded-md text-sm font-medium transition-colors',
                        isSelectedMonth
                          ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary'
                          : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/10',
                        isCurrentMonth &&
                          !isSelectedMonth &&
                          'ring-1 ring-primary/25 ring-inset',
                      )}
                    >
                      {month}
                    </button>
                  );
                })}
              </div>
            )}

            {viewMode === 'years' && (
              <div className="grid grid-cols-3 gap-2">
                {yearOptions.map((year) => {
                  const isCurrentYear = year === today.getFullYear();
                  const isSelectedYear = year === viewMonth.getFullYear();

                  return (
                    <button
                      key={year}
                      type="button"
                      onClick={() => handleYearSelect(year)}
                      className={cn(
                        'h-10 rounded-md text-sm font-medium transition-colors',
                        isSelectedYear
                          ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary'
                          : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/10',
                        isCurrentYear &&
                          !isSelectedYear &&
                          'ring-1 ring-primary/25 ring-inset',
                      )}
                    >
                      {year}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-zinc-100 pt-3 dark:border-white/10">
              <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                {viewMode === 'days' &&
                  (draftFrom && !draftTo
                    ? 'Escolha a data final'
                    : 'Clique em duas datas para definir o intervalo')}
                {viewMode === 'months' && 'Escolha um mês'}
                {viewMode === 'years' && 'Escolha um ano'}
              </p>
              {(from || to || draftFrom) && (
                <button
                  type="button"
                  onClick={() => handleClear(close)}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>
        )}
      </PopoverPanel>
    </Popover>
  );
}
