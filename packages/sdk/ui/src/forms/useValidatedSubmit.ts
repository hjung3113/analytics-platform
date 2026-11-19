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
      const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
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

  const handleSubmit = React.useCallback(
    (values: TValues): React.FormEventHandler<HTMLFormElement> =>
      (event) => {
        event.preventDefault();
        formRef.current = event.currentTarget;
        const nextErrors = validate(values);
        const hasErrors = Object.values(nextErrors).some(
          (message) => message !== undefined && message !== null && message !== '',
        );
        setErrors(nextErrors);
        if (hasErrors) {
          shouldFocusInvalidRef.current = true;
          return;
        }
        shouldFocusInvalidRef.current = false;
        void onValid(values, event);
      },
    [onValid, validate],
  );

  return { errors, handleSubmit, clearErrors };
}
