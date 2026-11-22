import { PERMISSION_REQUEST_FLOW_COPY } from '../lib/copy/permission-requests';
import type { HostSeam } from '../lib/host/host-seam';

/** Fixture presentation for feature tests; the bridge menu tests exercise the real SDK hook. */
export const useAccessRequestState: NonNullable<HostSeam['useAccessRequestState']> = (state, { lang }) => {
  const copy = PERMISSION_REQUEST_FLOW_COPY[lang];
  const phase = state.pending ? 'pending' : state.read ?? 'request';
  const checking = phase === 'checking';
  const href = state.pending ? state.statusHref : state.requestHref;
  const available = href && state.approvedPartial ? 'approved-partial' : 'none';
  const unavailable = phase === 'request' && !href;
  const requestStatus = state.pending ? 'pending' : unavailable ? 'not-requestable' : available;
  const requestLabel = state.approvedPartial ? copy.remaining : copy.request;
  return {
    phase, checking, href, requestStatus,
    label: state.pending ? copy.viewMine : requestLabel,
    readMessage: checking ? copy.checkingRequest : copy.requestCheckError,
    showRetry: phase === 'error' && state.retry !== undefined,
    retryLabel: copy.retry,
    focusProps: {},
    busyProps: checking ? { 'aria-busy': true, 'aria-disabled': true, onClick: event => event.preventDefault() } : {},
    retryProps: { onClick: state.retry },
  };
};
