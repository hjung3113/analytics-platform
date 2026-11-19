import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Input } from '../../components/shadcn/input.js';
import { FormField } from '../FormField.js';
import { useValidatedSubmit } from '../useValidatedSubmit.js';

type Values = { first: string; second: string };

function ValidationForm({ onValid }: { onValid: (values: Values, event: React.FormEvent<HTMLFormElement>) => void }) {
  const [values, setValues] = React.useState<Values>({ first: '', second: '' });
  const { errors, handleSubmit, clearError } = useValidatedSubmit({
    validate: (next) => {
      const errors: Partial<Record<keyof Values, string>> = {};
      if (next.second.trim() === '') errors.second = 'Second is required';
      if (next.first.trim() === '') errors.first = 'First is required';
      return errors;
    },
    onValid,
  });

  return (
    <form data-testid="validation-form" onSubmit={handleSubmit(values)}>
      <FormField label="First" error={errors.first}>
        {(control) => (
          <Input {...control} value={values.first} onChange={(event) => {
            setValues((current) => ({ ...current, first: event.target.value }));
            clearError('first');
          }} />
        )}
      </FormField>
      <FormField label="Second" error={errors.second}>
        {(control) => (
          <Input {...control} value={values.second} onChange={(event) => {
            setValues((current) => ({ ...current, second: event.target.value }));
            clearError('second');
          }} />
        )}
      </FormField>
      <button type="submit">Save</button>
    </form>
  );
}

it('shows errors only after submit and focuses the first invalid control in DOM order', () => {
  const onValid = vi.fn();
  render(<ValidationForm onValid={onValid} />);

  const first = screen.getByLabelText('First');
  const second = screen.getByLabelText('Second');
  expect(first).not.toHaveAttribute('aria-invalid');
  expect(second).not.toHaveAttribute('aria-invalid');

  fireEvent.submit(screen.getByTestId('validation-form'));

  expect(screen.getByText('First is required')).toBeVisible();
  expect(screen.getByText('Second is required')).toBeVisible();
  expect(first).toHaveAttribute('aria-invalid', 'true');
  expect(first).toHaveFocus();
  expect(onValid).not.toHaveBeenCalled();

  fireEvent.change(first, { target: { value: 'A' } });

  expect(screen.queryByText('First is required')).toBeNull();
  expect(first).not.toHaveAttribute('aria-invalid');
  expect(screen.getByText('Second is required')).toBeVisible();
  expect(second).toHaveAttribute('aria-invalid', 'true');
});

it('calls onValid with values and the form event when validation succeeds', () => {
  const onValid = vi.fn();
  render(<ValidationForm onValid={onValid} />);

  fireEvent.change(screen.getByLabelText('First'), { target: { value: 'A' } });
  fireEvent.change(screen.getByLabelText('Second'), { target: { value: 'B' } });
  fireEvent.submit(screen.getByTestId('validation-form'));

  expect(onValid).toHaveBeenCalledOnce();
  expect(onValid.mock.calls[0]?.[0]).toEqual({ first: 'A', second: 'B' });
  expect(onValid.mock.calls[0]?.[1].type).toBe('submit');
});
