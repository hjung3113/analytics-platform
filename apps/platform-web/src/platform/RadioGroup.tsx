import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../ui/utils/cn';

export type SegmentedRadioOption<T extends string> = { value: T; label: ReactNode };

export function SegmentedRadio<T extends string>({ label, labelledBy, value, onChange, options, className, optionClassName }: {
  label: string;
  /** Visible label element id. When set, the group uses aria-labelledby instead of aria-label. */
  labelledBy?: string;
  value: T | null;
  onChange: (next: T) => void;
  options: readonly SegmentedRadioOption<T>[];
  className?: string;
  optionClassName?: (selected: boolean) => string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = event.key;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return;
    event.preventDefault();
    const selected = options.findIndex(option => option.value === value);
    const focused = refs.current.findIndex(node => node === document.activeElement);
    const start = focused >= 0 ? focused : Math.max(0, selected);
    const last = options.length - 1;
    const next = key === 'Home' ? 0
      : key === 'End' ? last
        : key === 'ArrowRight' || key === 'ArrowDown' ? (start + 1) % options.length
          : (start - 1 + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return <div
    role="radiogroup"
    aria-orientation="horizontal"
    {...(labelledBy ? { 'aria-labelledby': labelledBy } : { 'aria-label': label })}
    onKeyDown={onKeyDown}
    className={className}>
    {options.map((option, index) => {
      const selected = option.value === value;
      const tabStop = value === null ? index === 0 : selected;
      return <button
        key={option.value}
        ref={node => { refs.current[index] = node; }}
        type="button"
        role="radio"
        aria-checked={selected}
        tabIndex={tabStop ? 0 : -1}
        onClick={() => onChange(option.value)}
        className={cn(optionClassName?.(selected))}>
        {option.label}
      </button>;
    })}
  </div>;
}
