import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { RadioGroup, RadioGroupItem } from '@ap/ui';

export type SegmentedRadioOption<T extends string> = { value: T; label: ReactNode };

const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];

export function SegmentedRadio<T extends string>({ label, labelledBy, value, onChange, onActivate, options, className }: {
  label: string;
  /** Visible label element id. When set, the group uses aria-labelledby instead of aria-label. */
  labelledBy?: string;
  value: T | null;
  onChange: (next: T) => void;
  /** Every click or Space on an option, including the one already selected (e.g. to reopen its editor). */
  onActivate?: (option: T) => void;
  options: readonly SegmentedRadioOption<T>[];
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // The value this control last reported. Radix checks the item it focuses while an arrow key is held, which would
  // report a keyboard move a second time before the parent re-renders.
  const reported = useRef(value);
  reported.current = value;
  const report = (next: T) => {
    if (next === reported.current) return;
    reported.current = next;
    onChange(next);
  };
  // The keyboard contract (a11y.test.tsx) needs the target focused and selected synchronously; Radix roving focus
  // defers focus to a timer. Handling the keys in the capture phase with preventDefault makes Radix skip its own handler.
  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = event.key;
    if (!KEYS.includes(key)) return;
    event.preventDefault();
    const selected = options.findIndex(option => option.value === value);
    const focused = refs.current.findIndex(node => node === document.activeElement);
    const start = focused >= 0 ? focused : Math.max(0, selected);
    const last = options.length - 1;
    const next = key === 'Home' ? 0
      : key === 'End' ? last
        : key === 'ArrowRight' || key === 'ArrowDown' ? (start + 1) % options.length
          : (start - 1 + options.length) % options.length;
    report(options[next].value);
    refs.current[next]?.focus();
  };
  return <RadioGroup
    appearance="segmented"
    orientation="horizontal"
    value={value ?? ''}
    onValueChange={next => report(next as T)}
    {...(labelledBy ? { 'aria-labelledby': labelledBy } : { 'aria-label': label })}
    onKeyDownCapture={onKeyDownCapture}
    className={className}>
    {options.map((option, index) => <RadioGroupItem
      key={option.value}
      ref={node => { refs.current[index] = node; }}
      appearance="segmented"
      value={option.value}
      onClick={() => onActivate?.(option.value)}
      tabIndex={value === null ? (index === 0 ? 0 : -1) : option.value === value ? 0 : -1}>
      {option.label}
    </RadioGroupItem>)}
  </RadioGroup>;
}
