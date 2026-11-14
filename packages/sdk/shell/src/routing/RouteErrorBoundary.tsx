import { Component, useId, type ReactNode } from 'react';
import { ServerCrash } from 'lucide-react';
import { useI18n, useMessages } from '@ap/kernel';
import { StateMessage } from '@ap/components';
import { Button } from '@ap/ui';
import { HomeLink } from '../frame/HomeLink';
import { reloadApp } from '../frame/reload';
import { SHELL_MESSAGES } from '../messages';
import { useErrorReport } from '../voc/useErrorReport';
import { isChunkLoadFailure } from '@ap/kernel/host';

type Props = {
  /** Reports the contained error and returns the correlation id to show. */
  onError: (error: unknown) => string;
  /** A change of this value clears a contained failure (menu, route params, server-side revision). */
  resetKey: string;
  children: ReactNode;
};
type State = { failed: boolean; correlationId: string | null; chunkFailure: boolean };

/**
 * Contains a menu screen's render failure in the content slot (06 §4 전역 Error Boundary) so the shell,
 * navigation and other menus stay usable. Retry and a new resetKey remount the screen.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, correlationId: null, chunkFailure: false };
  static getDerivedStateFromError(error: unknown): Partial<State> { return { failed: true, chunkFailure: isChunkLoadFailure(error) }; }
  componentDidCatch(error: unknown) { this.setState({ correlationId: this.props.onError(error) }); }
  componentDidUpdate(prev: Props, prevState: State) {
    // Only a failure that was already on screen is cleared by a new key; one that just happened under the new key is not retried.
    if (prevState.failed && this.state.failed && prev.resetKey !== this.props.resetKey) this.reset();
  }
  reset = () => this.setState({ failed: false, correlationId: null, chunkFailure: false });
  retry = () => { if (this.state.chunkFailure) reloadApp(); else this.reset(); };
  render() {
    if (!this.state.failed) return this.props.children;
    return <RouteErrorView correlationId={this.state.correlationId ?? undefined} onRetry={this.retry} />;
  }
}

function RouteErrorView({ correlationId, onRetry }: { correlationId?: string; onRetry: () => void }) {
  const { t } = useI18n();
  const m = useMessages(SHELL_MESSAGES);
  const report = useErrorReport(correlationId ?? null);
  const reasonId = useId();
  const receiptId = useId();
  const available = report.status === 'available';
  const reason = report.status === 'denied' ? m('errorVocDenied') : m('errorVocUnavailable');
  const recovery = m('errorRecovery');
  const manual = m('errorManualTrace');
  const receipt = m('errorReportReceipt');
  return <div className="grid min-w-0 grid-cols-1 gap-3 p-6">
    <StateMessage compact tone="danger" icon={<ServerCrash className="size-4" aria-hidden />}
      title={m('errorBoundaryTitle')}
      body={available ? recovery : `${recovery} ${manual}`} />
    {/* Recovery leads in DOM/tab order; the trace and its quiet action sit together on the preceding visual row. */}
    <div className="row-start-3 flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" onClick={onRetry}>{t('retry')}</Button>
      <HomeLink />
    </div>
    <div className="row-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
      {correlationId !== undefined && <span className="min-w-0 break-all">{t('correlationId')}: <span className="t-mono select-text">{correlationId}</span></span>}
      {/* aria-disabled preserves the drawer's programmatic focus return after submit; the handler and tab order make it inert. */}
      <Button type="button" size="sm" variant="link" className="aria-disabled:opacity-50" data-error-report
        disabled={!available && !report.submitted} aria-disabled={report.submitted || undefined} tabIndex={report.submitted ? -1 : undefined}
        aria-describedby={report.submitted ? receiptId : !available ? reasonId : undefined}
        onClick={() => { if (available && !report.submitted && correlationId !== undefined) report.open(correlationId); }}>
        {m('errorReportAction')}
      </Button>
      {!available && <span id={reasonId}>{reason}</span>}
    </div>
    <div className="row-start-4 grid text-xs leading-5 text-text-secondary">
      {/* Reserve the localized receipt's wrapped height without announcing it before submission. */}
      <span className="invisible col-start-1 row-start-1" aria-hidden>{receipt}</span>
      <div id={receiptId} className="col-start-1 row-start-1" data-error-report-sent={report.submitted ? '' : undefined}
        role="status" aria-live="polite" aria-atomic="true" aria-label={m('errorReportResultLabel')}>{report.submitted ? receipt : null}</div>
    </div>
  </div>;
}
