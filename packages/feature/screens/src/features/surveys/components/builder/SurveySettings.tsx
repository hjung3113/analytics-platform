import type { Survey } from '../../types';
import { SurveyManagedSystemPill } from '../SurveyManagedSystemPill';
import { SURVEY_OUTCOME_LINK_COPY as OUTCOME_LINK_COPY } from '../../../../lib/copy/survey-builder';
import { listTasks } from '../../../../lib/api/tasks';
import { Button, Combobox } from '@ap/ui';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

export function SurveySettings({
  survey,
  managedSystemName,
  managedSystemResolved,
  editable,
  outcomeTaskId,
  outcomeTask,
  hasOutcomeTask,
  outcomeTaskLoading,
  outcomeTaskLoadError,
  onOutcomeTaskChange,
  onOutcomeTaskClear,
}: {
  survey: Survey;
  managedSystemName?: string | undefined;
  managedSystemResolved?: boolean | undefined;
  editable: boolean;
  outcomeTaskId: string | null;
  outcomeTask: { display_id: string; title: string } | null;
  hasOutcomeTask: boolean;
  outcomeTaskLoading: boolean;
  outcomeTaskLoadError: boolean;
  onOutcomeTaskChange: (task: { id: string; display_id: string; title: string }) => void;
  onOutcomeTaskClear: () => void;
}) {
  const [taskSearch, setTaskSearch] = React.useState('');
  const tasks = useQuery({
    queryKey: ['tasks', 'survey-outcome-picker', survey.primary_managed_system_id, taskSearch],
    queryFn: ({ signal }) =>
      listTasks({
        managed_system_id: survey.primary_managed_system_id,
        ...(taskSearch.trim() ? { q: taskSearch.trim() } : {}),
        limit: 20,
        signal,
      }),
    enabled: survey.type === 'outcome' && editable && !outcomeTaskLoadError,
    retry: false,
  });
  const taskOptions = [
    ...(outcomeTaskId && outcomeTask && !tasks.data?.items.some((task) => task.id === outcomeTaskId)
      ? [{ value: outcomeTaskId, label: `${outcomeTask.display_id} · ${outcomeTask.title}` }]
      : []),
    ...(tasks.data?.items ?? [])
      .filter((task) => task.primary_managed_system_id === survey.primary_managed_system_id)
      .map((task) => ({ value: task.id, label: `${task.display_id} · ${task.title}` })),
  ];
  return (
    <aside className="border-l border-border-subtle p-4">
      <p className="text-xs uppercase text-text-muted">설문 설정</p>
      <p className="mt-3 text-sm">시스템</p>
      <SurveyManagedSystemPill name={managedSystemName} resolved={managedSystemResolved} />
      <p className="mt-5 text-sm">응답 익명성</p>
      <p className="text-xs text-text-muted">
        {survey.responses_identity_protected
          ? '응답은 익명으로 처리되며 개인을 식별할 수 없습니다.'
          : '응답에 개인 식별자가 포함될 수 있으니 관련 정책을 확인하세요.'}
      </p>
      <p className="mt-5 text-xs text-text-muted">설문 응답 → VOC 생성은 금지됩니다.</p>
      {survey.type === 'outcome' ? (
        <div className="mt-5 flex flex-col gap-2">
          <p className="text-sm font-medium">{OUTCOME_LINK_COPY.taskHeading}</p>
          {outcomeTaskLoadError ? (
            <p role="alert" className="text-xs text-text-danger">
              {OUTCOME_LINK_COPY.taskLoadError} 다시 열어 확인해 주세요.
            </p>
          ) : outcomeTaskLoading ? (
            <output className="text-xs text-text-muted">{OUTCOME_LINK_COPY.taskLoading}</output>
          ) : hasOutcomeTask && outcomeTaskId === null ? (
            <p className="text-xs text-text-muted">
              {OUTCOME_LINK_COPY.taskHidden}
            </p>
          ) : hasOutcomeTask && outcomeTask ? (
            <p className="text-sm text-text-secondary">
              {outcomeTask.display_id} · {outcomeTask.title}
            </p>
          ) : (
            <p className="text-xs text-text-muted">{OUTCOME_LINK_COPY.taskUnlinked}</p>
          )}
          {editable ? (
            <>
              <Combobox
                id="survey-builder-outcome-task"
                value={outcomeTaskId}
                onChange={(id) => {
                  const selected = tasks.data?.items.find((task) => task.id === id);
                  if (selected) {
                    onOutcomeTaskChange({
                      id: selected.id,
                      display_id: selected.display_id,
                      title: selected.title,
                    });
                  }
                }}
                onSearchChange={setTaskSearch}
                filterOptions={false}
                options={taskOptions}
                disabled={!editable || outcomeTaskLoadError}
                loading={tasks.isLoading || tasks.isFetching}
                placeholder={OUTCOME_LINK_COPY.taskPickerPlaceholder}
                searchPlaceholder={OUTCOME_LINK_COPY.taskSearchPlaceholder}
                listboxLabel={OUTCOME_LINK_COPY.taskPickerLabel}
                emptyText={tasks.isError ? OUTCOME_LINK_COPY.taskLoadError : OUTCOME_LINK_COPY.taskUnlinked}
              />
              {hasOutcomeTask ? (
                <Button
                  type="button"
                  variant="subtle"
                  size="sm"
                  className="self-start"
                  disabled={outcomeTaskLoadError}
                  onClick={onOutcomeTaskClear}
                >
                  {OUTCOME_LINK_COPY.clearTask}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
