// SurveyDetailParts — the Survey detail as the parts a host frames itself (`DetailParts`).
// States: loading skeleton → not-found → permission-blocked → error → full detail.
// `SurveyDetail` (the standalone aside) frames the same pieces; the platform bridge draws the parts in its own drawer.

import { useSurvey } from '@/features/surveys/hooks/useSurveys';
import { useSurveyManageGate } from '@/features/surveys/routes/SurveyPermissionGate';
import { SURVEY_TYPE_LABELS } from '@/lib/copy/enum-labels';
import { GLOSSARY } from '@/lib/copy/glossary';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { SURVEY_PARTICIPATION_COPY } from '@/lib/copy/survey-participation';
import { useManagedSystemNamesResult } from '@/lib/cross-system/useManagedSystemNames';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import type { DetailParts } from '@/lib/host/detail-parts';
import { formatRecordDocumentTitle } from '@/lib/host/document-title-format';
import { HostLink, useHostSeam, useHostTitle } from '@/lib/host/host-seam';
import { Button, EmptyState, PermissionBlockedPanel, SkeletonBlocks } from '@ap/ui';
import { ArrowRight } from 'lucide-react';
import * as React from 'react';
import { useCloseSurvey } from '../../hooks/useSurveys';
import type { Survey } from '../../types';
import { SurveyManagedSystemPill } from '../SurveyManagedSystemPill';
import { SurveyStatusBadge } from '../SurveyStatusBadge';
import { SurveyStatusConfirmationDialog } from '../SurveyStatusConfirmationDialog';

export type SurveyDetailView =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'blocked' }
  | { kind: 'error' }
  | { kind: 'full'; survey: Survey };

/** Nothing in the Survey detail asks before closing the panel (the close-survey dialog is a confirmation, not a draft), so no `requestClose`. */
export type SurveyDetailParts = DetailParts & { view: SurveyDetailView };

export interface UseSurveyDetailPartsArgs {
  surveyId: string;
  /** What the not-found body's `Survey 목록으로` button does: the host decides where "back" is. */
  onClose: () => void;
}

type NamesById = ReadonlyMap<string, string> | undefined;

/** The close-survey confirmation state; one per detail so the action and its dialog share it. */
export function useSurveyClosing(surveyId: string) {
  const [open, setOpen] = React.useState(false);
  const mutation = useCloseSurvey(surveyId);
  return { open, setOpen, mutation };
}
type SurveyClosing = ReturnType<typeof useSurveyClosing>;

/** The Managed System and operator name lookups the detail (and the list) resolve; `undefined` until resolved. */
export function useSurveyDetailNames(options?: { enabled?: boolean }): {
  managedSystemNamesById: NamesById;
  actorNamesById: NamesById;
} {
  const managedSystemNames = useManagedSystemNamesResult(options);
  const managedSystemNamesById = managedSystemNames.isSuccess
    ? managedSystemNames.namesById
    : undefined;
  const actorsQuery = useWorkspaceActors(options);
  const actorNamesById = React.useMemo(
    () =>
      actorsQuery.isSuccess
        ? new Map((actorsQuery.actors ?? []).map((actor) => [actor.id, actor.display_name]))
        : undefined,
    [actorsQuery.actors, actorsQuery.isSuccess],
  );
  return { managedSystemNamesById, actorNamesById };
}

/** The named pieces of a loaded Survey detail, in the order the standalone aside lays them out. */
export function surveyDetailPieces({
  survey,
  canManage,
  canLink,
  closing,
  managedSystemNamesById,
  actorNamesById,
}: {
  survey: Survey;
  canManage: boolean;
  canLink: (to: string) => boolean;
  closing: SurveyClosing;
  managedSystemNamesById: NamesById;
  actorNamesById: NamesById;
}) {
  const questions = survey.questions ?? [];
  const operatorName = survey.operator_actor_id
    ? actorNamesById === undefined
      ? '—'
      : (actorNamesById.get(survey.operator_actor_id) ?? GLOSSARY.unknownUser)
    : '담당자 미지정';
  const canEditQuestions = canManage && survey.status === 'draft';
  const builderHref = `/surveys/${survey.id}?builder=true`;
  const resultsHref = `/surveys/${survey.id}/results`;
  const builderAction =
    canEditQuestions && canLink(builderHref) ? (
      <Button asChild variant="primary" size="sm">
        <HostLink to={builderHref}>{SURVEY_PARTICIPATION_COPY.editQuestions}</HostLink>
      </Button>
    ) : undefined;

  const badges = (
    <>
      <SurveyStatusBadge status={survey.status} />
      <span className="inline-flex items-center rounded border border-border-subtle px-1.5 py-0.5 text-xs text-text-secondary">
        {SURVEY_TYPE_LABELS[survey.type]}
      </span>
      <SurveyManagedSystemPill
        name={managedSystemNamesById?.get(survey.primary_managed_system_id)}
        resolved={managedSystemNamesById !== undefined}
      />
    </>
  );
  const operatorLine = <p className="px-5 text-xs text-text-muted">담당자 · {operatorName}</p>;
  const intro = (
    <>
      <p className="mt-2 px-5 text-sm text-text-muted">
        {survey.description || '설명이 없습니다.'}
      </p>
      {canManage && survey.status === 'open' && (
        <div className="mt-3 px-5">
          <Button variant="secondary" size="sm" onClick={() => closing.setOpen(true)}>
            Survey 종료
          </Button>
        </div>
      )}
    </>
  );
  const sections = (
    <>
      <section className="mt-6 px-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">결과 요약</h2>
          {(survey.status === 'open' || survey.status === 'closed') && canLink(resultsHref) && (
            <Button asChild variant="subtle" size="sm">
              <HostLink to={resultsHref}>
                <ArrowRight className="h-4 w-4" aria-hidden />
                결과 요약 보기
              </HostLink>
            </Button>
          )}
        </div>
        <p className="rounded bg-surface-canvas p-3 text-sm text-text-muted">
          응답이 수집되면 요약과 패턴이 여기에 표시됩니다.
        </p>
      </section>
      {!canEditQuestions && (
        <section className="mt-6 px-5">
          <h2 className="mb-2 text-sm font-medium">Survey 빌더</h2>
          <p className="text-xs text-text-muted">
            {survey.status === 'draft'
              ? 'Survey 관리 권한이 없습니다.'
              : '질문 변경은 잠겨 있습니다.'}
          </p>
        </section>
      )}
      <section className="mt-6 px-5">
        <h2 className="mb-2 text-sm font-medium">질문</h2>
        {questions.length ? (
          <ol className="space-y-2">
            {questions.map((question, index) => (
              <li key={question.id} className="text-sm text-text-secondary">
                Q{index + 1}. {question.prompt}
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            size="sm"
            title="질문이 없습니다."
            {...(canEditQuestions && canLink(builderHref)
              ? {
                  action: (
                    <Button asChild size="sm">
                      <HostLink to={builderHref}>
                        {SURVEY_PARTICIPATION_COPY.addFirstQuestion}
                      </HostLink>
                    </Button>
                  ),
                }
              : {})}
          />
        )}
      </section>
      <section className="mt-6 space-y-3 px-5 pb-5 text-sm">
        <div>
          <h2 className="font-medium">권한 경계</h2>
          <p className="text-text-muted">Survey 응답은 VOC를 생성하지 않습니다.</p>
        </div>
        <div>
          <h2 className="font-medium">개인정보</h2>
          <p className="text-text-muted">
            {survey.responses_identity_protected
              ? '응답은 익명으로 처리됩니다.'
              : '응답자 식별 정책을 확인하세요.'}
          </p>
        </div>
      </section>
    </>
  );
  const dialog = (
    <SurveyStatusConfirmationDialog
      open={closing.open}
      target="close"
      isPending={closing.mutation.isPending}
      error={closing.mutation.error}
      onClose={() => closing.setOpen(false)}
      onConfirm={() =>
        closing.mutation.mutate(undefined, {
          onSuccess: () => closing.setOpen(false),
        })
      }
    />
  );
  return { badges, operatorLine, intro, sections, dialog, builderAction };
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

function SurveyDetailSkeleton(): React.ReactElement {
  return (
    <div className="flex flex-col gap-4 p-6" aria-label="Survey 상세 불러오는 중">
      <SkeletonBlocks
        blocks={[
          { kind: 'title', size: 'large', width: 'half' },
          { kind: 'line', width: 'full' },
          { kind: 'line', width: 'three-quarters' },
        ]}
      />
      <div className="flex gap-2">
        <SkeletonBlocks
          blocks={[
            { kind: 'badge', width: 'standard' },
            { kind: 'badge', width: 'standard' },
          ]}
        />
      </div>
      <SkeletonBlocks
        blocks={[
          { kind: 'body', size: 'large', width: 'full' },
          { kind: 'line', width: 'third' },
        ]}
      />
    </div>
  );
}

// ── Not found ────────────────────────────────────────────────────────────────

function SurveyNotFound({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <EmptyState
      title="Survey를 찾을 수 없습니다."
      body="삭제되었거나 접근 권한이 없습니다."
      action={
        <Button variant="outline" size="sm" onClick={onClose}>
          Survey 목록으로
        </Button>
      }
      padding="wide"
    />
  );
}

type SurveyDetailErrorState = 'not-found' | 'blocked' | 'error';

function classifySurveyDetailError(error: unknown): SurveyDetailErrorState {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'not_found.record') return 'not-found';
  if (code === 'permission.denied') return 'blocked';
  return 'error';
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * The Survey detail as `DetailParts`. Needs a `HostSeamProvider` (links, notices, title) and the FeedbackOps providers.
 */
export function useSurveyDetailParts({
  surveyId,
  onClose,
}: UseSurveyDetailPartsArgs): SurveyDetailParts {
  const { canLink } = useHostSeam();
  const { data, isLoading, isError, isSuccess, isFetching, error } = useSurvey(surveyId);
  const gate = useSurveyManageGate(data?.primary_managed_system_id);
  const { managedSystemNamesById, actorNamesById } = useSurveyDetailNames();
  const closing = useSurveyClosing(surveyId);
  useHostTitle(
    isSuccess && !isFetching && data?.id === surveyId
      ? formatRecordDocumentTitle({ displayId: data.display_id, title: data.title })
      : null,
  );

  const frame = (view: SurveyDetailView, body: React.ReactNode): SurveyDetailParts => ({
    title: 'Survey',
    view,
    body,
  });

  // 1. Loading
  if (isLoading) {
    return frame(
      { kind: 'loading' },
      <div className="h-full overflow-y-auto">
        <SurveyDetailSkeleton />
      </div>,
    );
  }

  // 2. Error
  if (isError) {
    const errorState = classifySurveyDetailError(error);
    if (errorState === 'not-found') {
      return frame({ kind: 'not-found' }, <SurveyNotFound onClose={onClose} />);
    }
    // permission.denied → survey read blocked
    if (errorState === 'blocked') {
      return frame(
        { kind: 'blocked' },
        <div className="flex h-full items-center justify-center p-6">
          <PermissionBlockedPanel
            state="denied"
            category="Survey 상세"
            reason={PERMISSION_BLOCKED_REASONS.surveyDetail}
          />
        </div>,
      );
    }
    return frame(
      { kind: 'error' },
      <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm text-text-danger">데이터를 불러오지 못했습니다.</p>
      </div>,
    );
  }

  if (!data) return frame({ kind: 'not-found' }, <SurveyNotFound onClose={onClose} />);

  // 3. Full detail. Independent of the document-title release above: a refetch must not blank the drawer's title.
  const pieces = surveyDetailPieces({
    survey: data,
    canManage: gate.canManage,
    canLink,
    closing,
    managedSystemNamesById,
    actorNamesById,
  });
  return {
    title:
      formatRecordDocumentTitle({ displayId: data.display_id, title: data.title }) ??
      data.display_id,
    subtitle: (
      <>
        <div className="flex flex-wrap items-center gap-2">{pieces.badges}</div>
        {pieces.operatorLine}
      </>
    ),
    ...(pieces.builderAction !== undefined ? { headerActions: pieces.builderAction } : {}),
    view: { kind: 'full', survey: data },
    body: (
      <div className="h-full overflow-y-auto">
        {pieces.intro}
        {pieces.sections}
        {pieces.dialog}
      </div>
    ),
  };
}
