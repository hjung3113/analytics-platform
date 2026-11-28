import { describe, expect, it, vi } from 'vitest';
import { saveSurveyDraft } from '../saveSurveyDraft';

function createDeps(input: {
  title?: string;
  savedTitle?: string;
  outcomeTaskId: string | null;
  outcomeTaskTouched: boolean;
  onOutcomeTaskSaved?: () => void;
}) {
  const updateSurvey = vi.fn(async (_body: unknown) => undefined);
  const onOutcomeTaskSaved = input.onOutcomeTaskSaved ?? vi.fn();
  return {
    updateSurvey,
    onOutcomeTaskSaved,
    deps: {
      creationAttempts: new Map(),
      questionsRef: { current: [] },
      titleRef: { current: input.title ?? 'Saved title' },
      savedTitleRef: { current: input.savedTitle ?? 'Saved title' },
      descriptionRef: { current: 'Saved description' },
      savedDescriptionRef: { current: 'Saved description' },
      outcomeTaskId: input.outcomeTaskId,
      outcomeTaskTouched: input.outcomeTaskTouched,
      savedOutcomeTaskIdRef: { current: null },
      onOutcomeTaskSaved,
      savedQuestionsRef: { current: [] },
      replaceLocalId: vi.fn(),
      updateQuestions: vi.fn(),
      mutations: {
        updateSurvey,
        remove: vi.fn(async () => undefined),
        create: vi.fn(async () => ({ id: 'created-question' })),
        update: vi.fn(async () => undefined),
        reorder: vi.fn(async () => undefined),
      },
    },
  };
}

describe('saveSurveyDraft Outcome Survey Task patch', () => {
  it('omits outcome_task_id when the Task field was untouched', async () => {
    const { deps, updateSurvey } = createDeps({
      title: 'Updated title',
      outcomeTaskId: 'hidden-task-id',
      outcomeTaskTouched: false,
    });

    await saveSurveyDraft(deps);

    expect(updateSurvey).toHaveBeenCalledWith({ title: 'Updated title' });
    expect(updateSurvey.mock.calls[0]?.[0]).not.toHaveProperty('outcome_task_id');
  });

  it('sends null when a hidden Task link was cleared', async () => {
    const { deps, updateSurvey } = createDeps({
      outcomeTaskId: null,
      outcomeTaskTouched: true,
    });

    await saveSurveyDraft(deps);

    expect(updateSurvey).toHaveBeenCalledWith({ outcome_task_id: null });
  });

  it('sends a selected Task id and resets the touched state after saving', async () => {
    const touched = { current: true };
    const onOutcomeTaskSaved = vi.fn(() => {
      touched.current = false;
    });
    const { deps, updateSurvey } = createDeps({
      outcomeTaskId: 'picked-task-id',
      outcomeTaskTouched: true,
      onOutcomeTaskSaved,
    });

    await saveSurveyDraft(deps);

    expect(updateSurvey).toHaveBeenCalledWith({ outcome_task_id: 'picked-task-id' });
    expect(onOutcomeTaskSaved).toHaveBeenCalledOnce();
    expect(touched.current).toBe(false);
  });
});
