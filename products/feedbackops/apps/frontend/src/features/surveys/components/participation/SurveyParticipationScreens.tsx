import { ListStateMessage } from '@/components/ListStateMessage';
import { errorMapper, mapUnknownError } from '@/lib/api/errorMapper';
import { ApiError } from '@/lib/api/types';
import { useIdempotencyKey } from '@/lib/api/useIdempotencyKey';
import { SURVEY_TYPE_LABELS } from '@/lib/copy/enum-labels';
import {
  SURVEY_PARTICIPATION_COPY,
  respondentIdentityNotice,
} from '@/lib/copy/survey-participation';
import { formatDate } from '@/lib/format/datetime';
import { HostLink } from '@/lib/host/host-seam';
import {
  type AnswerableSurveysResponse,
  type MySurveyResponsesResponse,
  type SurveyRespondentQuestion,
  type SurveyResponseSubmission,
  surveyResponseSubmissionSchema,
} from '@fops/shared';
import { Button, EmptyState, PageShell, Skeleton, SkeletonRows } from '@fops/ui';
import * as React from 'react';
import {
  useAnswerableSurveys,
  useMySurveyResponses,
  useSubmitSurveyResponse,
  useSurveyRespondentForm,
} from '../../hooks/useSurveys';
import { type RespondentAnswer, RespondentQuestion } from '../respond/RespondentQuestion';
import { getVisibleRespondentQuestions } from '../respond/branching';
import { countNonEmptyRespondentAnswers } from '../respond/progress';

type Variant = 'page' | 'embedded';

/** `page` draws the standalone frame; `embedded` leaves frame, scroll and the page heading to the platform host. */
function Frame({
  variant,
  layout,
  children,
}: { variant: Variant; layout: 'wide' | 'centered'; children: React.ReactNode }) {
  if (variant === 'embedded')
    return (
      <div className={layout === 'wide' ? 'max-w-none' : 'flex min-h-full justify-center'}>
        {children}
      </div>
    );
  return layout === 'wide' ? (
    <PageShell contentClassName="max-w-none">{children}</PageShell>
  ) : (
    <PageShell contentClassName="flex min-h-full justify-center">{children}</PageShell>
  );
}

function Landmark({ variant, ...props }: { variant: Variant } & React.ComponentProps<'main'>) {
  return variant === 'embedded' ? (
    <div {...(props as React.ComponentProps<'div'>)} />
  ) : (
    <main {...props} />
  );
}

/** The respond screen's own headings: `h1` in `page`, `h2` in `embedded` (the platform draws the `h1`). */
function pageHeading(variant: Variant) {
  return variant === 'embedded' ? 'h2' : 'h1';
}

export function SurveyParticipationScreen({ variant = 'page' }: { variant?: Variant }) {
  const answerable = useAnswerableSurveys();
  const history = useMySurveyResponses();
  const answerableItems = answerable.data?.pages.flatMap((page) => page.items) ?? [];
  const historyItems = history.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Frame variant={variant} layout="wide">
      <Landmark variant={variant} className="space-y-8" data-testid="survey-participation-page">
        {variant === 'page' && (
          <header>
            <h1 className="text-xl font-semibold tracking-tight text-text-primary">
              {SURVEY_PARTICIPATION_COPY.participate}
            </h1>
            <p className="mt-1 text-sm text-text-muted">{SURVEY_PARTICIPATION_COPY.subtitle}</p>
          </header>
        )}
        <section aria-labelledby="answerable-surveys-heading">
          <h2
            className="mb-3 text-sm font-semibold text-text-primary"
            id="answerable-surveys-heading"
          >
            {SURVEY_PARTICIPATION_COPY.answerableSurveys}
          </h2>
          <AnswerableSurveysRegion
            data={answerableItems}
            isLoading={answerable.isPending}
            isError={answerable.isError && answerable.data === undefined}
            onRetry={() => void answerable.refetch()}
            hasNextPage={answerable.hasNextPage ?? false}
            isFetchingNextPage={answerable.isFetchingNextPage}
            isNextPageError={answerable.isFetchNextPageError}
            onLoadMore={() => void answerable.fetchNextPage()}
          />
        </section>
        <section aria-labelledby="survey-response-history-heading">
          <h2
            className="mb-3 text-sm font-semibold text-text-primary"
            id="survey-response-history-heading"
          >
            {SURVEY_PARTICIPATION_COPY.responseHistory}
          </h2>
          <SurveyResponseHistoryRegion
            data={historyItems}
            isLoading={history.isPending}
            isError={history.isError && history.data === undefined}
            onRetry={() => void history.refetch()}
            hasNextPage={history.hasNextPage ?? false}
            isFetchingNextPage={history.isFetchingNextPage}
            isNextPageError={history.isFetchNextPageError}
            onLoadMore={() => void history.fetchNextPage()}
          />
        </section>
      </Landmark>
    </Frame>
  );
}

function AnswerableSurveysRegion({
  data,
  isLoading,
  isError,
  onRetry,
  hasNextPage,
  isFetchingNextPage,
  isNextPageError,
  onLoadMore,
}: {
  data: AnswerableSurveysResponse['items'];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isNextPageError: boolean;
  onLoadMore: () => void;
}) {
  if (isLoading) {
    return <ParticipationListLoading testId="participation-answerable-loading" />;
  }
  if (isError) {
    return (
      <ListStateMessage
        variant="error"
        title={SURVEY_PARTICIPATION_COPY.answerableLoadError}
        action={{ label: SURVEY_PARTICIPATION_COPY.retry, onClick: onRetry }}
      />
    );
  }
  if (data.length === 0)
    return (
      <>
        <ListStateMessage variant="empty" title={SURVEY_PARTICIPATION_COPY.noAnswerableSurveys} />
        <SurveyParticipationLoadMore
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          isError={isNextPageError}
          onLoadMore={onLoadMore}
        />
      </>
    );

  return (
    <>
      <ul className="overflow-hidden rounded-md border border-border-subtle bg-surface-card">
        {data.map((survey) => (
          <li key={survey.survey_id} className="border-b border-border-subtle last:border-b-0">
            <div className="flex items-center gap-3 px-4 py-3">
              <HostLink
                to={`/surveys/${survey.survey_id}/respond`}
                className="min-w-0 flex-1 rounded-sm hover:bg-surface-row-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <span className="block text-sm font-medium text-text-primary">{survey.title}</span>
                <span className="mt-1 block text-xs text-text-muted">
                  {survey.display_id} · {SURVEY_TYPE_LABELS[survey.type]} ·{' '}
                  {SURVEY_PARTICIPATION_COPY.questionCount(survey.question_count)} ·{' '}
                  {formatDate(survey.opened_at)}
                </span>
              </HostLink>
              <Button asChild variant="primary" size="sm">
                <HostLink to={`/surveys/${survey.survey_id}/respond`}>
                  {SURVEY_PARTICIPATION_COPY.respond}
                </HostLink>
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <SurveyParticipationLoadMore
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        isError={isNextPageError}
        onLoadMore={onLoadMore}
      />
    </>
  );
}

function SurveyResponseHistoryRegion({
  data,
  isLoading,
  isError,
  onRetry,
  hasNextPage,
  isFetchingNextPage,
  isNextPageError,
  onLoadMore,
}: {
  data: MySurveyResponsesResponse['items'];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isNextPageError: boolean;
  onLoadMore: () => void;
}) {
  if (isLoading) {
    return <ParticipationListLoading testId="participation-history-loading" />;
  }
  if (isError) {
    return (
      <ListStateMessage
        variant="error"
        title={SURVEY_PARTICIPATION_COPY.responseHistoryLoadError}
        action={{ label: SURVEY_PARTICIPATION_COPY.retry, onClick: onRetry }}
      />
    );
  }
  if (data.length === 0)
    return (
      <>
        <ListStateMessage variant="empty" title={SURVEY_PARTICIPATION_COPY.noSurveyResponses} />
        <SurveyParticipationLoadMore
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          isError={isNextPageError}
          onLoadMore={onLoadMore}
        />
      </>
    );

  return (
    <>
      <ul className="overflow-hidden rounded-md border border-border-subtle bg-surface-card">
        {data.map((response) => (
          <li
            key={`${response.survey_id}-${response.submitted_at}`}
            className="border-b border-border-subtle px-4 py-3 last:border-b-0"
          >
            <span className="block text-sm font-medium text-text-primary">
              {response.survey_title}
            </span>
            <span className="mt-1 block text-xs text-text-muted">
              제출 {formatDate(response.submitted_at)}
            </span>
          </li>
        ))}
      </ul>
      <SurveyParticipationLoadMore
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        isError={isNextPageError}
        onLoadMore={onLoadMore}
      />
    </>
  );
}

function SurveyParticipationLoadMore({
  hasNextPage,
  isFetchingNextPage,
  isError,
  onLoadMore,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isError: boolean;
  onLoadMore: () => void;
}) {
  if (!hasNextPage) return null;
  return (
    <div className="flex flex-col items-center gap-2 pt-3">
      {isError && (
        <p className="text-sm text-accent-danger" role="alert">
          {SURVEY_PARTICIPATION_COPY.loadMoreError}
        </p>
      )}
      <Button variant="subtle" size="sm" disabled={isFetchingNextPage} onClick={onLoadMore}>
        {isFetchingNextPage
          ? SURVEY_PARTICIPATION_COPY.loadingMore
          : isError
            ? SURVEY_PARTICIPATION_COPY.retry
            : SURVEY_PARTICIPATION_COPY.loadMore}
      </Button>
    </div>
  );
}

function ParticipationListLoading({ testId }: { testId: string }) {
  return (
    <section
      aria-label={SURVEY_PARTICIPATION_COPY.loading}
      aria-live="polite"
      aria-busy="true"
      className="space-y-2"
      data-testid={testId}
    >
      <SkeletonRows count={2} size="regular" />
    </section>
  );
}

/** Mounts once on submit success: moves focus to the heading so the completion is announced and focus is not left on the removed submit button. */
function SubmitSuccess({ Heading }: { Heading: 'h1' | 'h2' }) {
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <section className="w-full max-w-xl pt-16 text-center" data-testid="survey-response-success">
      <output className="block">
        <Heading
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold text-text-primary outline-none"
        >
          {SURVEY_PARTICIPATION_COPY.submitted}
        </Heading>
      </output>
      <HostLink
        to="/surveys/participate"
        className="mt-5 inline-flex text-sm font-medium text-accent-primary underline"
      >
        {SURVEY_PARTICIPATION_COPY.backToParticipation}
      </HostLink>
    </section>
  );
}

export function RespondSurveyScreen({
  surveyId,
  variant = 'page',
}: { surveyId: string; variant?: Variant }) {
  const Heading = pageHeading(variant);
  const form = useSurveyRespondentForm(surveyId);
  const submit = useSubmitSurveyResponse(surveyId);
  const [answers, setAnswers] = React.useState<Record<string, RespondentAnswer>>({});
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [validationSummary, setValidationSummary] = React.useState<string | null>(null);

  const allQuestions = form.data?.questions ?? [];
  const visibleQuestions = getVisibleRespondentQuestions(allQuestions, answers);
  const builtSubmission = buildSurveyResponseSubmission(visibleQuestions, answers);
  const payloadToken = JSON.stringify(builtSubmission.body);
  const { key: idempotencyKey } = useIdempotencyKey(payloadToken);

  if (form.isPending) {
    return (
      <Frame variant={variant} layout="centered">
        <section
          aria-label={SURVEY_PARTICIPATION_COPY.loading}
          aria-live="polite"
          aria-busy="true"
          className="w-full max-w-xl pt-10"
        >
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="mt-6 h-28 w-full" />
        </section>
      </Frame>
    );
  }
  if (form.isError || !form.data) {
    if (
      form.error instanceof ApiError &&
      form.error.status === 409 &&
      (form.error.code === 'conflict.survey_not_open' ||
        form.error.code === 'conflict.survey_response_already_submitted')
    ) {
      return (
        <RespondentPageMessage
          variant={variant}
          message={errorMapper(form.error.envelope).message}
        />
      );
    }
    if (form.error instanceof ApiError && form.error.status === 404) {
      return (
        <Frame variant={variant} layout="centered">
          <div className="w-full max-w-xl pt-10">
            <EmptyState
              title={SURVEY_PARTICIPATION_COPY.notFoundTitle}
              body={SURVEY_PARTICIPATION_COPY.notFoundBody}
            />
          </div>
        </Frame>
      );
    }
    return (
      <Frame variant={variant} layout="centered">
        <div className="w-full max-w-xl pt-10">
          <ListStateMessage
            variant="error"
            title={SURVEY_PARTICIPATION_COPY.formLoadError}
            action={{
              label: SURVEY_PARTICIPATION_COPY.retry,
              onClick: () => void form.refetch(),
            }}
          />
        </div>
      </Frame>
    );
  }

  if (
    submit.error instanceof ApiError &&
    submit.error.status === 409 &&
    (submit.error.code === 'conflict.survey_not_open' ||
      submit.error.code === 'conflict.survey_response_already_submitted')
  ) {
    return (
      <RespondentPageMessage
        variant={variant}
        message={errorMapper(submit.error.envelope).message}
      />
    );
  }
  if (submit.isSuccess) {
    return (
      <Frame variant={variant} layout="centered">
        <SubmitSuccess Heading={Heading} />
      </Frame>
    );
  }

  const submitError = submit.isError
    ? submit.error instanceof ApiError && submit.error.status === 422
      ? errorMapper(submit.error.envelope).message
      : mapUnknownError(submit.error).message
    : null;
  const showSummary = submitError ?? validationSummary;

  return (
    <Frame variant={variant} layout="centered">
      <Landmark
        variant={variant}
        className="w-full max-w-xl py-8"
        data-testid="survey-respondent-page"
      >
        <section
          className="rounded-md border border-border-subtle bg-surface-card p-6"
          data-testid="survey-respondent-form"
        >
          <header>
            <Heading className="text-xl font-semibold tracking-tight text-text-primary">
              {form.data.survey.title}
            </Heading>
            {form.data.survey.description ? (
              <p className="mt-2 text-sm text-text-muted">{form.data.survey.description}</p>
            ) : null}
            <p className="mt-4 rounded bg-surface-detail p-3 text-sm text-text-secondary">
              {SURVEY_PARTICIPATION_COPY.anonymityNotice} ·{' '}
              {respondentIdentityNotice(form.data.survey.identity_protected)}
            </p>
          </header>
          <form
            className="mt-6 space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              const validation = buildSurveyResponseSubmission(visibleQuestions, answers);
              setFieldErrors(validation.errors);
              if (validation.body.answers.length === 0) {
                setValidationSummary(SURVEY_PARTICIPATION_COPY.noAnswers);
                return;
              }
              if (Object.keys(validation.errors).length > 0) {
                setValidationSummary(SURVEY_PARTICIPATION_COPY.validationSummary);
                return;
              }
              setValidationSummary(null);
              const body = surveyResponseSubmissionSchema.parse(validation.body);
              submit.mutate({ body, idempotencyKey });
            }}
          >
            {visibleQuestions.map((question) => (
              <div key={question.id}>
                <p
                  className="text-sm font-medium text-text-primary"
                  id={`respondent-question-label-${question.id}`}
                >
                  Q{question.sort_order + 1}. {question.prompt}
                  {question.is_required && ' *'}
                </p>
                <RespondentQuestion
                  question={question}
                  value={answers[question.id]}
                  onChange={(value) => {
                    setAnswers((current) => ({ ...current, [question.id]: value }));
                    setValidationSummary(null);
                    setFieldErrors((current) => {
                      const { [question.id]: _removed, ...rest } = current;
                      return rest;
                    });
                    if (submit.isError) submit.reset();
                  }}
                />
                {fieldErrors[question.id] !== undefined && (
                  <p className="mt-1 text-sm text-accent-danger" role="alert">
                    {fieldErrors[question.id]}
                  </p>
                )}
              </div>
            ))}
            {showSummary !== null && (
              <p className="text-sm text-accent-danger" role="alert">
                {showSummary}
              </p>
            )}
            <footer className="flex items-center justify-between gap-4 border-t border-border-subtle pt-4 text-xs text-text-muted">
              <span>
                {SURVEY_PARTICIPATION_COPY.questionCount(visibleQuestions.length)} ·{' '}
                {SURVEY_PARTICIPATION_COPY.responseCount(
                  countNonEmptyRespondentAnswers(visibleQuestions, answers),
                )}
              </span>
              <Button type="submit" disabled={submit.isPending}>
                {SURVEY_PARTICIPATION_COPY.submit}
              </Button>
            </footer>
          </form>
        </section>
      </Landmark>
    </Frame>
  );
}

function RespondentPageMessage({ message, variant }: { message: string; variant: Variant }) {
  return (
    <Frame variant={variant} layout="centered">
      <section className="w-full max-w-xl pt-16 text-center" role="alert">
        <p className="text-sm text-text-primary">{message}</p>
        <HostLink
          to="/surveys/participate"
          className="mt-5 inline-flex text-sm font-medium text-accent-primary underline"
        >
          {SURVEY_PARTICIPATION_COPY.backToParticipation}
        </HostLink>
      </section>
    </Frame>
  );
}

function buildSurveyResponseSubmission(
  questions: SurveyRespondentQuestion[],
  answers: Record<string, RespondentAnswer>,
): { body: SurveyResponseSubmission; errors: Record<string, string> } {
  const submitted: SurveyResponseSubmission['answers'] = [];
  const errors: Record<string, string> = {};

  for (const question of questions) {
    const value = answers[question.id];
    if (!hasRespondentAnswer(question, value)) {
      if (question.is_required) errors[question.id] = SURVEY_PARTICIPATION_COPY.requiredAnswer;
      continue;
    }

    if (question.kind === 'text') {
      const text = (value as string).trim();
      if (Array.from(text).length > 4000) {
        errors[question.id] = SURVEY_PARTICIPATION_COPY.textTooLong;
        continue;
      }
      submitted.push({ question_id: question.id, value: text });
      continue;
    }
    if (question.kind === 'single_choice') {
      if (typeof value !== 'string' || !question.options?.some((option) => option.key === value)) {
        errors[question.id] = SURVEY_PARTICIPATION_COPY.invalidAnswer;
        continue;
      }
      submitted.push({ question_id: question.id, value });
      continue;
    }
    if (question.kind === 'multiple_choice') {
      if (
        !Array.isArray(value) ||
        value.length === 0 ||
        new Set(value).size !== value.length ||
        value.some((key) => !question.options?.some((option) => option.key === key))
      ) {
        errors[question.id] = SURVEY_PARTICIPATION_COPY.invalidAnswer;
        continue;
      }
      submitted.push({ question_id: question.id, value });
      continue;
    }

    const minimum = question.rating_min ?? 1;
    const maximum = question.rating_max ?? 5;
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < minimum ||
      value > maximum
    ) {
      errors[question.id] = SURVEY_PARTICIPATION_COPY.invalidAnswer;
      continue;
    }
    submitted.push({ question_id: question.id, value });
  }

  return { body: { answers: submitted }, errors };
}

function hasRespondentAnswer(
  question: SurveyRespondentQuestion,
  value: RespondentAnswer | undefined,
) {
  if (value === undefined) return false;
  if (question.kind === 'text') return typeof value === 'string' && value.trim().length > 0;
  if (question.kind === 'multiple_choice') return Array.isArray(value) && value.length > 0;
  if (question.kind === 'single_choice') return typeof value === 'string' && value.length > 0;
  return typeof value === 'number';
}
