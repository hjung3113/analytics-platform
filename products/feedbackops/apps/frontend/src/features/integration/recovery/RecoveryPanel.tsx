import { ListStateMessage } from '@/components/ListStateMessage';
import { patchRecoveryPresentation } from '@/lib/api/recovery';
import { ApiError } from '@/lib/api/types';
import { HOME_QUEUE_COPY } from '@/lib/copy/home';
import { RECOVERY_COPY as COPY } from '@/lib/copy/recovery';
import type { ClosableDetailParts } from '@/lib/host/detail-parts';
import { HostLink, useHostSeam } from '@/lib/host/host-seam';
import { invalidateRecovery, invalidateRecoverySource } from '@/lib/query/recovery';
import type { RecoveryAction, RecoveryDetail, RecoveryPresentationPatch } from '@fops/shared';
import {
  Button,
  DetailPanelFullscreenContext,
  DetailPanelFullscreenToggle,
  DetailPanelHeader,
  FieldRow,
  OutlineBadge,
  PermissionBlockedPanel,
  Skeleton,
} from '@fops/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useContext, useEffect } from 'react';
import { RecoveryFreshness, formatRecoveryTime } from './RecoveryFreshness';

export type RenderRecoveryAccess = (
  permission: NonNullable<RecoveryAction['requestable_permission']>,
  returnTo: string,
) => ReactNode;

type RecoverySourceType = Exclude<
  NonNullable<RecoveryDetail['source']>['type'],
  'permission_request'
>;

function sourceHref(route: string, returnTo: string) {
  const url = new URL(route, 'https://recovery.internal');
  url.searchParams.set('returnTo', returnTo);
  return url.pathname + url.search + url.hash;
}
type RecoveryPanelProps = {
  id: string;
  item: RecoveryDetail | undefined;
  loading: boolean;
  error: unknown;
  updatedAt: number;
  onClose: () => void;
  onRetry: () => void;
  returnTo: string;
  renderRequestAccess?: RenderRecoveryAccess;
  pageComputedAt: string | undefined;
};

/** The panel as parts a host places in its own chrome (#762 node i); `itemKey` identifies the selected item for a host that keys its frame. */
export type RecoveryPanelParts = ClosableDetailParts & {
  itemKey: string;
  sourceHeader?: { kind: RecoverySourceType; displayId?: string; title: string };
};

export function buildRecoveryPanelParts(
  props: RecoveryPanelProps & { itemKey: string },
): RecoveryPanelParts {
  const { item, error, itemKey } = props;
  const source = item?.source;
  const sourceHeader =
    source && source.type !== 'permission_request' && !error
      ? {
          kind: source.type,
          ...(source.display_id ? { displayId: source.display_id } : {}),
          title: source.title,
        }
      : undefined;
  const title = sourceHeader
    ? sourceHeader.title
    : !error && item
      ? item.source?.type === 'permission_request'
        ? `Permission Request · ${item.source.title}`
        : item.source?.title || item.reason
      : COPY.title;
  return {
    title,
    body: <RecoveryPanelBody key={itemKey} {...props} />,
    requestClose: props.onClose,
    itemKey,
    ...(sourceHeader ? { sourceHeader } : {}),
  };
}

export function RecoveryPanelFrame({ parts }: { parts: RecoveryPanelParts }) {
  const { sourceHeader } = parts;
  return (
    <section
      aria-label={COPY.title}
      className="flex h-full min-h-0 flex-col"
      data-testid="recovery-panel"
    >
      {sourceHeader ? (
        <DetailPanelHeader
          kind={sourceHeader.kind}
          {...(sourceHeader.displayId ? { id: sourceHeader.displayId } : {})}
          onClose={parts.requestClose}
          extras={<h2 className="truncate text-sm font-semibold">{parts.title}</h2>}
        />
      ) : (
        <header className="flex h-toolbar shrink-0 items-center justify-between border-b border-border-subtle px-4">
          <h2 className="text-sm font-semibold">{parts.title}</h2>
          <div className="flex items-center gap-2">
            <DetailPanelFullscreenToggle />
            <Button
              variant="subtle"
              size="sm"
              aria-label={COPY.closePanel}
              onClick={parts.requestClose}
            >
              {COPY.close}
            </Button>
          </div>
        </header>
      )}
      {parts.body}
    </section>
  );
}

export function RecoveryPanel(props: RecoveryPanelProps) {
  return <RecoveryPanelFrame parts={buildRecoveryPanelParts({ ...props, itemKey: '' })} />;
}

function RecoveryPanelBody({
  id,
  item,
  loading,
  error,
  updatedAt,
  onClose,
  onRetry,
  returnTo,
  renderRequestAccess,
  pageComputedAt,
}: RecoveryPanelProps) {
  const client = useQueryClient();
  const { canLink, hostCarriesReturn } = useHostSeam();
  // A host that carries the return path itself gets the bare route (no FeedbackOps `returnTo`).
  const outbound = (route: string) =>
    hostCarriesReturn === true ? route : sourceHref(route, returnTo);
  const fullscreen = useContext(DetailPanelFullscreenContext);
  const mutation = useMutation({
    mutationFn: (body: RecoveryPresentationPatch) => patchRecoveryPresentation(id, body),
    // Hook-level callbacks survive selection changes/unmount; never close a newer selection.
    onSuccess: (data) =>
      Promise.all([invalidateRecovery(client), invalidateRecoverySource(client, data.category)]),
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'conflict.stale_write')
        void invalidateRecovery(client);
    },
  });
  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || fullscreen?.expanded) return;
      if (
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
        )
      )
        return;
      event.preventDefault();
      onClose();
    }
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [onClose, fullscreen?.expanded]);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <RecoveryFreshness
        computedAt={item?.computed_at}
        failed={!!error}
        updatedAt={updatedAt}
        pageComputedAt={pageComputedAt}
      />
      {loading ? (
        <Skeleton className="h-32" role="status" aria-label={COPY.loading} />
      ) : error instanceof ApiError && error.status === 403 ? (
        <>
          <p>{COPY.denied}</p>
          <PermissionBlockedPanel state="denied" category={COPY.title} />
        </>
      ) : error ? (
        <ListStateMessage
          variant="error"
          title={error instanceof ApiError && error.status === 404 ? COPY.missing : COPY.error}
          {...(!(error instanceof ApiError && error.status === 404)
            ? { action: { label: COPY.retry, onClick: onRetry } }
            : {})}
        />
      ) : item ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <OutlineBadge>{COPY.state[item.state]}</OutlineBadge>
            <OutlineBadge>{HOME_QUEUE_COPY[item.category].title}</OutlineBadge>
          </div>
          <FieldRow label={COPY.reason} layout="property">
            {item.reason}
          </FieldRow>
          <FieldRow label={COPY.occurrenceLabel} layout="property">
            {COPY.occurrence(item.occurrence)}
          </FieldRow>
          {item.resolution && (
            <FieldRow label={COPY.resolution} layout="property">
              {formatRecoveryTime(item.resolution.resolved_at)} ·{' '}
              {item.resolution.evidence === 'command' ? COPY.command : COPY.observation}
            </FieldRow>
          )}
          <FieldRow label={COPY.responsibility} layout="property">
            {item.responsible_actor_hint.label}
          </FieldRow>
          {item.presentation.state !== 'visible' && (
            <FieldRow label={COPY.presentation} layout="property">
              {item.presentation.state === 'muted'
                ? COPY.muted
                : item.presentation.snoozed_until
                  ? COPY.snoozed(formatRecoveryTime(item.presentation.snoozed_until))
                  : COPY.hidden}
            </FieldRow>
          )}
          {item.source &&
            !(
              item.state === 'active' &&
              item.next_actions.some(
                (action) =>
                  action.availability === 'available' && action.target.route === item.source?.route,
              )
            ) &&
            canLink(outbound(item.source.route)) && (
              <HostLink className="text-accent-info underline" to={outbound(item.source.route)}>
                {item.source.display_id} · {item.source.title} · {COPY.source}
              </HostLink>
            )}
          {item.affected.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3>{COPY.affected}</h3>
              {item.affected.map((source) =>
                canLink(outbound(source.route)) ? (
                  <HostLink key={`${source.type}:${source.id}`} to={outbound(source.route)}>
                    {source.display_id} · {source.title}
                  </HostLink>
                ) : null,
              )}
            </div>
          )}
          {item.state === 'active' &&
            item.next_actions.map((action) => (
              <div key={action.id} className="flex flex-col gap-2">
                {action.availability === 'available' ? (
                  canLink(outbound(action.target.route)) && (
                    <Button asChild variant="primary" size="sm">
                      <HostLink to={outbound(action.target.route)}>{action.label}</HostLink>
                    </Button>
                  )
                ) : (
                  <>
                    <p>{action.blocked_reason}</p>
                    <PermissionBlockedPanel state="denied" category={COPY.title} />
                    {action.availability === 'blocked_requestable' &&
                      action.requestable_permission &&
                      renderRequestAccess?.(action.requestable_permission, returnTo)}
                  </>
                )}
              </div>
            ))}
          {item.state === 'active' && <p className="text-xs text-text-muted">{COPY.personal}</p>}
          {item.state === 'active' && (
            <div className="flex flex-wrap gap-2">
              {item.presentation.state === 'visible' ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ action: 'snooze', days: 1 })}
                  >
                    {COPY.snooze1}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ action: 'snooze', days: 7 })}
                  >
                    {COPY.snooze7}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ action: 'mute' })}
                  >
                    {COPY.mute}
                  </Button>
                </>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ action: 'restore' })}
                >
                  {COPY.restore}
                </Button>
              )}
            </div>
          )}
          {mutation.isError && (
            <p role="alert">
              {mutation.error instanceof ApiError && mutation.error.code === 'conflict.stale_write'
                ? COPY.conflict
                : COPY.patchError}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
