import { ListStateMessage } from '@/components/ListStateMessage';
import { fetchAnalyticsAreaReport } from '@/lib/api/area-report';
import { useMeBridge } from '@/lib/api/me';
import { ApiError, isPermissionDenied } from '@/lib/api/types';
import { AREA_REPORT_COPY as COPY } from '@/lib/copy/area-report';
import { Button, PermissionBlockedPanel, SkeletonRows } from '@ap/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AnalyticsAreaReportTable } from './AnalyticsAreaReportTable';

function isInvalidCursor(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 422) return false;
  const fields = error.detail?.fields;
  return (
    Array.isArray(fields) &&
    fields.some((field) => field?.code === 'invalid_cursor' && field.path?.[0] === 'cursor')
  );
}

export function AnalyticsAreaReportPanel({
  managedSystemId,
  area,
  cursor,
  onPage,
  onInvalidCursor,
}: {
  managedSystemId: string | undefined;
  area: string | undefined;
  cursor: string | undefined;
  onPage: (cursor: string | undefined) => void;
  /** The address holds a cursor the server no longer accepts, for example one bound to another system scope. */
  onInvalidCursor: () => void;
}) {
  const me = useMeBridge();
  const query = useQuery({
    queryKey: [
      'dashboard-area-report',
      me.data?.workspace_id,
      me.data?.actor.id,
      managedSystemId ?? 'all',
      area ?? 'all',
      cursor ?? 'first',
    ],
    enabled: me.isSuccess,
    retry: false,
    queryFn: ({ signal }) =>
      fetchAnalyticsAreaReport(
        {
          ...(managedSystemId ? { managed_system_id: managedSystemId } : {}),
          ...(area ? { analytics_area_id: area } : {}),
          ...(cursor ? { cursor } : {}),
        },
        signal,
      ),
  });
  const invalidCursor = cursor !== undefined && isInvalidCursor(query.error);
  useEffect(() => {
    if (invalidCursor) onInvalidCursor();
  }, [invalidCursor, onInvalidCursor]);
  if (query.isPending)
    return (
      <div data-testid="area-report-pending">
        <SkeletonRows count={4} size="compact" />
      </div>
    );
  if (query.isError)
    return isPermissionDenied(query.error) ? (
      <PermissionBlockedPanel state="denied" category={COPY.tab} />
    ) : (
      <ListStateMessage
        variant="error"
        title={COPY.error}
        action={{ label: COPY.retry, onClick: () => void query.refetch() }}
      />
    );
  return (
    <div className="flex flex-col gap-3">
      {query.data.items.length === 0 ? (
        <ListStateMessage variant="empty" title={COPY.empty} />
      ) : (
        <AnalyticsAreaReportTable report={query.data} />
      )}
      <div className="flex justify-end gap-2">
        {cursor && (
          <Button variant="secondary" size="sm" onClick={() => onPage(undefined)}>
            {COPY.first}
          </Button>
        )}
        {query.data.page.has_more && query.data.page.cursor && (
          <Button variant="secondary" size="sm" onClick={() => onPage(query.data.page.cursor)}>
            {COPY.next}
          </Button>
        )}
      </div>
    </div>
  );
}
