import { useRef } from 'react';
import { calendarPeriod, periodDates, periodFromDates } from '@ap/contracts';
import { useMessages } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { Button, Input } from '@ap/ui';
import { SHELL_MESSAGES } from '../messages';

export type PeriodDates = ReturnType<typeof periodDates>;

const QUICK_RANGES = [
  { id: 'today', label: 'queryPresetToday' },
  { id: 'yesterday', label: 'queryPresetYesterday' },
  { id: 'last7Days', label: 'queryPresetLast7Days' },
] as const;

export function PeriodFields({ dates, onChange, disabled, invalid, reasonId }: {
  dates: PeriodDates;
  onChange(dates: PeriodDates): void;
  disabled?: boolean;
  invalid?: boolean;
  reasonId: string;
}) {
  const { defaultRangeTo } = useHostPlatform();
  const m = useMessages(SHELL_MESSAGES);
  const startInput = useRef<HTMLInputElement>(null);
  const reference = { start: dates.start, end: dates.start };
  return <div className="flex min-w-0 flex-wrap items-center gap-1">
    <Input ref={startInput} type="date" inputSize="toolbar" aria-label={m('rangeStartDate')} disabled={disabled} aria-invalid={invalid || undefined} aria-describedby={invalid ? reasonId : undefined} value={dates.start} onChange={event => onChange({ ...dates, start: event.target.value })} className="w-36 max-w-full" />
    <Input type="date" inputSize="toolbar" aria-label={m('rangeEndDate')} disabled={disabled} aria-invalid={invalid || undefined} aria-describedby={invalid ? reasonId : undefined} value={dates.end} onChange={event => onChange({ ...dates, end: event.target.value })} className="w-36 max-w-full" />
    <div className="flex flex-wrap items-center gap-1">
      {QUICK_RANGES.map(preset => {
        const range = calendarPeriod(defaultRangeTo, preset.id);
        const next = range && periodDates(range);
        const pressed = next !== null && next.start === dates.start && next.end === dates.end;
        return <Button key={preset.id} type="button" size="toolbar" variant={pressed ? 'secondary' : 'ghost'} aria-pressed={pressed} disabled={disabled || next === null} onClick={() => { if (next) onChange(next); }}>{m(preset.label)}</Button>;
      })}
      <Button type="button" size="toolbar" variant="ghost" disabled={disabled || periodFromDates(reference) === null} onClick={() => onChange(reference)}>{m('queryReferenceDate')}</Button>
      <Button type="button" size="toolbar" variant="ghost" disabled={disabled} onClick={() => startInput.current?.focus()}>{m('queryCustomRange')}</Button>
    </div>
  </div>;
}
