import { useId, type ReactNode } from 'react';
import { cn } from '../utils/cn.js';
import { FieldLabel } from './FieldLabel.js';

/** What `FormField` hands to its one labelable input; spread it on the input (`<Input {...control} />`). */
export interface FormFieldControl {
  id: string;
  /** Hint id, then error id, then the caller's `describedBy`; absent when none of them exist. */
  'aria-describedby'?: string;
  /** `true` only while an error is shown. */
  'aria-invalid'?: true;
  /** `true` only when `required`. */
  'aria-required'?: true;
}

export interface FormFieldProps {
  label: ReactNode;
  required?: boolean;
  /** Tooltip help beside the label (`FieldLabel` `tip`). */
  tip?: string;
  /** Always shown while it exists; it keeps its place when an error appears. */
  hint?: ReactNode;
  /** Shown below the hint; the input gets `aria-invalid`. Set it on submit or when the input is left, not per keystroke. */
  error?: ReactNode;
  /** Defaults to `useId()`. */
  id?: string;
  /** Extra ids appended after the hint and error ids. */
  describedBy?: string;
  className?: string;
  /** Renders exactly one labelable input with the control props. */
  children: (control: FormFieldControl) => ReactNode;
}

const present = (node: ReactNode) => node !== undefined && node !== null && node !== false && node !== '';

/**
 * Label → input → hint → error (docs/contract/components.md §13). The piece owns the label link and `aria-*` wiring; the input
 * owns its error border (`aria-invalid:border-accent-danger`). The error is plain text with no live role: several fields can
 * fail together, so the form announces once and moves focus to the first invalid input on submit.
 */
export function FormField({ label, required, tip, hint, error, id, describedBy, className, children }: FormFieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  const hasHint = present(hint);
  const hasError = present(error);
  const described = [hasHint ? `${fieldId}-hint` : null, hasError ? `${fieldId}-error` : null, describedBy ?? null].filter(Boolean).join(' ');
  const control: FormFieldControl = {
    id: fieldId,
    ...(described ? { 'aria-describedby': described } : {}),
    ...(hasError ? { 'aria-invalid': true as const } : {}),
    ...(required === true ? { 'aria-required': true as const } : {}),
  };
  return (
    <div className={cn('grid gap-1.5', className)}>
      <FieldLabel htmlFor={fieldId} {...(required === true ? { required: true } : {})} {...(tip !== undefined ? { tip } : {})}>{label}</FieldLabel>
      {children(control)}
      {hasHint && <p id={`${fieldId}-hint`} className="text-xs text-text-muted break-keep">{hint}</p>}
      {hasError && <p id={`${fieldId}-error`} className="text-xs text-text-danger-label break-keep">{error}</p>}
    </div>
  );
}
