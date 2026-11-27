import * as React from 'react';

export type ValidationErrors<TValues> = Partial<Record<Extract<keyof TValues, string>, string>>;

export interface UseValidatedSubmitOptions<TValues> {
  validate: (values: TValues) => ValidationErrors<TValues>;
  onValid: (values: TValues, event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
}

export interface UseValidatedSubmitResult<TValues> {
  errors: ValidationErrors<TValues>;
  /** Bind the current values to a form's submit handler. */
  handleSubmit: (values: TValues) => React.FormEventHandler<HTMLFormElement>;
  /** Clear errors when the surrounding form is reset or closed. */
  clearErrors: () => void;
  /** Clear only the error for a field whose value changed. */
  clearError: (field: Extract<keyof TValues, string>) => void;
  /**
   * Opt-in (#3173): show the field errors the server returned for the last valid submit. They replace `errors` (empty after a valid submit), the first invalid
   * control takes focus as after a local check, and `clearError`, `clearErrors` or the next submit clear them. Pass `{}` to clear.
   */
  setServerErrors: (errors: ValidationErrors<TValues>) => void;
}

/** True when any field carries a non-empty message. */
function hasErrors<TValues>(errors: ValidationErrors<TValues>): boolean {
  return Object.values(errors).some((message) => message !== undefined && message !== null && message !== '');
}

/** Validate only after submit, then focus the first invalid control after its `aria-invalid` props render. */
export function useValidatedSubmit<TValues>({
  validate,
  onValid,
}: UseValidatedSubmitOptions<TValues>): UseValidatedSubmitResult<TValues> {
  const [errors, setErrors] = React.useState<ValidationErrors<TValues>>({});
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const shouldFocusInvalidRef = React.useRef(false);

  React.useLayoutEffect(() => {
    if (!shouldFocusInvalidRef.current) return;
    const focusInvalid = () => {
      // A disabled control cannot take focus; the first one the person can still fix does (#2574).
      const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]:not(:disabled)');
      if (!invalid) return false;
      shouldFocusInvalidRef.current = false;
      invalid.focus();
      return true;
    };
    if (focusInvalid()) return;

    // Composite controls can expose aria-invalid on a follow-up render after
    // the error text commits. Retry once after that commit instead of leaving
    // focus on the submit button or body.
    const timeoutId = window.setTimeout(() => {
      if (!focusInvalid()) shouldFocusInvalidRef.current = false;
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [errors]);

  const clearErrors = React.useCallback(() => {
    shouldFocusInvalidRef.current = false;
    formRef.current = null;
    setErrors({});
  }, []);

  const clearError = React.useCallback((field: Extract<keyof TValues, string>) => {
    shouldFocusInvalidRef.current = false;
    setErrors((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, field)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const handleSubmit = React.useCallback(
    (values: TValues): React.FormEventHandler<HTMLFormElement> =>
      (event) => {
        event.preventDefault();
        formRef.current = event.currentTarget;
        const nextErrors = validate(values);
        setErrors(nextErrors);
        if (hasErrors(nextErrors)) {
          shouldFocusInvalidRef.current = true;
          return;
        }
        shouldFocusInvalidRef.current = false;
        void onValid(values, event);
      },
    [onValid, validate],
  );

  const setServerErrors = React.useCallback((next: ValidationErrors<TValues>) => {
    shouldFocusInvalidRef.current = hasErrors(next);
    setErrors(next);
  }, []);

  return { errors, handleSubmit, clearErrors, clearError, setServerErrors };
}
