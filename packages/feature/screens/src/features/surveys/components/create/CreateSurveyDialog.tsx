import { fetchCapabilityScopeViaClient } from '../../../../lib/api/permission-reads';
import { fetchManagedSystems } from '../../../../lib/api/registry-reads';
import { ApiError } from '../../../../lib/api/types';
import { SURVEY_STATUS_LABELS, SURVEY_TYPE_LABELS } from '../../../../lib/copy/enum-labels';
import { SURVEY_START_COPY as COPY } from '../../../../lib/copy/survey-builder';
import {
  activeAnalyticsAreas,
  analyticsAreasCatalogQuery,
} from '../../../../lib/cross-system/analyticsAreasCatalog';
import { searchDebounceMs } from '../../../../lib/forms/search-debounce';
import {
  type SurveyCopySourceQuestion,
  type SurveyStartingPoint,
  surveyTypeSchema,
} from '@ap/feature-shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  useImeEnterGuard,
  useValidatedSubmit,
} from '@ap/ui';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import {
  useCreateSurvey,
  useSurveyCopySource,
  useSurveyCopySources,
  useSurveyTemplates,
} from '../../hooks/useSurveys';
import type { SurveyType } from '../../types';

interface SurveyCreateValues {
  title: string;
  type: SurveyType | '';
  system: string;
  identityProtected: 'true' | 'false' | '';
  mode: 'blank' | 'builtin' | 'existing';
  startingPoint: string;
  startingPointReady: boolean;
  startingPointLoading: boolean;
  systemInScope: boolean;
  blocked: boolean;
}

export function CreateSurveyDialog({
  open,
  onClose,
  onCreated,
  canManage = true,
}: {
  open: boolean;
  canManage?: boolean;
  onClose: () => void;
  onCreated: (surveyId: string) => void;
}) {
  const ime = useImeEnterGuard();
  const [title, setTitle] = React.useState('');
  const [type, setType] = React.useState<SurveyType | ''>('');
  const [system, setSystem] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [analyticsArea, setAnalyticsArea] = React.useState('');
  const [identityProtected, setIdentityProtected] = React.useState<'true' | 'false' | ''>('');
  const create = useCreateSurvey();
  const submitting = React.useRef(false);
  const titleRef = React.useRef<HTMLInputElement | null>(null);
  const pinnedStart = React.useRef<SurveyStartingPoint | null>(null);
  const [mode, setMode] = React.useState<'blank' | 'builtin' | 'existing'>('blank');
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [templateId, setTemplateId] = React.useState('');
  const [sourceId, setSourceId] = React.useState('');
  const [blocked, setBlocked] = React.useState(false);
  const [titleEdited, setTitleEdited] = React.useState(false);
  const templates = useSurveyTemplates(system, open && canManage && mode === 'builtin');
  const sources = useSurveyCopySources(
    system,
    debouncedSearch,
    open && canManage && mode === 'existing',
  );
  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearch(search), searchDebounceMs(search));
    return () => window.clearTimeout(timeoutId);
  }, [search]);
  const source = useSurveyCopySource(
    sourceId,
    open && canManage && mode === 'existing' && !blocked,
  );
  const templateItems = !blocked && !templates.isFetching ? (templates.data?.items ?? []) : [];
  const sourceItems =
    !blocked && (!sources.isFetching || sources.isFetchingNextPage)
      ? (sources.data?.pages.flatMap((page) => page.items) ?? [])
      : [];
  const template = templates.data?.items.find((item) => item.template_id === templateId);
  const systems = useQuery({
    queryKey: ['managed-systems', { includeArchived: false }],
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: false, signal }),
    enabled: open,
    retry: false,
  });
  const scope = useQuery({
    queryKey: ['permission-scope', 'survey.manage'],
    queryFn: ({ signal }) => fetchCapabilityScopeViaClient('survey.manage', { signal }),
    enabled: open,
    retry: false,
  });
  const analyticsAreas = useQuery({
    ...analyticsAreasCatalogQuery(system),
    select: activeAnalyticsAreas,
    enabled: open && Boolean(system),
    retry: false,
  });
  const allowedSystems = (systems.data?.items ?? []).filter(
    (candidate) =>
      candidate.archived_at === null &&
      (scope.data?.scope.kind === 'all' ||
        (scope.data?.scope.kind === 'scoped' &&
          scope.data.scope.managed_system_ids.includes(candidate.id))),
  );
  const systemInScope = allowedSystems.some((candidate) => candidate.id === system);
  const definition =
    canManage && !blocked && systemInScope
      ? mode === 'builtin' && !templates.isFetching && !templates.isError
        ? template
        : mode === 'existing' && !source.isFetching && !source.isError
          ? source.data
          : undefined
      : undefined;
  const resetCreate = create.reset;
  const clearSelection = React.useCallback(() => {
    setTemplateId('');
    setSourceId('');
    setBlocked(false);
    pinnedStart.current = null;
    // A blocked attempt (409/403/404) must not leave its create error behind a
    // fresh reselection; an in-flight attempt is never reset (FO ADR-0070).
    if (!create.isPending) resetCreate();
  }, [resetCreate, create.isPending]);
  React.useEffect(() => {
    // While an attempt is pinned (uncertain outcome) a background refetch must
    // not alter what the next unchanged retry sends (FO ADR-0070: one explicit key
    // for an unchanged pending/uncertain attempt).
    if (definition && !pinnedStart.current) {
      setType(definition.type);
      if (!titleEdited) setTitle(definition.title);
    }
  }, [definition, titleEdited]);
  React.useEffect(() => {
    if (!canManage) {
      clearSelection();
      setSearch('');
      setDebouncedSearch('');
    }
  }, [canManage, clearSelection]);
  const startingPointChosen =
    (mode === 'builtin' && templateId !== '') || (mode === 'existing' && sourceId !== '');
  const startingPointLoading =
    startingPointChosen &&
    ((mode === 'builtin' && templates.isFetching) ||
      (mode === 'existing' && source.isFetching));
  const startingPointListLoading =
    (mode === 'builtin' && templates.isFetching) ||
    (mode === 'existing' && sources.isFetching && !sources.isFetchingNextPage);
  const startingPointListUnavailable =
    (mode === 'builtin' && templates.isError) || (mode === 'existing' && sources.isError);
  const noAvailableStartingPoints =
    mode === 'existing' &&
    !blocked &&
    sources.isSuccess &&
    !sources.isFetching &&
    !sources.hasNextPage &&
    sourceItems.length === 0;
  let submitDisabledReason: string | undefined;
  if (!canManage) {
    submitDisabledReason = COPY.permissionUnavailable;
  } else if (create.isPending || submitting.current) {
    submitDisabledReason = COPY.creating;
  } else if (startingPointLoading || startingPointListLoading) {
    submitDisabledReason = COPY.loading;
  } else if (!blocked && startingPointListUnavailable) {
    submitDisabledReason = COPY.loadFailed;
  } else if (!blocked && noAvailableStartingPoints) {
    submitDisabledReason = search.trim() ? COPY.searchEmpty : COPY.empty;
  } else if (!blocked && mode === 'existing' && startingPointChosen && source.isError) {
    submitDisabledReason = COPY.previewFailed;
  }
  const sourceReadDenied =
    (sources.error instanceof ApiError &&
      (sources.error.status === 403 || sources.error.status === 404)) ||
    (source.error instanceof ApiError &&
      (source.error.status === 403 || source.error.status === 404));
  const { errors, handleSubmit, clearErrors, clearError } = useValidatedSubmit<SurveyCreateValues>({
    validate: (values) => {
      const next: Partial<Record<keyof SurveyCreateValues, string>> = {};
      if (values.title.trim() === '') next.title = COPY.titleRequired;
      if (values.type === '') next.type = COPY.typeRequired;
      if (values.system === '') next.system = COPY.systemRequired;
      else if (!values.systemInScope) next.system = COPY.systemUnavailable;
      if (values.mode !== 'blank') {
        if (values.blocked) {
          next.startingPoint = COPY.startingPointUnavailable;
        } else if (values.startingPoint === '') {
          next.startingPoint = COPY.startingPointRequired;
        } else if (!values.startingPointReady && !values.startingPointLoading) {
          next.startingPoint = COPY.startingPointUnavailable;
        }
      }
      if (values.identityProtected === '') {
        next.identityProtected = COPY.identityProtectionRequired;
      }
      return next;
    },
    onValid: createSurvey,
  });
  React.useEffect(() => {
    if (systemInScope) clearError('system');
  }, [systemInScope, clearError]);
  React.useEffect(() => {
    if (!sourceReadDenied) return;
    setBlocked(true);
    setTemplateId('');
    setSourceId('');
    pinnedStart.current = null;
  }, [sourceReadDenied]);
  React.useEffect(() => {
    // Selected Managed System leaving the manageable scope latches like a read
    // denial: source data and submission block until explicit 새로고침 or
    // reselection; an automatic scope refresh restores neither (FO ADR-0070).
    if (!system || systemInScope) return;
    setBlocked(true);
    setTemplateId('');
    setSourceId('');
    pinnedStart.current = null;
  }, [system, systemInScope]);
  const reset = React.useCallback(() => {
    setTitle('');
    setType('');
    setSystem('');
    setDescription('');
    setAnalyticsArea('');
    setIdentityProtected('');
    setMode('blank');
    setSearch('');
    setDebouncedSearch('');
    clearSelection();
    setTitleEdited(false);
    clearErrors();
    resetCreate();
  }, [resetCreate, clearSelection, clearErrors]);
  async function createSurvey(values: SurveyCreateValues): Promise<void> {
    if (
      submitting.current ||
      !canManage ||
      values.type === '' ||
      values.system === '' ||
      values.identityProtected === ''
    )
      return;
    const startingPoint: SurveyStartingPoint | undefined =
      pinnedStart.current ??
      (values.mode === 'builtin' && template
        ? { kind: 'builtin', template_id: template.template_id, version: template.version }
        : values.mode === 'existing' && source.data
          ? {
              kind: 'existing_survey',
              survey_id: source.data.survey_id,
              definition_token: source.data.definition_token,
            }
          : undefined);
    // An unchanged retry replays the submitted token even if a background
    // snapshot refetch installed a changed one (FO ADR-0070: one explicit key
    // for an unchanged pending/uncertain attempt).
    pinnedStart.current = startingPoint ?? null;
    submitting.current = true;
    try {
      const created = await create.mutateAsync({
        type: values.type,
        title: values.title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        primary_managed_system_id: values.system,
        ...(analyticsArea ? { analytics_area_id: analyticsArea } : {}),
        responses_identity_protected: values.identityProtected === 'true',
        ...(startingPoint ? { starting_point: startingPoint } : {}),
      });
      reset();
      onCreated(created.id);
    } catch (error) {
      if (
        startingPoint &&
        error instanceof ApiError &&
        (error.status === 403 ||
          error.status === 404 ||
          error.code === 'conflict.stale_write')
      ) {
        setBlocked(true);
        setTemplateId('');
        setSourceId('');
        pinnedStart.current = null;
      }
    } finally {
      submitting.current = false;
    }
  }
  const close = () => {
    if (submitting.current || create.isPending) return;
    reset();
    onClose();
  };
  React.useEffect(() => {
    if (!open && !create.isPending && !submitting.current) reset();
  }, [open, create.isPending, reset]);
  return (
    <Dialog
      open={(open && canManage) || create.isPending}
      onOpenChange={(next) => !next && close()}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        onOpenAutoFocus={(event) => {
          // Blank creation is the entry state; focus 제목 as on develop.
          if (titleRef.current) {
            event.preventDefault();
            titleRef.current.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (submitting.current) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (submitting.current) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>설문 생성</DialogTitle>
          <DialogDescription>{COPY.intro}</DialogDescription>
        </DialogHeader>
        <form onKeyDown={ime.onKeyDown} onCompositionStart={ime.onCompositionStart} onCompositionEnd={ime.onCompositionEnd}
          className="flex flex-col gap-4"
          onSubmit={handleSubmit({
            title,
            type,
            system,
            identityProtected,
            mode,
            startingPoint: mode === 'builtin' ? templateId : mode === 'existing' ? sourceId : '',
            startingPointReady: Boolean(definition),
            startingPointLoading,
            systemInScope,
            blocked,
          })}
        >
          {!canManage ? (
            <output>{COPY.permissionUnavailable}</output>
          ) : (
            <fieldset disabled={create.isPending} className="flex flex-col gap-4">
              <div>
                {COPY.mode}
                <Select
                  value={mode}
                  onValueChange={(value) => {
                    setMode(value as typeof mode);
                    clearSelection();
                    clearErrors();
                    setSearch('');
                    setDebouncedSearch('');
                  }}
                >
                  <SelectTrigger aria-label={COPY.mode}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blank">{COPY.blank}</SelectItem>
                    <SelectItem value="builtin">{COPY.builtin}</SelectItem>
                    <SelectItem value="existing">{COPY.existing}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <FormField
                id="survey-title"
                label="제목"
                required
                requiredMark="text"
                error={errors.title}
              >
                {(control) => (
                  <Input
                    {...control}
                    ref={titleRef}
                    aria-label="제목"
                    value={title}
                    onChange={(event) => {
                      setTitleEdited(true);
                      setTitle(event.target.value);
                      clearError('title');
                    }}
                  />
                )}
              </FormField>
              <FormField label="설문 유형" required requiredMark="text" error={errors.type}>
                {(control) => (
                  <Select
                    value={type}
                    disabled={startingPointChosen}
                    onValueChange={(value) => {
                      setType(value as SurveyType);
                      clearError('type');
                    }}
                  >
                    <SelectTrigger {...control} aria-label="설문 유형">
                      <SelectValue placeholder="유형 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {surveyTypeSchema.options.map((type) => (
                        <SelectItem key={type} value={type}>
                          {SURVEY_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <div>
                {startingPointChosen ? (
                  <p className="text-sm text-text-muted">{COPY.sourceSetsType}</p>
                ) : null}
              </div>
              <FormField label="시스템" required requiredMark="text" error={errors.system}>
                {(control) => (
                  <Select
                    value={system}
                    onValueChange={(value) => {
                      setSystem(value);
                      setAnalyticsArea('');
                      clearSelection();
                      clearError('system');
                      clearError('startingPoint');
                      setSearch('');
                      setDebouncedSearch('');
                    }}
                  >
                    <SelectTrigger {...control} aria-label="시스템">
                      <SelectValue placeholder="시스템 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedSystems.map((candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          {candidate.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              {mode !== 'blank' && (
                <section aria-label={COPY.preview} className="flex flex-col gap-2">
                  {!system ? (
                    <p>{COPY.chooseSystem}</p>
                  ) : !systemInScope ? (
                    <p role="alert" className="text-sm text-text-danger">
                      {COPY.reselect}
                    </p>
                  ) : (
                    <>
                      {mode === 'existing' && (
                        <>
                          <Input
                            aria-label={COPY.search}
                            placeholder={`${COPY.search}…`}
                            value={search}
                            maxLength={200}
                            onChange={(event) => {
                              setSearch(event.target.value);
                              clearSelection();
                            }}
                          />
                          {startingPointChosen ? null : (
                            <p className="text-sm text-text-muted">{COPY.sourceSetsType}</p>
                          )}
                        </>
                      )}
                      {(mode === 'builtin'
                        ? templates.isFetching
                        : sources.isFetching && !sources.isFetchingNextPage) && (
                        <output>{COPY.loading}</output>
                      )}
                      {(mode === 'builtin' ? templates.isError : sources.isError) && !blocked ? (
                        <p role="alert" className="text-sm text-text-danger">
                          {COPY.loadFailed}
                        </p>
                      ) : (
                        <FormField
                          label={COPY.startingPoint}
                          required
                          requiredMark="text"
                          error={errors.startingPoint}
                        >
                          {(control) => (
                            <ToggleGroup
                              {...control}
                              tabIndex={errors.startingPoint ? -1 : undefined}
                              type="single"
                              variant="outline"
                              size="sm"
                              orientation="vertical"
                              // Focus-only arrows: changing the start clears an uncertain create attempt and its retry key (#2552).
                              arrowSelects={false}
                              className="max-h-48 flex-col items-stretch overflow-y-auto"
                              aria-label={mode === 'builtin' ? COPY.builtin : COPY.existing}
                              value={mode === 'builtin' ? templateId : sourceId}
                              onValueChange={(value) => {
                                clearSelection();
                                clearError('startingPoint');
                                if (mode === 'builtin') setTemplateId(value);
                                else setSourceId(value);
                              }}
                            >
                              {mode === 'builtin'
                                ? templateItems.map((item) => (
                                    <ToggleGroupItem
                                      key={item.template_id}
                                      value={item.template_id}
                                      appearance="selected-filter"
                                      className="justify-start"
                                    >
                                      {item.title} · {SURVEY_TYPE_LABELS[item.type]} ·{' '}
                                      {COPY.questions(item.questions.length)}
                                    </ToggleGroupItem>
                                  ))
                                : sourceItems.map((item) => (
                                    <ToggleGroupItem
                                      key={item.survey_id}
                                      value={item.survey_id}
                                      appearance="selected-filter"
                                      className="justify-start"
                                    >
                                      {item.display_id} · {item.title} ·{' '}
                                      {SURVEY_STATUS_LABELS[item.status]} ·{' '}
                                      {COPY.questions(item.question_count)}
                                    </ToggleGroupItem>
                                  ))}
                            </ToggleGroup>
                          )}
                        </FormField>
                      )}
                      {mode === 'existing' &&
                        sources.isSuccess &&
                        !sources.isFetching &&
                        !blocked &&
                        !sources.hasNextPage &&
                        sources.data.pages.every((page) => page.items.length === 0) && (
                          <p>{search.trim() ? COPY.searchEmpty : COPY.empty}</p>
                        )}
                      {mode === 'existing' && sources.hasNextPage && (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={sources.isFetchingNextPage}
                          disabledReason={sources.isFetchingNextPage ? COPY.loading : undefined}
                          onClick={() => void sources.fetchNextPage()}
                        >
                          {COPY.more}
                        </Button>
                      )}
                      {mode === 'existing' && sourceId && source.isFetching && (
                        <output>{COPY.loading}</output>
                      )}
                      {mode === 'existing' && sourceId && source.isError && (
                        <p role="alert" className="text-sm text-text-danger">
                          {COPY.previewFailed}
                        </p>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="self-end"
                        onClick={() => {
                          clearSelection();
                          if (mode === 'builtin') void templates.refetch();
                          else void sources.refetch();
                        }}
                      >
                        {COPY.retry}
                      </Button>
                      {definition && (
                        <p className="text-xs font-medium text-text-muted">{COPY.preview}</p>
                      )}
                      {template && definition && <p className="text-sm">{template.description}</p>}
                      {definition && (
                        <ol className="flex max-h-40 flex-col gap-2 overflow-y-auto text-sm">
                          {definition.questions.map((question, index) => (
                            <li key={'key' in question ? question.key : question.id}>
                              <p>
                                {index + 1}. {question.prompt} ·{' '}
                                {question.is_required ? COPY.required : COPY.optional}
                              </p>
                              {'options' in question && question.options && (
                                <p>{question.options.map((option) => option.label).join(' / ')}</p>
                              )}
                              {question.kind === 'rating' && (
                                <p>
                                  {question.rating_min}–{question.rating_max}
                                  {(question.rating_low_label || question.rating_high_label) && (
                                    <>
                                      {' · '}
                                      {question.rating_low_label}
                                      {question.rating_low_label &&
                                        question.rating_high_label &&
                                        ' / '}
                                      {question.rating_high_label}
                                    </>
                                  )}
                                </p>
                              )}
                              {'branch_parent_question_id' in question &&
                                question.branch_parent_question_id && (
                                  <p>
                                    {COPY.branch(
                                      definition.questions.find(
                                        (parent) =>
                                          'id' in parent &&
                                          parent.id === question.branch_parent_question_id,
                                      )?.prompt ?? '',
                                      definition.questions
                                        .find(
                                          (parent): parent is SurveyCopySourceQuestion =>
                                            'id' in parent &&
                                            parent.id === question.branch_parent_question_id,
                                        )
                                        ?.options?.find(
                                          (option) =>
                                            option.key === question.branch_trigger_option_key,
                                        )?.label ?? '',
                                    )}
                                  </p>
                                )}
                            </li>
                          ))}
                        </ol>
                      )}
                    </>
                  )}
                </section>
              )}
              <label className="block text-sm" htmlFor="survey-description">
                설명 (선택)
                <Textarea
                  id="survey-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <div className="block text-sm">
                분석 영역 (선택)
                <Select value={analyticsArea} onValueChange={setAnalyticsArea} disabled={!system}>
                  <SelectTrigger aria-label="분석 영역">
                    <SelectValue placeholder="선택 안 함" />
                  </SelectTrigger>
                  <SelectContent>
                    {(analyticsAreas.data?.items ?? []).map((area) => (
                      <SelectItem key={area.id} value={area.id}>
                        {area.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <FormField
                label="응답 익명 보호"
                required
                requiredMark="text"
                error={errors.identityProtected}
              >
                {(control) => (
                  <Select
                    value={identityProtected}
                    onValueChange={(value) => {
                      setIdentityProtected(value as 'true' | 'false');
                      clearError('identityProtected');
                    }}
                  >
                    <SelectTrigger {...control} aria-label="응답 익명 보호">
                      <SelectValue placeholder="보호 여부 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">보호함</SelectItem>
                      <SelectItem value="false">보호하지 않음</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            </fieldset>
          )}
          {blocked && !(mode !== 'blank' && Boolean(system) && !systemInScope) && (
            <p role="alert" className="text-sm text-text-danger">
              {COPY.reselect}
            </p>
          )}
          {create.isError && !blocked && (
            <p role="alert" className="text-sm text-text-danger">
              {COPY.createFailed}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={close}
              disabled={create.isPending || submitting.current}
              data-testid="survey-create-cancel"
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={submitDisabledReason !== undefined}
              disabledReason={submitDisabledReason}
              data-testid="survey-create-submit"
            >
              초안 만들기
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
