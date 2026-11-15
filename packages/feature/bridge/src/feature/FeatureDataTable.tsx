import { useCallback, useState, type ReactNode } from 'react';
import { PlatformDataTable, type PlatformColumn } from '@ap/components';
import type { ApiResponse, GroupedPageResult } from '@ap/contracts';

/** Presentation seam: feature screens own REST metadata/cursors; the host supplies the platform's table grammar. */
export function FeatureDataTable<T extends { id: string }>({ rows, columns, rowAction, summary, pagination, preferenceKey }: {
  rows: T[]; columns: PlatformColumn<T>[]; rowAction: (row: T) => ReactNode;
  summary: ReactNode; pagination: ReactNode; preferenceKey: string;
}) {
  // The SDK reloads on request identity, not a new loader closure. Rows are caller-owned metadata.
  const [data, setData] = useState({ rows, version: 0 });
  if (data.rows !== rows) setData({ rows, version: data.version + 1 });
  const loadPage = useCallback(async (): Promise<ApiResponse<GroupedPageResult<T>>> => ({
    outcome: rows.length ? 'ok' : 'empty', data: { rows, total: rows.length },
    trust: null, assessments: [], correlationId: 'feature-page',
  }), [rows]);
  return <PlatformDataTable title="토큰" hideTitle ariaLabel="토큰 목록" columns={columns} getRowId={row => row.id}
    loadPage={loadPage} filterKey={String(data.version)} rowAction={rowAction} externalPagination={{ summary, controls: pagination }}
    preferenceKey={preferenceKey} />;
}
