import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type MouseEvent, type RefObject } from 'react';
import type { AccessRequestState, Lang } from '@ap/kernel';
import { textFor } from '@ap/kernel/host';
import { pageFallbackTarget } from './pageFocus';

const READ_LIMIT_MS = 8000;
const RETRY_START_LIMIT_MS = 3000;
export const ACCESS_REQUEST_READ_KEYS = { checking: 'accessRequestChecking', error: 'accessRequestReadError' } as const;
const REQUEST_LABELS = {
  pending: 'accessRequestViewMine',
  'approved-partial': 'accessRequestRemaining',
  none: 'accessRequest',
  'not-requestable': 'accessRequest',
} as const;

function busyAttributes(busy: boolean) {
  return { 'aria-disabled': busy || undefined, 'aria-busy': busy || undefined };
}

type ReadPhase = 'idle' | 'checking' | 'retry-pressed' | 'retry-checking' | 'timed-out';
type ReadCycle = { key: string | undefined; read: AccessRequestState['read']; phase: ReadPhase };

function readCycle(key: ReadCycle['key'], read: ReadCycle['read'], previous?: ReadCycle): ReadCycle {
  let phase: ReadPhase = 'idle';
  if (read === 'checking') phase = previous?.phase === 'retry-pressed' ? 'retry-checking' : 'checking';
  return { key, read, phase };
}

/** Bounds the current read and its retries. The host supplies raw read state and retries the current target. */
export function useAccessRequestRead(state: AccessRequestState): ReturnType<typeof useAccessRequestRetry> {
  const read = !state.pending && state.requestHref !== null ? state.read : undefined;
  const key = state.readKey;
  const [cycle, setCycle] = useState(() => readCycle(key, read));
  if (cycle.key !== key || cycle.read !== read) {
    setCycle(readCycle(key, read, cycle.key === key ? cycle : undefined));
  }

  const { phase } = cycle;
  const retrying = phase === 'retry-pressed' || phase === 'retry-checking';
  const checking = phase === 'checking' || phase === 'retry-checking';
  useEffect(() => {
    if (!checking && phase !== 'retry-pressed') return;
    const delay = checking ? READ_LIMIT_MS : RETRY_START_LIMIT_MS;
    const timer = window.setTimeout(() => {
      setCycle(current => current === cycle ? { ...current, phase: checking ? 'timed-out' : 'idle' } : current);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [cycle, checking, phase]);

  const canRetry = state.retry !== undefined || retrying;
  const showError = retrying || phase === 'timed-out';
  const shown: AccessRequestState = showError ? { ...state, read: 'error' } : state;
  const run = () => {
    if (retrying || state.retry === undefined || shown.read !== 'error') return;
    setCycle({ ...cycle, phase: read === 'checking' ? 'retry-checking' : 'retry-pressed' });
    state.retry();
  };
  return { shown, retrying, canRetry, run };
}

/**
 * Presents an access-request read in a link or dialog entry. Pass the action container and
 * spread focusProps on its request, status and retry controls (or their common wrapper).
 * The host still owns the read, eligibility, and the action taken after a settled read.
 */
export function useAccessRequestState(state: AccessRequestState, { lang, kind, container, fallback }: {
  lang: Lang;
  kind: 'link' | 'dialog';
  container: RefObject<HTMLElement | null>;
  fallback?: RefObject<HTMLElement | null>;
}) {
  const { shown, retrying, canRetry, run } = useAccessRequestRead(state);
  const href = shown.pending || (kind === 'link' && shown.requestHref === undefined)
    ? shown.statusHref : shown.requestHref;
  const unavailable = !shown.pending && shown.requestHref === null;
  const phase: 'pending' | 'request' | NonNullable<AccessRequestState['read']> = shown.pending ? 'pending' : shown.read ?? 'request';
  const checking = !unavailable && phase === 'checking';
  const showRetry = !unavailable && phase === 'error' && canRetry;
  const requestable = Boolean(href) || (!unavailable && (phase !== 'request' || kind === 'dialog'));
  const availableStatus = phase === 'request' && shown.approvedPartial ? 'approved-partial' : 'none';
  const readyStatus = requestable ? availableStatus : 'not-requestable';
  const requestStatus: keyof typeof REQUEST_LABELS = shown.pending ? 'pending' : readyStatus;
  const readMessage = !unavailable && (phase === 'checking' || phase === 'error') ? textFor(ACCESS_REQUEST_READ_KEYS[phase], lang) : undefined;

  const focusedControl = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const previous = focusedControl.current;
    if (!previous || previous.isConnected) return;
    focusedControl.current = null;
    if (document.activeElement && document.activeElement !== document.body) return;
    const first = container.current?.querySelector<HTMLElement>('a[href], button:not(:disabled)');
    const target = first ?? pageFallbackTarget(container.current ?? fallback?.current ?? null);
    target?.focus({ preventScroll: true });
  });

  return {
    shown, phase, checking, unavailable, href, requestStatus, showRetry, retrying, readMessage,
    label: textFor(REQUEST_LABELS[requestStatus], lang),
    retryLabel: textFor('retry', lang),
    busyProps: {
      ...busyAttributes(checking),
      onClick: checking ? (event: MouseEvent) => event.preventDefault() : undefined,
    },
    retryProps: {
      ...busyAttributes(retrying),
      onClick: () => {
        if (retrying || !showRetry) return;
        run();
      },
    },
    focusProps: {
      onFocus: (event: FocusEvent<HTMLElement>) => { focusedControl.current = event.target; },
      onBlur: (event: FocusEvent<HTMLElement>) => {
        const node = event.target;
        if (event.relatedTarget !== null) focusedControl.current = null;
        else queueMicrotask(() => {
          if (node.isConnected && focusedControl.current === node && document.activeElement !== node) focusedControl.current = null;
        });
      },
    },
  };
}

/**
 * The retry of a failed state read, shared by every place that offers 「다시 시도」 (#1933). The slot reports `checking` while the retry runs and gives no
 * `retry` then, so the hook keeps the last one, and `shown` keeps the failure look (body and action alike) until the read settles. `run` does nothing when
 * there is nothing to re-run (`canRetry` false) or one retry is already running.
 */
export function useAccessRequestRetry(state: AccessRequestState): { shown: AccessRequestState; retrying: boolean; canRetry: boolean; run: () => void } {
  const [retry, setRetry] = useState<null | 'pressed' | 'running'>(null);
  const retryAction = useRef(state.retry);
  useLayoutEffect(() => { if (state.retry) retryAction.current = state.retry; }, [state.retry]);
  const canRetry = state.retry !== undefined || retry !== null;
  useEffect(() => {
    if (retry === 'pressed' && state.read === 'checking') setRetry('running');
    else if (retry === 'running' && state.read !== 'checking') setRetry(null);
  }, [retry, state.read]);
  useEffect(() => {
    if (retry !== 'pressed') return;
    // A retry that never starts a read (nothing to re-run) must not leave a busy button behind.
    const timer = window.setTimeout(() => setRetry(null), RETRY_START_LIMIT_MS);
    return () => window.clearTimeout(timer);
  }, [retry]);
  const shown: AccessRequestState = retry !== null && state.read === 'checking' ? { ...state, read: 'error' } : state;
  const run = () => {
    if (retry !== null) return;
    const action = state.retry ?? retryAction.current;
    if (action === undefined || !canRetry) return;
    setRetry('pressed');
    action();
  };
  return { shown, retrying: retry !== null, canRetry, run };
}
