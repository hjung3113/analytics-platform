import { PermissionBlockedPanel } from '@ap/ui';
import { Component, createRef, type ReactNode, type RefObject } from 'react';
import { RequestAccessButton } from './request-access-button';

export type ListAccessRequest = { capability: string; managedSystemId?: string; pending?: boolean };

export function ListAccessRequestPanel({ category, reason, returnRouteIntent, request, extraExitAction }: {
  category: string;
  reason: string;
  returnRouteIntent: string;
  request: ListAccessRequest;
  extraExitAction?: ReactNode;
}) {
  return (
    <RequestAccessButton
      layout="card"
      {...request}
      returnRouteIntent={returnRouteIntent}
      renderTrigger={(_onRequestAccess, panel) => (
        <PermissionBlockedPanel
          layout="card"
          state="request_access"
          category={category}
          reason={reason}
          {...panel}
          exitAction={extraExitAction ? <>{panel?.exitAction}{extraExitAction}</> : panel?.exitAction}
        />
      )}
    />
  );
}

/** Retains the focus destination when a refreshed denial replaces the entire request card. */
export class ListDenialFocus extends Component<{
  children: ReactNode;
  className?: string;
  container?: RefObject<HTMLDivElement | null>;
}> {
  private readonly fallback = createRef<HTMLDivElement>();

  private get container() {
    return this.props.container ?? this.fallback;
  }

  override getSnapshotBeforeUpdate(): HTMLElement | null {
    const focused = document.activeElement;
    return focused instanceof HTMLElement && this.container.current?.contains(focused) ? focused : null;
  }

  override componentDidUpdate(_props: Readonly<typeof this.props>, _state: unknown, previous: HTMLElement | null) {
    if (!previous || previous.isConnected || document.activeElement !== document.body) return;
    const container = this.container.current;
    const target = container?.querySelector<HTMLElement>('a[href], button:not(:disabled)') ?? container;
    target?.focus({ preventScroll: true });
  }

  override render() {
    return <div ref={this.container} tabIndex={-1} className={this.props.className}>{this.props.children}</div>;
  }
}
