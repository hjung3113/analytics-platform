// HomeTodoPanel — the platform home's `내 할 일` section (platform ADR-0070 decision 8, #657): surveys to answer,
// my VOCs with a new public update, and my permission requests. Each group hides when it has nothing; with
// nothing in any group (or while loading) the panel renders nothing. Every read is the caller's own.
//
// Bridge-safe: no router, no `@/lib/api` barrel, no `lib/auth`, no `sonner`; links go through the host seam.

import { notificationTarget } from '@/features/home/InboxPanel';
import { useAnswerableSurveys } from '@/features/surveys/hooks/useSurveys';
import { fetchNotifications, notificationsQueryKey } from '@/lib/api/notifications';
import {
  fetchPermissionRequestsMine,
  permissionRequestsMineAllKey,
} from '@/lib/api/permission-requests';
import { getCapabilityDisplayLabel } from '@/lib/copy/capabilities';
import { permissionRequestStatusLabel } from '@/lib/copy/enum-labels';
import { HOME_TODO_COPY as COPY } from '@/lib/copy/home';
import { formatRelativeTime } from '@/lib/format/datetime';
import { HostLink } from '@/lib/host/host-seam';
import {
  type MinePermissionRequestRow,
  type NotificationDto,
  OPEN_PERMISSION_REQUEST_STATUSES,
  type PermissionRequestStatus,
} from '@fops/shared';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

const MAX_ROWS = 5;
const DECIDED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DECIDED_STATUSES: ReadonlySet<PermissionRequestStatus> = new Set([
  'approved',
  'rejected',
  'expired',
  'revoked',
]);
const PUBLIC_UPDATE_EVENT = 'voc.public_update_posted';
const SURVEYS_ALL = '/surveys/participate';
const PERMISSION_REQUESTS_ALL = '/permission-requests';

type Row = { key: string; to: string; title: string; meta: string };
type Group = {
  id: string;
  title: string;
  state: 'pending' | 'error' | 'ready';
  rows: Row[];
  moreTo: string | null;
};

function useSurveyGroup(): Group {
  const query = useAnswerableSurveys();
  const page = query.data?.pages[0];
  const items = page?.items ?? [];
  return {
    id: 'surveys',
    title: COPY.surveys,
    state: query.isError ? 'error' : query.isPending ? 'pending' : 'ready',
    rows: items.slice(0, MAX_ROWS).map((survey) => ({
      key: survey.survey_id,
      to: `/surveys/${encodeURIComponent(survey.survey_id)}/respond`,
      title: survey.title,
      meta: survey.display_id,
    })),
    moreTo: items.length > MAX_ROWS || page?.page.has_more === true ? SURVEYS_ALL : null,
  };
}

function vocRows(items: readonly NotificationDto[]): Row[] {
  const seen = new Set<string>();
  const rows: Row[] = [];
  const newestFirst = items
    .filter((item) => item.event_type === PUBLIC_UPDATE_EVENT)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  for (const item of newestFirst) {
    const { voc_id: vocId } = item.detail;
    const to = notificationTarget(item);
    if (typeof vocId !== 'string' || to === null || seen.has(vocId)) continue;
    seen.add(vocId);
    const title =
      item.subject_ref?.visibility_state === 'allowed' ? item.subject_ref.title : item.summary;
    rows.push({ key: vocId, to, title, meta: formatRelativeTime(item.created_at) });
    if (rows.length === MAX_ROWS) break;
  }
  return rows;
}

function useVocGroup(): Group {
  const query = useQuery({
    queryKey: [...notificationsQueryKey, 'home-todo'] as const,
    queryFn: ({ signal }) => fetchNotifications({ unread: true, limit: 100, signal }),
    retry: false,
  });
  return {
    id: 'vocs',
    title: COPY.vocs,
    state: query.isError ? 'error' : query.isPending ? 'pending' : 'ready',
    rows: query.data ? vocRows(query.data.items) : [],
    moreTo: null,
  };
}

function permissionRows(requests: readonly MinePermissionRequestRow[], now: number): Row[] {
  const visible = requests.filter(
    (row) =>
      OPEN_PERMISSION_REQUEST_STATUSES.has(row.status) ||
      (DECIDED_STATUSES.has(row.status) && Date.parse(row.updated_at) >= now - DECIDED_WINDOW_MS),
  );
  const rank = (row: MinePermissionRequestRow): number =>
    OPEN_PERMISSION_REQUEST_STATUSES.has(row.status) ? 0 : 1;
  return visible
    .sort((a, b) => rank(a) - rank(b) || Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, MAX_ROWS)
    .map((row) => ({
      key: row.id,
      to: PERMISSION_REQUESTS_ALL,
      title: getCapabilityDisplayLabel(row.requested_capability),
      meta: permissionRequestStatusLabel[row.status],
    }));
}

function usePermissionGroup(): Group {
  const query = useQuery({
    queryKey: permissionRequestsMineAllKey,
    queryFn: ({ signal }) => fetchPermissionRequestsMine({ status: 'all', signal }),
    retry: false,
  });
  return {
    id: 'permission-requests',
    title: COPY.permissionRequests,
    state: query.isError ? 'error' : query.isPending ? 'pending' : 'ready',
    rows: query.data ? permissionRows(query.data.requests, Date.now()) : [],
    moreTo: PERMISSION_REQUESTS_ALL,
  };
}

function TodoGroup({ group }: { group: Group }): React.ReactElement {
  return (
    <div className="min-w-0" data-testid={`home-todo-${group.id}`}>
      <h3 className="mb-2 text-xs font-semibold text-text-muted">{group.title}</h3>
      {group.state === 'error' ? (
        <p className="text-sm text-text-muted">{COPY.loadError}</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {group.rows.map((row) => (
            <li key={row.key}>
              <HostLink
                to={row.to}
                className="flex items-baseline justify-between gap-3 py-1.5 text-sm text-text-primary hover:text-text-secondary"
              >
                <span className="min-w-0 truncate">{row.title}</span>
                <span className="shrink-0 text-xs text-text-muted">{row.meta}</span>
              </HostLink>
            </li>
          ))}
        </ul>
      )}
      {group.moreTo !== null && (
        <HostLink
          to={group.moreTo}
          className="mt-1 inline-block text-xs text-text-secondary hover:text-text-primary"
        >
          {COPY.viewAll}
        </HostLink>
      )}
    </div>
  );
}

export function HomeTodoPanel(): React.ReactElement | null {
  const headingId = React.useId();
  const groups = [useSurveyGroup(), useVocGroup(), usePermissionGroup()];
  const anyItems = groups.some((group) => group.rows.length > 0);
  if (!anyItems && groups.some((group) => group.state === 'pending')) return null;
  const shown = groups.filter((group) => group.rows.length > 0 || group.state === 'error');
  if (shown.length === 0) return null;
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-border-subtle bg-surface-card p-4"
      data-testid="home-todo"
    >
      <h2 id={headingId} className="mb-3 text-sm font-semibold text-text-primary">
        {COPY.title}
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {shown.map((group) => (
          <TodoGroup key={group.id} group={group} />
        ))}
      </div>
    </section>
  );
}
