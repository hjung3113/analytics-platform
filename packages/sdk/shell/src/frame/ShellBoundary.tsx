import { Component, type ReactNode } from 'react';
import { useI18n } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { Button } from '@ap/ui';
import { isChunkLoadFailure } from '../routing/chunkFailure';
import { reloadApp } from './reload';

type Props = {
  /** What a failed region renders instead: absent = one compact line with a retry button; `null` = nothing (rail buttons, collapsed sidebar); any other node = that node (e.g. the menu list without counts). */
  fallback?: ReactNode;
  children: ReactNode;
};

/**
 * Contains a render failure of one region the shell mounts outside the menu screen (a lazy shell chunk, a menu's `navTree.Source`, an injected
 * slot; 06 §4 Kernel duty: one menu's failure never blanks the platform). The rail, the other regions and the screen stay. The failure is
 * reported through the same Kernel `reportError` as `RouteErrorBoundary`; a new session user or server revision clears it. Internal to the shell.
 */
export function ShellBoundary({ fallback, children }: Props) {
  const { reportError, session, revision } = useHostPlatform();
  return <ShellBoundaryInner onError={reportError} resetKey={`${session.user.id}|${revision}`} fallback={fallback}>{children}</ShellBoundaryInner>;
}

type InnerProps = Props & { onError: (error: unknown) => string; resetKey: string };
type State = { failed: boolean; chunkFailure: boolean };

class ShellBoundaryInner extends Component<InnerProps, State> {
  state: State = { failed: false, chunkFailure: false };
  static getDerivedStateFromError(error: unknown): Partial<State> { return { failed: true, chunkFailure: isChunkLoadFailure(error) }; }
  componentDidCatch(error: unknown) { this.props.onError(error); }
  componentDidUpdate(prev: InnerProps, prevState: State) {
    if (prevState.failed && this.state.failed && prev.resetKey !== this.props.resetKey) this.reset();
  }
  reset = () => this.setState({ failed: false, chunkFailure: false });
  // A rejected lazy import is cached by React, so only a reload can fetch the chunk again (same rule as `RouteErrorBoundary`).
  retry = () => { if (this.state.chunkFailure) reloadApp(); else this.reset(); };
  render() {
    if (!this.state.failed) return this.props.children;
    return this.props.fallback === undefined ? <RegionRetry onRetry={this.retry} /> : this.props.fallback;
  }
}

function RegionRetry({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return <div role="status" data-shell-boundary className="px-3 py-1 text-xs leading-4 text-text-muted break-keep">
    {t('hierarchyError')}<Button type="button" variant="navigation" size="toolbar" onClick={onRetry}>{t('retry')}</Button>
  </div>;
}
