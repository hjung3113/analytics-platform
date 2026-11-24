import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { listTasks } from '../../../lib/api/tasks';
import { SURVEY_OUTCOME_LINK_COPY as COPY } from '../../../lib/copy/survey-builder';
import { SurveySettings } from '../components/builder/SurveySettings';
import { CreateSurveyDialog } from '../components/create/CreateSurveyDialog';
import type { Survey } from '../types';

vi.mock('../../../lib/api/tasks', () => ({ listTasks: vi.fn() }));

const system = '30000000-0000-4000-8000-000000000003';
const pickerNames = { builder: COPY.taskHeading, create: COPY.taskPickerLabel };

async function openTaskSearch(surface: keyof typeof pickerNames) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(['managed-systems', { includeArchived: false }], {
    items: [{ id: system, name: '시스템 A', archived_at: null }],
  });
  client.setQueryData(['permission-scope', 'survey.manage'], { scope: { kind: 'all' } });
  client.setQueryData(['analytics-areas', 'catalog', system], { items: [] });
  const read = vi.mocked(listTasks).mockReset().mockResolvedValue({ items: [] });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      {surface === 'builder' ? (
        <SurveySettings
          survey={{ type: 'outcome', primary_managed_system_id: system } as Survey}
          managedSystemName="시스템 A"
          editable
          outcomeTaskId={null}
          outcomeTask={null}
          hasOutcomeTask={false}
          outcomeTaskLoading={false}
          outcomeTaskLoadError={false}
          onOutcomeTaskChange={vi.fn()}
          onOutcomeTaskClear={vi.fn()}
        />
      ) : (
        <CreateSurveyDialog open onClose={() => {}} onCreated={() => {}} />
      )}
    </QueryClientProvider>,
  );
  if (surface === 'create') {
    for (const [name, keys] of [['설문 유형', '{End}{Enter}'], ['시스템', '{Home}{Enter}']] as const) {
      screen.getByRole('combobox', { name }).focus();
      await user.keyboard('{Enter}');
      await screen.findByRole('listbox');
      await user.keyboard(keys);
    }
  }
  await user.click(screen.getByRole('combobox', { name: pickerNames[surface] }));
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(read).toHaveBeenCalledOnce();
  read.mockClear();
  return { client, read, input: screen.getByPlaceholderText(COPY.taskSearchPlaceholder) };
}

afterEach(() => vi.useRealTimers());

it.each([
  ['builder', 'abcde', 300],
  ['create', 'abcde', 300],
  ['builder', 'abcd한', 700],
  ['create', 'abcd한', 700],
] as const)('%s sends one Task search for %s after %i ms and resets on clear', async (surface, text, delay) => {
  const { client, read, input } = await openTaskSearch(surface);
  vi.useFakeTimers();
  for (let length = 1; length <= text.length; length += 1) {
    fireEvent.change(input, { target: { value: text.slice(0, length) } });
  }
  expect(input).toHaveValue(text);
  await act(async () => { await vi.advanceTimersByTimeAsync(delay - 1); });
  expect(read).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(read).toHaveBeenCalledOnce();
  expect(read).toHaveBeenCalledWith(expect.objectContaining({ q: text, managed_system_id: system }));

  client.removeQueries({ queryKey: ['tasks', 'survey-outcome-picker', system, ''], exact: true });
  fireEvent.change(input, { target: { value: '' } });
  expect(input).toHaveValue('');
  expect(read).toHaveBeenCalledTimes(2);
  expect(read.mock.lastCall?.[0]).not.toHaveProperty('q');
});
