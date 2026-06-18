'use client';

import { useEffect, useState } from 'react';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type {
  FeedPeriod,
  FeedTimeRangeFilter,
  Period,
  TimeRangeFilter,
} from '../../services/ai-agents.service';

const PRESET_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
];

interface BaseProps<T extends TimeRangeFilter | FeedTimeRangeFilter> {
  value: T;
  onChange: (next: T) => void;
}

interface PeriodSelectorProps extends BaseProps<TimeRangeFilter> {
  showAll?: false;
}

interface FeedPeriodSelectorProps extends BaseProps<FeedTimeRangeFilter> {
  showAll: true;
}

type Props = PeriodSelectorProps | FeedPeriodSelectorProps;

function isCustomActive(
  value: TimeRangeFilter | FeedTimeRangeFilter,
): value is { kind: 'custom'; from: string; to: string } {
  return value.kind === 'custom';
}

export function PeriodSelector(props: Props) {
  const { value, onChange } = props;
  const showAll = 'showAll' in props && props.showAll;

  const [fromDate, setFromDate] = useState(
    isCustomActive(value) ? value.from : undefined,
  );
  const [toDate, setToDate] = useState(
    isCustomActive(value) ? value.to : undefined,
  );

  useEffect(() => {
    if (isCustomActive(value)) {
      setFromDate(value.from);
      setToDate(value.to);
      return;
    }
    setFromDate(undefined);
    setToDate(undefined);
  }, [value]);

  const presetActive = value.kind === 'preset' ? value.period : null;
  const customActive = value.kind === 'custom';

  const applyPreset = (period: Period | FeedPeriod) => {
    setFromDate(undefined);
    setToDate(undefined);
    if (showAll) {
      (onChange as (next: FeedTimeRangeFilter) => void)({
        kind: 'preset',
        period,
      });
      return;
    }
    if (period === 'all') return;
    (onChange as (next: TimeRangeFilter) => void)({
      kind: 'preset',
      period,
    });
  };

  const applyCustomRange = (from: string, to: string) => {
    if (!from || !to || from > to) return;
    setFromDate(from);
    setToDate(to);
    onChange({ kind: 'custom', from, to } as TimeRangeFilter & FeedTimeRangeFilter);
  };

  const clearCustomRange = () => {
    setFromDate(undefined);
    setToDate(undefined);
    applyPreset('7d');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border border-zinc-200 bg-white p-0.5 dark:border-white/10 dark:bg-black">
        {PRESET_OPTIONS.map((opt) => {
          const active = !customActive && presetActive === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => applyPreset(opt.value)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
        {showAll && (
          <button
            type="button"
            onClick={() => applyPreset('all')}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
              !customActive && presetActive === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10'
            }`}
          >
            Tudo
          </button>
        )}
      </div>

      <DateRangePicker
        from={fromDate}
        to={toDate}
        active={customActive}
        onChange={applyCustomRange}
        onClear={clearCustomRange}
      />
    </div>
  );
}
