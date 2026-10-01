import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { type Text, type UsageSummary } from '@ap/contracts';
import { useI18n, usePlatform, usePlatformQuery } from '@ap/kernel';
import { encodeTableSort, parsePageIndex, parseTableSort, PlatformDataTable, PlatformPage, QueryView, sortAndPage } from '@ap/components';
import { Button } from '@ap/ui';
import { formatLastUsed, joinUsageRows, type UsageRow } from '../usage-rows';

const SORT_FIELDS = ['id', 'spaceId', 'visits', 'distinctUsers', 'lastUsedAt'] as const;

/**
 * 메뉴 활용률 (docs/05 메뉴 활용률 계측; 06 §4 — kernel observability, a throwaway consumer of the usage port).
 * Reads the injected adapter's aggregate only; the raw event store is never a client concern.
 */
export default function UsageOverview() {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { adapter, registry, pageParam, setPage } = usePlatform();
  // Session identity: period·room changes must not hide the counts.
  const q = usePlatformQuery<UsageSummary>(signal => adapter.usageSummary({ preset: 'all' }, signal), null, true, 'session');
  // §6.1 page keys (sort/page): invalid wire values alert instead of substituting — same as EquipmentMaster.
  const parsedSort = parseTableSort(pageParam('sort'), SORT_FIELDS);
  const parsedPage = parsePageIndex(pageParam('page'));
  const tableInvalid = !parsedSort.ok || !parsedPage.ok;
  const columns = useMemo<ColumnDef<UsageRow>[]>(() => [
    { accessorKey: 'id', header: ko ? '메뉴 ID' : 'Menu ID', cell: info => <span className="t-mono">{String(info.getValue())}</span> },
    { accessorKey: 'label', header: ko ? '메뉴' : 'Menu', enableSorting: false, cell: info => (info.getValue() as Text)[lang] },
    { accessorKey: 'spaceId', header: ko ? '공간' : 'Space' },
    { accessorKey: 'visits', header: ko ? '방문' : 'Visits', meta: { align: 'right' } },
    { accessorKey: 'distinctUsers', header: ko ? '방문 사용자' : 'Distinct users', meta: { align: 'right' } },
    {
      accessorKey: 'lastUsedAt', header: ko ? '마지막 사용' : 'Last used', meta: { align: 'right' },
      cell: info => formatLastUsed(info.getValue() as number | null, lang),
    },
  ], [ko, lang]);
  return <PlatformPage description={ko ? '메뉴 진입·체류 이벤트의 집계입니다. v1은 식별 필드만 수집합니다(#75 결정 대기).' : 'Aggregates of menu entry and dwell events. v1 collects identity fields only (#75 pending).'}>
    {tableInvalid ? <p role="alert">{ko ? '정렬·페이지 값이 잘못되었습니다.' : 'Invalid sort or page value.'} <Button size="sm" variant="secondary" onClick={() => setPage({ sort: null, page: null })}>{ko ? '초기화' : 'Reset'}</Button></p>
      : <QueryView query={q}>{data => {
        const rows = joinUsageRows(registry, data.menus);
        // Client envelope: the rows are the registry join, not mart data — trust is null and paging stays client-side.
        return <PlatformDataTable<UsageRow>
          title={ko ? '메뉴 활용률' : 'Menu usage'}
          ariaLabel={ko ? '메뉴 활용률 목록' : 'Menu usage list'}
          subtitle={ko ? '사용자는 세션 사용자 id다. 이 mock에서는 역할(admin/engineer/viewer)이라 사람 수가 아니다.' : 'A user is a session user id. In this mock it is a role (admin/engineer/viewer), not a person count.'}
          columns={columns} getRowId={row => row.id} filterKey=""
          preferenceKey="admin-usage:columns:v1" pageSize={25}
          urlState={parsedSort.ok && parsedPage.ok ? {
            page: parsedPage.page === 1 ? null : parsedPage.page,
            sorting: parsedSort.sorting,
            onChange: ({ page, sorting }) => setPage({ sort: encodeTableSort(sorting), page: page === null ? null : String(page) }),
          } : undefined}
          loadPage={async page => ({ outcome: 'ok', data: sortAndPage(rows, page), assessments: [], trust: null, correlationId: 'client-usage' })}
        />;
      }}</QueryView>}
  </PlatformPage>;
}
