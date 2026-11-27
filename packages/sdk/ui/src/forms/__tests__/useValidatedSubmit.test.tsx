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

// #3173: server field errors through the same hook — shown on the field, first one focused, cleared like a local error.
function ServerForm({ reject }: { reject: (values: Values) => Promise<Partial<Record<keyof Values, string>>> }) {
  const [values, setValues] = React.useState<Values>({ first: 'a', second: 'b' });
  const save = React.useRef<(values: Values) => Promise<void>>(async () => {});
  const { errors, handleSubmit, clearError, setServerErrors } = useValidatedSubmit<Values>({
    validate: () => ({}),
    onValid: (next): Promise<void> => save.current(next),
  });
  save.current = async (next) => { setServerErrors(await reject(next)); };
  return (
    <form data-testid="server-form" onSubmit={handleSubmit(values)}>
      {(['first', 'second'] as const).map((field) => (
        <FormField key={field} label={field} error={errors[field]}>
          {(control) => (
            <Input {...control} value={values[field]} onChange={(event) => {
              setValues((current) => ({ ...current, [field]: event.target.value }));
              clearError(field);
            }} />
          )}
        </FormField>
      ))}
      <button type="submit">Save</button>
    </form>
  );
}

it('shows server field errors on their fields, focuses the first, and clears one on edit', async () => {
  const reject = vi.fn(async () => ({ second: 'Taken on the server' }));
  render(<ServerForm reject={reject} />);
  const second = screen.getByLabelText('second');
  fireEvent.submit(screen.getByTestId('server-form'));
  expect(await screen.findByText('Taken on the server')).toBeVisible();
  expect(second).toHaveAttribute('aria-invalid', 'true');
  expect(second).toHaveFocus();
  fireEvent.change(second, { target: { value: 'c' } });
  expect(screen.queryByText('Taken on the server')).toBeNull();
  expect(second).not.toHaveAttribute('aria-invalid');
});

it('drops server field errors when the next submit runs', async () => {
  const reject = vi.fn()
    .mockResolvedValueOnce({ first: 'Rejected' })
    .mockResolvedValueOnce({});
  render(<ServerForm reject={reject} />);
  fireEvent.submit(screen.getByTestId('server-form'));
  expect(await screen.findByText('Rejected')).toBeVisible();
  fireEvent.submit(screen.getByTestId('server-form'));
  await vi.waitFor(() => expect(reject).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(screen.queryByText('Rejected')).toBeNull());
});

// #2574: a disabled invalid control cannot take focus, so the first one the person can fix does.
it('skips a disabled invalid control when it moves focus', () => {
  function LockedForm() {
    const { errors, handleSubmit } = useValidatedSubmit<{ locked: string; open: string }>({
      validate: () => ({ locked: 'Locked is wrong', open: 'Open is wrong' }),
      onValid: () => {},
    });
    return (
      <form data-testid="locked-form" onSubmit={handleSubmit({ locked: '', open: '' })}>
        <FormField label="Locked" error={errors.locked}>{(control) => <Input {...control} disabled />}</FormField>
        <FormField label="Open" error={errors.open}>{(control) => <Input {...control} />}</FormField>
      </form>
    );
  }
  render(<LockedForm />);
  fireEvent.submit(screen.getByTestId('locked-form'));
  expect(screen.getByLabelText('Locked')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('Open')).toHaveFocus();
});
