import { Component, type ReactNode } from 'react';
import { RotateCw, ServerCrash } from 'lucide-react';
import { useI18n } from '@ap/kernel';
import { useHostPlatformOptional } from '@ap/kernel/host';
import { Button } from '@ap/ui';
import { StateMessage } from '../StateView';

type Props = { render?: () => ReactNode };
type InnerProps = { children: ReactNode } & { onError?: (error: unknown) => string; resetKey: string };
type State = { failed: boolean; correlationId?: string };

/**
 * One panel's content failing to render stays in that panel (06 §2 principle 7): the other panels and the workspace keep running. The
 * failure goes through Kernel `reportShellError` (the report a shell region uses, so a healthy screen's pending arrival focus stays) and
 * the panel shows the Correlation ID and a retry. A server revision or session change clears it. Internal to the dock.
 */
export function PanelBoundary({ render }: Props) {
  const host = useHostPlatformOptional();
  return <PanelBoundaryInner onError={host?.reportShellError} resetKey={host ? `${host.session.user.id}|${host.revision}` : ''}><PanelContent render={render} /></PanelBoundaryInner>;
}

/** The panel's own render function runs inside the boundary, so a throw there is contained too. */
function PanelContent({ render }: Props) { return render?.() ?? null; }

class PanelBoundaryInner extends Component<InnerProps, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): Partial<State> { return { failed: true }; }
  componentDidCatch(error: unknown) {
    const correlationId = this.props.onError?.(error);
    if (correlationId) this.setState({ correlationId });
  }
  componentDidUpdate(prev: InnerProps) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.reset();
  }
  reset = () => this.setState({ failed: false, correlationId: undefined });
  render() {
    if (!this.state.failed) return this.props.children;
    return <PanelError correlationId={this.state.correlationId} onRetry={this.reset} />;
  }
}

function PanelError({ correlationId, onRetry }: { correlationId?: string; onRetry: () => void }) {
  const { t } = useI18n();
  return <StateMessage tone="danger" icon={<ServerCrash className="size-4" aria-hidden />} title={t('stateError')} correlationId={correlationId}
    action={<Button size="sm" variant="secondary" onClick={onRetry}><RotateCw className="size-3.5" aria-hidden />{t('retry')}</Button>} />;
}
