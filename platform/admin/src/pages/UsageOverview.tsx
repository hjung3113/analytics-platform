import { useMemo } from 'react';
import { type UsageSummary } from '@ap/contracts';
import { useI18n, usePlatform, usePlatformQuery } from '@ap/kernel';
import { type PlatformColumn, PlatformDataTable, PlatformPage, QueryView, sortAndPage, TableUrlWarning, useTableUrlState } from '@ap/components';
import { formatLastUsed, joinUsageRows, type UsageRow } from '../usage-rows';

const SORT_FIELDS = ['id', 'spaceId', 'visits', 'distinctUsers', 'lastUsedAt'] as const;

/**
 * 메뉴 활용률 (docs/05 메뉴 활용률 계측; 06 §4 — kernel observability, a throwaway consumer of the usage port).
 * Reads the injected adapter's aggregate only; the raw event store is never a client concern.
 */
export default function UsageOverview() {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { adapter, registry } = usePlatform();
  // Session identity: period·room changes must not hide the counts.
  const q = usePlatformQuery<UsageSummary>(signal => adapter.usageSummary({ preset: 'all' }, signal), null, true, 'session');
  // §6.1 page keys (sort/page): invalid wire values alert instead of substituting — same as EquipmentMaster.
  // #304 FIX1 (06 §19): the warning keeps each field's user name and the raw value as entered (quoted,
  // untruncated), one sentence per field — never `key=value`.
  const { urlState: tableUrlState, invalid: tableInvalid, sentences: invalidTableSentences } = useTableUrlState(SORT_FIELDS);
  const columns = useMemo<PlatformColumn<UsageRow>[]>(() => [
    { id: 'id', header: ko ? '메뉴 ID' : 'Menu ID', cell: row => <span className="t-mono">{String(row.id)}</span> },
    { id: 'label', header: ko ? '메뉴' : 'Menu', sortable: false, cell: row => row.label[lang] },
    { id: 'spaceId', header: ko ? '공간' : 'Space', cell: row => row.spaceLabel[lang] },
    { id: 'visits', header: ko ? '방문' : 'Visits', align: 'right' },
    { id: 'distinctUsers', header: ko ? '방문 사용자' : 'Distinct users', align: 'right' },
    {
      id: 'lastUsedAt', header: ko ? '마지막 사용' : 'Last used', align: 'right',
      cell: row => formatLastUsed(row.lastUsedAt, lang),
    },
  ], [ko, lang]);
  return <PlatformPage description={ko ? '메뉴 진입·체류 이벤트의 집계입니다. 식별 필드만 수집합니다.' : 'Aggregates of menu entry and dwell events. Collects identity fields only.'}>
    {tableInvalid ? <TableUrlWarning sentences={invalidTableSentences} />
      : <QueryView widgetName={ko ? '메뉴 활용률' : 'Menu usage'} query={q}>{data => {
        const rows = joinUsageRows(registry, data.menus);
        // Client envelope: the rows are the registry join, not mart data — trust is null and paging stays client-side.
        // #1167 B-1: the page head already shows this title; keep it for the outline only, the table's name is ariaLabel.
        return <PlatformDataTable<UsageRow>
          title={<span className="sr-only">{ko ? '메뉴 활용률' : 'Menu usage'}</span>}
          ariaLabel={ko ? '메뉴 활용률 목록' : 'Menu usage list'}
          subtitle={ko ? '방문 사용자는 세션 사용자 기준으로 집계합니다.' : 'Distinct users are counted per session user.'}
          columns={columns} getRowId={row => row.id}
          preferenceKey="admin-usage:columns:v1" pageSize={25}
          urlState={tableUrlState}
          loadPage={async page => ({ outcome: 'ok', data: sortAndPage(rows, page), assessments: [], trust: null, correlationId: 'client-usage' })}
        />;
      }}</QueryView>}
  </PlatformPage>;
}
