import { RequestAccessButton } from '@/features/admin/public';
import { errorMapper } from '@/lib/api/errorMapper';
import { ApiError } from '@/lib/api/types';
import { useIdempotencyKey } from '@/lib/api/useIdempotencyKey';
import { SURVEY_QUESTION_KIND_LABELS } from '@/lib/copy/enum-labels';
import { formatShortDate } from '@/lib/format/datetime';
import type { ClosableDetailParts } from '@/lib/host/detail-parts';
import { HostLink, useHostHere, useHostNotice, useHostSeam } from '@/lib/host/host-seam';
import {
  Button,
  DetailPanelHeader,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ListShell,
  Textarea,
} from '@ap/ui';
import type { OutcomeFollowUpItem, OutcomeFollowUpReadDto, SurveyResultDto } from '@fops/shared';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  invalidateOutcomeFollowUpAfterConflict,
  useMarkOutcomeFollowUpNoAction,
  useReopenOutcomeFollowUp,
} from '../../hooks/useOutcomeFollowUp';
import type { Survey } from '../../types';
import { CreateFindingDraftPanel, excerptsByResponse } from './CreateFindingDraftPanel';
import { SurveyResultHeader } from './SurveyResultHeader';

type ResolutionFilter = OutcomeFollowUpItem['resolution'];
type DecisionAction = 'mark' | 'reopen';

const NOT_CLASSIFIABLE_BODY =
  '후속 검토는 마감된 성과 Survey 중 충분한 응답이 모인 경우에만 제공됩니다.';

function displayResponseNumber(value: number): string {
  // Option B pads single-digit response numbers in both the list and detail header.
  return String(value).padStart(2, '0');
}

const FILTER_LABELS: Record<ResolutionFilter, string> = {
  open: '미해소',
  finding: '해소됨',
  no_follow_up: '후속 없음',
};

function resolutionLabel(item: OutcomeFollowUpItem): string {
  if (item.resolution === 'open') return '미해소';
  // Option B shows the populated Finding display ID alone in list rows.
  if (item.resolution === 'finding') return item.finding?.display_id ?? 'Finding';
  return '후속 없음';
}

function lowAnswerSummary(item: OutcomeFollowUpItem): string {
  return item.low_answers
    .map((answer) => `${answer.question_label} ${answer.value} / ${answer.rating_max}`)
    .join(' · ');
}

function submittedDate(value: string): string {
  return `${formatShortDate(value)} 제출`;
}

function currentStateText(item: OutcomeFollowUpItem): string {
  if (item.resolution === 'open') return '미해소 — Finding 없음, 후속 없음 결정 없음';
  if (item.resolution === 'finding')
    return `해소됨 — ${item.finding?.display_id ? `Finding ${item.finding.display_id}` : 'Finding'}`;
  return '후속 없음';
}

function DecisionReasonDialog({
  action,
  onClose,
  onSubmit,
  pending,
  reason,
  setReason,
}: {
  action: DecisionAction | null;
  onClose: () => void;
  onSubmit: () => void;
  pending: boolean;
  reason: string;
  setReason: (value: string) => void;
}) {
  const trimmedReason = reason.trim();
  const title = action === 'reopen' ? '후속 조치 다시 열기' : '후속 조치 없음 기록';
  return (
    <Dialog open={action !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid={`follow-up-${action ?? 'decision'}-dialog`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>결정 사유를 입력해 주세요.</DialogDescription>
        </DialogHeader>
        <label
          className="space-y-2 text-sm text-text-secondary"
          htmlFor="follow-up-decision-reason"
        >
          <span>사유</span>
          <Textarea
            aria-invalid={reason.length > 2000 || (reason.length > 0 && trimmedReason.length === 0)}
            data-testid="follow-up-decision-reason"
            id="follow-up-decision-reason"
            maxLength={2000}
            onChange={(event) => setReason(event.target.value)}
            required
            value={reason}
          />
        </label>
        <DialogFooter spacing="compact">
          <Button onClick={onClose} type="button" variant="secondary">
            취소
          </Button>
          <Button
            disabled={trimmedReason.length === 0 || trimmedReason.length > 2000}
            loading={pending}
            onClick={onSubmit}
            type="button"
            variant="primary"
          >
            {action === 'reopen' ? '다시 열기' : '후속 조치 없음'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The selection a host owns (the platform page key); absent = the review keeps it in component state and auto-selects. */
export type OutcomeFollowUpSelection = {
  selectedId: string | null;
  onSelect(id: string | null): void;
};

/** Frames the detail parts as the standalone aside; the bridge frames the same parts in its own drawer. */
function renderStandaloneAside(parts: ClosableDetailParts): ReactNode {
  return (
    <aside
      className="flex h-full min-h-0 flex-col bg-surface-detail"
      data-testid="follow-up-detail-panel"
    >
      <DetailPanelHeader kind="survey" id={String(parts.title)} onClose={parts.requestClose} />
      {parts.body}
    </aside>
  );
}

function OutcomeFollowUpDetail({
  item,
  survey,
  results,
  resultsError,
  resultsLoading,
  onClose,
  setDecisionNotice,
  renderDetail,
}: {
  item: OutcomeFollowUpItem;
  survey: Survey;
  results?: SurveyResultDto | undefined;
  resultsError: boolean;
  resultsLoading: boolean;
  onClose: (responseId: string) => void;
  setDecisionNotice: (notice: string | null) => void;
  renderDetail: (parts: ClosableDetailParts) => ReactNode;
}) {
  const { notify } = useHostNotice();
  const here = useHostHere();
  const queryClient = useQueryClient();
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();
  const mark = useMarkOutcomeFollowUpNoAction(survey.id);
  const reopen = useReopenOutcomeFollowUp(survey.id);
  const [draftOpen, setDraftOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<DecisionAction | null>(null);
  const [reason, setReason] = useState('');
  const responseExcerpts = results
    ? (excerptsByResponse(results).find((group) => group[0]?.response_id === item.response_id) ??
      [])
    : [];
  const actions = item.next_actions;

  async function submitDecision() {
    const trimmedReason = reason.trim();
    if (!dialogAction || trimmedReason.length === 0 || trimmedReason.length > 2000) return;
    const submittedResponseId = item.response_id;
    setDecisionNotice(null);
    try {
      const request = {
        responseId: submittedResponseId,
        reason: trimmedReason,
        idempotencyKey,
      };
      if (dialogAction === 'mark') await mark.mutateAsync(request);
      else await reopen.mutateAsync(request);
      markConsumed();
      setDialogAction(null);
      setReason('');
      notify({
        tone: 'success',
        message:
          dialogAction === 'mark'
            ? '후속 조치 없음으로 기록했습니다.'
            : '후속 조치를 다시 열었습니다.',
      });
      onClose(submittedResponseId);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const failureCode = error.detail?.failure_code;
        if (error.code === 'conflict.idempotency_key_reuse') {
          setDecisionNotice('요청 키가 만료되었습니다. 다시 시도해 주세요.');
        } else if (failureCode === 'action_no_longer_available') {
          setDecisionNotice('이 응답은 더 이상 후속 조치 대상이 아닙니다.');
        } else if (failureCode === 'recovery_item_resolved') {
          setDecisionNotice('이미 처리된 응답입니다.');
        } else {
          setDecisionNotice(errorMapper(error.envelope).message);
        }
        markConsumed();
        await invalidateOutcomeFollowUpAfterConflict(queryClient, survey.id);
      } else if (error instanceof ApiError) {
        setDecisionNotice(errorMapper(error.envelope).message);
        markConsumed();
      } else {
        setDecisionNotice('요청을 처리하지 못했습니다.');
      }
    }
  }

  const excerptsUnavailable = responseExcerpts.length === 0;
  const dialogPending = mark.isPending || reopen.isPending;

  const body = (
    <>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        <h2 className="text-base font-semibold text-text-primary">후속 조치 필요</h2>
        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted">
            저조 판정 근거
          </h3>
          <ul className="space-y-1 text-sm leading-relaxed text-text-primary">
            {item.low_answers.map((answer) => (
              <li key={answer.question_id}>
                {answer.question_label} {answer.value} / {answer.rating_max} (하위 구간)
              </li>
            ))}
          </ul>
        </section>
        {responseExcerpts.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted">
              승인된 발췌
            </h3>
            <ul className="space-y-2">
              {responseExcerpts.map((excerpt) => (
                <li
                  className={[
                    'rounded border border-border-subtle bg-surface-card px-3 py-2',
                    'text-sm leading-relaxed text-text-secondary',
                  ].join(' ')}
                  key={excerpt.id}
                >
                  “{excerpt.text}”
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted">현재 상태</h3>
          <p className="text-sm text-text-primary">{currentStateText(item)}</p>
          {item.decision && (
            <p className="text-sm text-text-secondary">
              {item.decision.state === 'no_follow_up' ? '후속 없음 결정 사유' : '다시 열기 사유'}:{' '}
              {item.decision.reason}
            </p>
          )}
        </section>
      </div>
      <footer className="flex flex-wrap gap-2 border-t border-border-subtle p-4">
        {actions.map((action) => {
          if (action.availability === 'blocked_requestable') {
            return action.requestable_permission ? (
              <RequestAccessButton
                capability={action.requestable_permission.permission}
                key={action.id}
                managedSystemId={action.requestable_permission.managed_system_id}
                returnRouteIntent={here}
              />
            ) : (
              <div className="space-y-1" key={action.id}>
                <Button disabled type="button" variant="secondary">
                  권한 요청
                </Button>
                <p className="text-sm text-text-muted">
                  접근 정보를 확인할 수 없어 요청을 제출할 수 없습니다.
                </p>
              </div>
            );
          }
          if (action.id === 'create_finding') {
            return (
              <div className="space-y-1" key={action.id}>
                <Button
                  disabled={resultsLoading || resultsError || excerptsUnavailable}
                  onClick={() => {
                    setDecisionNotice(null);
                    setDraftOpen(true);
                  }}
                  type="button"
                  variant="primary"
                >
                  Finding 생성
                </Button>
                {resultsLoading ? (
                  <p className="text-sm text-text-muted">승인된 발췌를 불러오는 중…</p>
                ) : resultsError ? (
                  <p className="text-sm text-text-danger" role="alert">
                    승인된 발췌를 불러오지 못했습니다.
                  </p>
                ) : excerptsUnavailable ? (
                  <p className="text-sm text-text-muted">
                    접근 가능한 응답에 승인된 발췌가 없습니다.
                  </p>
                ) : null}
                {draftOpen && (
                  <CreateFindingDraftPanel
                    groups={responseExcerpts.length > 0 ? [responseExcerpts] : []}
                    onCreated={(finding, responseId) => {
                      notify({
                        tone: 'success',
                        message: `Finding 생성 완료: ${finding.display_id}`,
                      });
                      setDecisionNotice(null);
                      onClose(responseId);
                    }}
                    scopedResponseId={item.response_id}
                    surveyId={survey.id}
                  />
                )}
              </div>
            );
          }
          if (action.id === 'mark_no_follow_up') {
            return (
              <Button
                key={action.id}
                onClick={() => {
                  setReason('');
                  setDecisionNotice(null);
                  setDialogAction('mark');
                }}
                type="button"
                variant="secondary"
              >
                후속 조치 없음…
              </Button>
            );
          }
          return (
            <Button
              key={action.id}
              onClick={() => {
                setReason('');
                setDecisionNotice(null);
                setDialogAction('reopen');
              }}
              type="button"
              variant="secondary"
            >
              다시 열기…
            </Button>
          );
        })}
      </footer>
      <DecisionReasonDialog
        action={dialogAction}
        onClose={() => {
          setDialogAction(null);
          setDecisionNotice(null);
        }}
        onSubmit={() => void submitDecision()}
        pending={dialogPending}
        reason={reason}
        setReason={setReason}
      />
    </>
  );

  return renderDetail({
    title: `응답 #${displayResponseNumber(item.response_number)}`,
    body,
    requestClose: () => onClose(item.response_id),
  });
}

function EmptyReviewPage({
  survey,
  title,
  body,
  followUpRead,
  notice,
}: {
  survey: Survey;
  title: string;
  body: string;
  followUpRead?: OutcomeFollowUpReadDto | null | undefined;
  notice: string | null;
}) {
  const { canLink } = useHostSeam();
  const resultsHref = `/surveys/${survey.id}/results`;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SurveyResultHeader activeTab="follow-up" followUpRead={followUpRead} survey={survey} />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center p-6">
        {notice && <DecisionNotice message={notice} />}
        <EmptyState body={body} title={title} />
        {canLink(resultsHref) && (
          <HostLink
            className="mt-3 text-sm font-medium text-accent-primary underline-offset-2 hover:underline"
            to={resultsHref}
          >
            결과로 돌아가기
          </HostLink>
        )}
      </div>
    </div>
  );
}

function DecisionNotice({ message }: { message: string }) {
  return (
    <p
      className="mb-3 rounded-md border border-accent-danger/30 bg-surface-card p-3 text-sm text-text-danger"
      data-testid="follow-up-decision-notice"
      role="alert"
    >
      {message}
    </p>
  );
}

export function SurveyFollowUpUnavailable({ survey }: { survey: Survey }) {
  return (
    <EmptyReviewPage
      body={NOT_CLASSIFIABLE_BODY}
      notice={null}
      survey={survey}
      title="후속 검토를 사용할 수 없습니다."
    />
  );
}

export function OutcomeFollowUpReview({
  survey,
  followUpRead,
  results,
  resultsError = false,
  resultsLoading = false,
  selection,
  renderDetail,
}: {
  survey: Survey;
  followUpRead: OutcomeFollowUpReadDto;
  results?: SurveyResultDto | undefined;
  resultsError?: boolean;
  resultsLoading?: boolean;
  /** Controlled mode (the platform page key): nothing auto-selects, every change goes through `onSelect`. */
  selection?: OutcomeFollowUpSelection | undefined;
  renderDetail?: ((parts: ClosableDetailParts) => ReactNode) | undefined;
}) {
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(
    followUpRead.personal_access
      ? (followUpRead.items.find((item) => item.resolution === 'open')?.response_id ?? null)
      : null,
  );
  const controlled = selection !== undefined;
  const selectedResponseId = controlled ? selection.selectedId : localSelectedId;
  const onSelect = selection?.onSelect;
  const setSelectedResponseId = (id: string | null) => {
    if (onSelect) onSelect(id);
    else setLocalSelectedId(id);
  };
  // The latest selection, so a decision that finishes after the user moved on does not clear the new one.
  const latestSelectedId = useRef(selectedResponseId);
  useEffect(() => {
    latestSelectedId.current = selectedResponseId;
  });
  // The survey this review currently serves; null once it unmounts, so a decision that finishes
  // afterwards cannot call the host's selection callback of a review that no longer exists.
  const liveSurveyId = useRef<string | null>(null);
  useEffect(() => {
    liveSurveyId.current = survey.id;
    return () => {
      liveSurveyId.current = null;
    };
  }, [survey.id]);
  // A deep-linked selection opens on its own filter; otherwise the default is the open list.
  const [activeFilter, setActiveFilter] = useState<ResolutionFilter>(
    (followUpRead.personal_access
      ? followUpRead.items.find((item) => item.response_id === selectedResponseId)?.resolution
      : undefined) ?? 'open',
  );
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);
  const allItems = followUpRead.personal_access ? followUpRead.items : [];
  // Controlled (bridge): a focus that changed from outside (history Back/Forward) and names a response of another filter moves the review to that filter, so it is
  // not dropped as stale below. A filter switch by the user leaves the focus as it was, so it never flips the filter back; an id absent from the list changes nothing.
  const [seenSelectedId, setSeenSelectedId] = useState(selectedResponseId);
  if (controlled && seenSelectedId !== selectedResponseId) {
    setSeenSelectedId(selectedResponseId);
    const restoredFilter = allItems.find(
      (item) => item.response_id === selectedResponseId,
    )?.resolution;
    if (restoredFilter !== undefined && restoredFilter !== activeFilter)
      setActiveFilter(restoredFilter);
  }
  const visibleItems = allItems.filter((item) => item.resolution === activeFilter);

  useEffect(() => {
    if (
      selectedResponseId &&
      !visibleItems.some((item) => item.response_id === selectedResponseId)
    ) {
      if (onSelect) onSelect(null);
      else setLocalSelectedId(null);
    }
  }, [selectedResponseId, visibleItems, onSelect]);

  if (!followUpRead.personal_access) {
    return (
      <EmptyReviewPage
        body="개인 응답 열람 권한이 있어야 응답별로 검토할 수 있습니다."
        followUpRead={followUpRead}
        notice={decisionNotice}
        survey={survey}
        title="개인 응답 열람 권한이 필요합니다."
      />
    );
  }
  if (!followUpRead.classifiable) {
    return (
      <EmptyReviewPage
        body={NOT_CLASSIFIABLE_BODY}
        followUpRead={followUpRead}
        notice={decisionNotice}
        survey={survey}
        title="후속 검토를 사용할 수 없습니다."
      />
    );
  }

  const selectedItem = selectedResponseId
    ? visibleItems.find((item) => item.response_id === selectedResponseId)
    : undefined;

  function selectFilter(nextFilter: ResolutionFilter) {
    setActiveFilter(nextFilter);
    // Controlled (bridge): a filter switch clears the selection, nothing auto-selects.
    setSelectedResponseId(
      controlled
        ? null
        : (allItems.find((item) => item.resolution === nextFilter)?.response_id ?? null),
    );
  }

  const detail = (frame: (parts: ClosableDetailParts) => ReactNode) =>
    selectedItem ? (
      <OutcomeFollowUpDetail
        item={selectedItem}
        key={selectedItem.response_id}
        onClose={(responseId) => {
          if (liveSurveyId.current !== survey.id) return;
          if (latestSelectedId.current === responseId) setSelectedResponseId(null);
        }}
        renderDetail={frame}
        setDecisionNotice={setDecisionNotice}
        resultsError={resultsError}
        resultsLoading={resultsLoading}
        results={results}
        survey={survey}
      />
    ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="survey-follow-up-review">
      <SurveyResultHeader activeTab="follow-up" followUpRead={followUpRead} survey={survey} />
      <ListShell
        className="flex-1"
        list={
          <div className="min-h-full">
            {visibleItems.map((item) => (
              <button
                aria-pressed={selectedResponseId === item.response_id}
                className={[
                  'grid w-full grid-cols-[96px_minmax(0,1fr)_110px_110px] items-center gap-3',
                  'border-b border-border-subtle',
                  'px-5 py-3 text-left text-sm hover:bg-surface-card',
                  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring',
                  selectedResponseId === item.response_id
                    ? 'border-l-2 border-l-border-selected bg-surface-card'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-testid={`follow-up-row-${item.response_number}`}
                key={item.response_id}
                onClick={() => {
                  setDecisionNotice(null);
                  setSelectedResponseId(item.response_id);
                }}
                type="button"
              >
                <span className="font-mono text-text-secondary">
                  응답 #{displayResponseNumber(item.response_number)}
                </span>
                <span className="truncate text-text-primary">{lowAnswerSummary(item)}</span>
                {/* #750: open rows use the AA amber pair because their default background is canvas. */}
                <span
                  className={
                    item.resolution === 'open' ? 'text-text-warning-label' : 'text-text-secondary'
                  }
                >
                  {resolutionLabel(item)}
                </span>
                <span className="text-text-muted">{submittedDate(item.submitted_at)}</span>
              </button>
            ))}
            {visibleItems.length === 0 && (
              <EmptyState
                {...(activeFilter === 'open' ? { body: '현재 검토할 후속 조치가 없습니다.' } : {})}
                className="px-4"
                size="sm"
                title={
                  allItems.length === 0
                    ? '저조한 응답이 없습니다.'
                    : `${FILTER_LABELS[activeFilter]} 항목이 없습니다.`
                }
              />
            )}
          </div>
        }
        tabs={
          <div className="flex w-full items-center gap-2 overflow-x-auto">
            {(['open', 'finding', 'no_follow_up'] as const).map((filter) => {
              const count = allItems.filter((item) => item.resolution === filter).length;
              const selected = activeFilter === filter;
              return (
                <button
                  aria-pressed={selected}
                  className={[
                    'inline-flex h-8 shrink-0 items-center rounded-full px-3 text-xs font-medium',
                    selected
                      ? 'bg-accent-primary/10 text-accent-primary'
                      : [
                          'border border-border-subtle text-text-muted',
                          'hover:bg-surface-raised hover:text-text-primary',
                        ].join(' '),
                  ].join(' ')}
                  key={filter}
                  onClick={() => {
                    setDecisionNotice(null);
                    selectFilter(filter);
                  }}
                  type="button"
                >
                  {FILTER_LABELS[filter]} {count}
                </button>
              );
            })}
            <span className="ml-auto hidden whitespace-nowrap text-xs text-text-muted lg:inline">
              저조 = {SURVEY_QUESTION_KIND_LABELS.rating} 문항 하위 구간 · 마감 · 공개 기준 이상
              응답
            </span>
          </div>
        }
        detailPanel={selectedItem && !renderDetail ? detail(renderStandaloneAside) : null}
      />
      {/* A host that frames the parts itself (the bridge drawer) gets them in place, not through the standalone detail slot. */}
      {selectedItem && renderDetail ? detail(renderDetail) : null}
      {decisionNotice && <DecisionNotice message={decisionNotice} />}
      {resultsError && (
        <output className="sr-only">
          승인된 발췌를 불러오지 못했습니다. Finding 생성을 사용할 수 없습니다.
        </output>
      )}
    </div>
  );
}
