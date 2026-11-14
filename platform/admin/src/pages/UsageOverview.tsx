import { useMemo } from 'react';
import { type UsageSummary } from '@ap/contracts';
import { AlertTriangle, PanelRight } from 'lucide-react';
import { Button } from '@ap/ui';
import UsageNextScreens from './UsageNextScreens';
import { useI18n, usePlatform, usePlatformQuery } from '@ap/kernel';
import { DetailDrawer, RowAction, StateMessage, type PlatformColumn, PlatformDataTable, PlatformPage, QueryView, sortAndPage, TableUrlWarning, useTableUrlState } from '@ap/components';
import { formatLastUsed, joinUsageRows, type UsageRow } from '../usage-rows';

const SORT_FIELDS = ['id', 'spaceId', 'visits', 'distinctUsers', 'backRate', 'searchEntryRate', 'lastUsedAt'] as const;

const rateText = (rate: number | null | undefined) => rate == null ? '—' : `${(rate * 100).toFixed(1)}%`;

/**
 * 메뉴 활용률 (docs/05 메뉴 활용률 계측; 06 §4 — kernel observability, a throwaway consumer of the usage port).
 * Reads the injected adapter's aggregate only; the raw event store is never a client concern.
 */
export default function UsageOverview() {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { adapter, registry, pageParam, setPage } = usePlatform();
  const focus = pageParam('focus');
  const active = registry.menus.find(menu => menu.id === focus);
  // Session identity: period·room changes must not hide the counts.
  const q = usePlatformQuery<UsageSummary>(signal => adapter.usageSummary({ preset: 'all' }, signal), null, true, 'session');
  // §6.1 page keys (sort/page): invalid wire values alert instead of substituting — same as EquipmentMaster.
  // #304 FIX1 (06 §19): the warning keeps each field's user name and the raw value as entered (quoted,
  // untruncated), one sentence per field — never `key=value`.
  const { urlState: tableUrlState, invalid: tableInvalid, sentences: invalidTableSentences } = useTableUrlState(SORT_FIELDS, { extraPatch: reason => reason === 'user' ? { focus: null } : undefined });
  const columns = useMemo<PlatformColumn<UsageRow>[]>(() => [
    { id: 'id', header: ko ? '메뉴 ID' : 'Menu ID', size: 112, cell: row => <span className="t-mono block truncate" title={row.id}>{row.id}</span> },
    { id: 'label', header: ko ? '메뉴' : 'Menu', size: 128, sortable: false, cell: row => row.label[lang] },
    { id: 'spaceId', header: ko ? '공간' : 'Space', size: 100, cell: row => row.spaceLabel[lang] },
    { id: 'visits', header: ko ? '방문' : 'Visits', size: 70, align: 'right' },
    { id: 'distinctUsers', header: ko ? '방문 사용자' : 'Distinct users', size: 100, align: 'right' },
    ...(['backRate', 'searchEntryRate'] as const).map(id => ({
      id, header: id === 'backRate' ? (ko ? '뒤로 나감' : 'Back rate') : (ko ? '검색 진입' : 'Search entry'), size: 100, align: 'right' as const,
      cell: (row: UsageRow) => rateText(q.response?.data?.menus.find(menu => menu.menuId === row.id)?.[id]),
    })),
    {
      id: 'lastUsedAt', header: ko ? '마지막 사용' : 'Last used', size: 150, align: 'right',
      cell: row => formatLastUsed(row.lastUsedAt, lang),
    },
  ], [ko, lang, q.response]);
  return <PlatformPage description={ko ? '메뉴 진입·체류 이벤트 집계 (식별 필드만 수집)' : 'Menu entry and dwell event aggregates (identity fields only)'}>
    {tableInvalid ? <TableUrlWarning sentences={invalidTableSentences} />
      : <QueryView widgetName={ko ? '메뉴 활용률' : 'Menu usage'} query={q}>{data => {
        const rows = joinUsageRows(registry, data.menus);
        // Client envelope: the rows are the registry join, not mart data — trust is null and paging stays client-side.
        // #1167 B-1: the page head already shows this title; keep it for the outline only, the table's name is ariaLabel.
        return <PlatformDataTable<UsageRow>
          title={ko ? '메뉴 활용률' : 'Menu usage'}
          hideTitle
          ariaLabel={ko ? '메뉴 활용률 목록' : 'Menu usage list'}
          subtitle={ko ? '방문 사용자는 세션 사용자 기준으로 집계합니다.' : 'Distinct users are counted per session user.'}
          columns={columns} getRowId={row => row.id}
          preferenceKey="admin-usage:columns:v2" pageSize={25}
          urlState={tableUrlState} activeRowId={focus}
          rowAction={(row, { compact }) => <RowAction compact={compact} icon={PanelRight} label={ko ? `${row.id} 보기` : `View ${row.id}`} text={ko ? '보기' : 'View'} onClick={() => setPage({ focus: row.id })} />}
          loadPage={async page => {
            const sort = page.sorting[0];
            let ordered = rows;
            // Both directions keep unavailable rates last; shared sortAndPage reverses nulls for desc.
            if (sort?.id === 'backRate' || sort?.id === 'searchEntryRate') {
              const field = sort.id as 'backRate' | 'searchEntryRate';
              const rates = new Map(data.menus.map(menu => [menu.menuId, menu[field]]));
              ordered = [...rows].sort((a, b) => {
                const av = rates.get(a.id); const bv = rates.get(b.id);
                return av == null ? (bv == null ? 0 : 1) : bv == null ? -1 : (sort.desc ? bv - av : av - bv);
              });
            }
            return { outcome: 'ok', data: sortAndPage(ordered, { ...page, sorting: ordered === rows ? page.sorting : [] }), assessments: [], trust: null, correlationId: 'client-usage' };
          }}
        />;
      }}</QueryView>}
    {!tableInvalid && focus && (active
      ? <DetailDrawer key={active.id} title={active.label[lang]} subtitle={ko ? '다음으로 간 화면 · 주 화면 기준' : 'Next screens · main-screen entries'} onClose={() => setPage({ focus: null })}
          tabs={[{ id: 'next', label: ko ? '다음으로 간 화면' : 'Next screens', content: <UsageNextScreens menuId={active.id} /> }]} />
      : <StateMessage tone="danger" icon={<AlertTriangle aria-hidden />} title={ko ? '등록되지 않은 메뉴입니다' : 'This menu is not registered'}
          action={<Button size="sm" variant="secondary" onClick={() => setPage({ focus: null })}>{ko ? '닫기' : 'Close'}</Button>} />)}
  </PlatformPage>;
}
