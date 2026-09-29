import { Component, type ReactNode } from 'react';
import { ServerCrash } from 'lucide-react';
import { PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { StateMessage } from '@ap/components';
import { Button } from '@ap/ui';
import { reloadApp } from './reload';

type Props = {
  /** Reports the contained error and returns the correlation id to show. */
  onError: (error: unknown) => string;
  /** A change of this value clears a contained failure (menu, route params, server-side revision). */
  resetKey: string;
  children: ReactNode;
};
type State = { failed: boolean; correlationId: string | null; chunkFailure: boolean };

const CHUNK_FAILURE = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading (CSS )?chunk .* failed/i;
/** A rejected `React.lazy` import: React caches the rejection on the lazy object the manifest keeps, so only a reload can retry it. */
function isChunkLoadFailure(error: unknown): boolean {
  try { return error instanceof Error && (error.name === 'ChunkLoadError' || CHUNK_FAILURE.test(error.message)); } catch { return false; }
}

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
  const { linkTo, sidebarSpace } = usePlatform();
  const { t, lang } = useI18n();
  return <div className="p-6"><StateMessage tone="danger" icon={<ServerCrash className="size-4" aria-hidden />}
    title={lang === 'ko' ? '이 화면에서 오류가 발생했습니다' : 'Something went wrong on this screen'}
    body={lang === 'ko' ? '다른 메뉴는 그대로 사용할 수 있습니다. 다시 시도하거나 홈으로 이동하세요. 문의할 때 아래 Correlation ID를 알려 주세요.' : 'Other menus still work. Retry, or go home. Quote the Correlation ID below when you ask for help.'}
    correlationId={correlationId}
    action={<span className="flex items-center gap-2">
      <Button size="sm" variant="secondary" onClick={onRetry}>{t('retry')}</Button>
      <Button asChild size="sm" variant="secondary"><PlatformLink href={linkTo(sidebarSpace.homeMenuId)}>{t('home')}</PlatformLink></Button>
    </span>} /></div>;
}
