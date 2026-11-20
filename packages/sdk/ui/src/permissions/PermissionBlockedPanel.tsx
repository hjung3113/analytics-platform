import * as React from 'react';
import { Ban, CheckCircle2, Eye, Lock, XCircle } from 'lucide-react';
import { cn } from '../utils/cn.js';
import { Button } from '../components/Button.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { NestedTextBlock } from '../panel/NestedTextBlock.js';

export type PermissionState =
  | 'request_access'
  | 'summary_visible'
  | 'denied'
  | 'blocked_not_requestable';

export interface PermissionBlockedPanelProps {
  state: PermissionState;
  /** Opt into the centered request card. The default is the original panel. */
  layout?: 'panel' | 'card';
  headingLevel?: 2 | 3 | 4;
  /** Announce the card's body without putting its actions in the live region. */
  announceBody?: boolean;
  /** Category label, e.g. 'VOC 상세' or 'Linked Finding' */
  category: string;
  /** Domain-safe reason for the blocked state. */
  reason?: string;
  /** Optional state-specific copy when a permission boundary owns the wording. */
  description?: string;
  /** Optional request CTA label for callers that preserve an established flow. */
  requestAccessLabel?: string;
  /** Canonical `required_scope` strings for the original panel. The card uses `missing`. */
  requiredScope?: readonly string[];
  /** Summary content; omit for the default placeholder or pass null to omit its container. */
  summary?: React.ReactNode;
  /** Decision identifier returned by BE for audit trail. */
  decisionId?: string;
  /** Relative timestamp string ('5분 전' etc.). Caller pre-formats. */
  evaluatedRelative?: string;
  /**
   * Called when the user clicks the request-access CTA (state === 'request_access').
   */
  onRequestAccess?: () => void;
  /** Human-readable labels displayed in the card. */
  missing?: { permission: string; system?: string };
  requestStatus?: 'none' | 'pending' | 'approved-partial' | 'not-requestable';
  /** The card's request or status button, shown first in the action row. */
  requestAction?: React.ReactNode;
  /** The card's optional exit button, shown after the request action. */
  exitAction?: React.ReactNode;
  lang?: 'ko' | 'en';
  className?: string;
}

const STATE_ICON = {
  request_access: Lock,
  summary_visible: Eye,
  denied: XCircle,
  blocked_not_requestable: Ban,
};

const MESSAGES = {
  ko: {
    missing: '필요한 권한', partial: '승인됨 · 아직 필요한 것',
    request: '이 항목에 접근하려면 권한 요청이 필요합니다.',
    pendingBody: '보낸 권한 요청을 검토하고 있습니다.',
    partialBody: '아직 필요한 권한을 요청하세요.',
    requestButton: '권한 요청하기', cardRequestButton: '권한 요청', summary: '요약 정보만 표시됩니다.',
    emptySummary: '요약 정보가 없습니다.', denied: '이 항목에 접근할 수 없습니다.',
    unavailable: '권한 요청이 허용되지 않습니다.', decision: '결정',
    evaluated: (relative: string) => `${relative}에 평가됨`,
  },
  en: {
    missing: 'Required access', partial: 'Approved · Still needed',
    request: 'Request permission to access this item.',
    pendingBody: 'Your access request is under review.',
    partialBody: 'Request the permissions you still need.',
    requestButton: 'Request access', cardRequestButton: 'Request access', summary: 'Only summary information is available.',
    emptySummary: 'No summary available.', denied: 'You cannot access this item.',
    unavailable: 'You cannot request this permission.', decision: 'Decision',
    evaluated: (relative: string) => `Evaluated ${relative}`,
  },
} as const;

export function PermissionBlockedPanel({
  state,
  layout = 'panel',
  headingLevel = 4,
  announceBody,
  category,
  reason,
  description,
  requestAccessLabel,
  requiredScope,
  summary,
  decisionId,
  evaluatedRelative,
  onRequestAccess,
  missing,
  requestStatus,
  requestAction,
  exitAction,
  lang = 'ko',
  className,
}: PermissionBlockedPanelProps) {
  const card = layout === 'card';
  const Icon = card && state !== 'summary_visible' ? Lock : STATE_ICON[state];
  const Heading = `h${headingLevel}` as const;
  const copy = MESSAGES[lang];
  const requestBodies = { none: copy.request, pending: copy.pendingBody, 'approved-partial': copy.partialBody, 'not-requestable': copy.denied };
  const statusBody = card && requestStatus !== undefined ? requestBodies[requestStatus] : undefined;
  const body = description ?? statusBody;
  const bodyRole = card && (announceBody || requestStatus === 'pending') ? 'status' : undefined;
  const callbackAction = card && requestStatus === undefined && state === 'request_access' && onRequestAccess
    ? <Button type="button" variant="primary" size="sm" onClick={onRequestAccess}>{requestAccessLabel ?? copy.cardRequestButton}</Button>
    : null;
  const firstAction = requestAction === undefined ? callbackAction : requestAction;

  return (
    <div
      data-state={state}
      data-request-status={card ? requestStatus : undefined}
      className={cn(
        card
          ? 'mx-auto my-8 flex max-w-lg flex-col gap-3 break-keep rounded-lg border border-border-subtle bg-surface-card p-5'
          : 'rounded-md border border-border-subtle bg-surface-card p-4 flex flex-col gap-3',
        className,
      )}
    >
      {/* Common header */}
      <div className="flex items-center gap-2">
        <Icon className={card ? 'size-4 shrink-0 text-text-muted' : 'h-4 w-4 text-text-muted shrink-0'} aria-hidden="true" />
        <Heading className="font-medium text-sm text-text-primary">{category}</Heading>
      </div>

      {/* State-specific body */}
      {(state === 'request_access' || state === 'blocked_not_requestable') && (
        <div className="flex flex-col gap-2">
          <p role={bodyRole} className="text-sm text-text-secondary">
            {body ?? (state === 'request_access' ? copy.request : reason ?? copy.unavailable)}
          </p>
          {(state === 'request_access' || body !== undefined) && reason !== undefined ? (
            <p className="text-sm text-text-secondary">{reason}</p>
          ) : null}
          {!card && state === 'request_access' && requiredScope !== undefined && requiredScope.length > 0 && (
            <p className="text-xs text-text-muted">{requiredScope.join(' · ')}</p>
          )}
          {!card && state === 'request_access' && onRequestAccess !== undefined && (
            <Button variant="default" size="sm" onClick={onRequestAccess}>
              {requestAccessLabel ?? copy.requestButton}
            </Button>
          )}
        </div>
      )}

      {state === 'summary_visible' && (
        <div className="flex flex-col gap-2">
          <p role={bodyRole} className="text-sm text-text-secondary">{body ?? copy.summary}</p>
          {summary !== null ? (
            <NestedTextBlock>
              {summary !== undefined ? (
                summary
              ) : (
                <p className="text-text-muted text-sm">{copy.emptySummary}</p>
              )}
            </NestedTextBlock>
          ) : null}
        </div>
      )}

      {state === 'denied' && (
        <p role={bodyRole} className="text-sm text-text-secondary">
          {body ?? reason ?? copy.denied}
        </p>
      )}

      {card && missing && <NestedTextBlock>
        <p className="text-xs text-text-muted">{copy.missing}</p>
        <p className="text-sm font-medium text-text-primary">{[missing.permission, missing.system].filter(Boolean).join(' · ')}</p>
      </NestedTextBlock>}
      {card && requestStatus === 'approved-partial' && <div>
        <StatusBadge tone="success">
          <CheckCircle2 className="mr-1 size-3" aria-hidden />
          {copy.partial}
        </StatusBadge>
      </div>}
      {card && (firstAction != null || exitAction != null) && (
        <div className="flex flex-wrap items-center gap-2">{firstAction}{exitAction}</div>
      )}

      {/* Audit footer — only when decisionId is provided */}
      {decisionId !== undefined && (
        <p className="text-xs text-text-muted">
          {`${copy.decision} `}<code>{decisionId}</code>
          {evaluatedRelative !== undefined ? ` · ${copy.evaluated(evaluatedRelative)}` : ''}
        </p>
      )}
    </div>
  );
}
