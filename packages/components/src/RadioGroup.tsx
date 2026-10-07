import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { RadioGroup, RadioGroupItem } from '@ap/ui';

export type SegmentedRadioOption<T extends string> = { value: T; label: ReactNode };

export function SegmentedRadio<T extends string>({ label, labelledBy, value, onChange, options, className }: {
  label: string;
  /** Visible label element id. When set, the group uses aria-labelledby instead of aria-label. */
  labelledBy?: string;
  value: T | null;
  onChange: (next: T) => void;
  options: readonly SegmentedRadioOption<T>[];
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // Radix roving focus defers item focus to a timer and parks the initial tab stop on the group
  // wrapper; the keyboard contract (a11y.test.tsx) needs the selected item focused synchronously,
  // so ←→↑↓/Home/End are handled here. Radix still paints the segmented look and click/focus
  // checking (onValueChange covers selection via focus).
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
  return <RadioGroup
    appearance="segmented"
    value={value ?? ''}
    // Radix also checks the item it focuses after an arrow key; the handler above already chose it.
    onValueChange={next => { if (next !== value) onChange(next as T); }}
    {...(labelledBy ? { 'aria-labelledby': labelledBy } : { 'aria-label': label })}
    onKeyDown={onKeyDown}
    className={className}>
    {options.map((option, index) => <RadioGroupItem
      key={option.value}
      ref={node => { refs.current[index] = node; }}
      appearance="segmented"
      value={option.value}
      tabIndex={value === null ? (index === 0 ? 0 : -1) : option.value === value ? 0 : -1}>
      {option.label}
    </RadioGroupItem>)}
  </RadioGroup>;
}
