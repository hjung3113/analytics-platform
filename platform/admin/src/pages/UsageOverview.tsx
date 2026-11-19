import { useMessages, useI18n, usePlatform, usePlatformQuery } from '@ap/kernel';
import { ADMIN_MESSAGES } from '../messages';
import { useMemo } from 'react';
import { type UsageSummary } from '@ap/contracts';
import { AlertTriangle, PanelRight } from 'lucide-react';
import { Button } from '@ap/ui';
import UsageNextScreens from './UsageNextScreens';
import { DetailDrawer, RowAction, StateMessage, type PlatformColumn, PlatformDataTable, PlatformPage, QueryView, sortAndPage, TableUrlWarning, useTableUrlState } from '@ap/components';
import { formatLastUsed, joinUsageRows, type UsageRow } from '../usage-rows';

const SORT_FIELDS = ['id', 'spaceId', 'visits', 'distinctUsers', 'backRate', 'searchEntryRate', 'lastUsedAt'] as const;

const rateText = (rate: number | null | undefined) => rate == null ? '—' : `${(rate * 100).toFixed(1)}%`;

/**
 * 메뉴 활용률 (docs/05 메뉴 활용률 계측; 06 §4 — kernel observability, a throwaway consumer of the usage port).
 * Reads the injected adapter's aggregate only; the raw event store is never a client concern.
 */
export default function UsageOverview() {
  const m = useMessages(ADMIN_MESSAGES);
  const { lang } = useI18n();
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
    { id: 'id', header: m('usageOverviewMenuID'), size: 112, cell: row => <span className="t-mono block truncate" title={row.id}>{row.id}</span> },
    { id: 'label', header: m('usageOverviewMenu'), size: 128, sortable: false, cell: row => row.label[lang] },
    { id: 'spaceId', header: m('usageOverviewSpace'), size: 100, cell: row => row.spaceLabel[lang] },
    { id: 'visits', header: m('usageOverviewVisits'), size: 70, align: 'right' },
    { id: 'distinctUsers', header: m('usageOverviewDistinctUsers'), size: 100, align: 'right' },
    ...(['backRate', 'searchEntryRate'] as const).map(id => ({
      id, header: id === 'backRate' ? m('usageOverviewBackRate') : m('usageOverviewSearchEntry'), size: 100, align: 'right' as const,
      cell: (row: UsageRow) => rateText(q.response?.data?.menus.find(menu => menu.menuId === row.id)?.[id]),
    })),
    {
      id: 'lastUsedAt', header: m('usageOverviewLastUsed'), size: 150, align: 'right',
      cell: row => formatLastUsed(row.lastUsedAt, lang),
    },
  ], [m, lang, q.response]);
  return <PlatformPage description={m('usageOverviewMenuEntryAndDwellEventAggregatesIdentity')}>
    {tableInvalid ? <TableUrlWarning sentences={invalidTableSentences} />
      : <QueryView widgetName={m('usageOverviewMenuUsage')} query={q}>{data => {
        const rows = joinUsageRows(registry, data.menus);
        // Client envelope: the rows are the registry join, not mart data — trust is null and paging stays client-side.
        // #1167 B-1: the page head already shows this title; keep it for the outline only, the table's name is ariaLabel.
        return <PlatformDataTable<UsageRow>
          title={m('usageOverviewMenuUsage2')}
          hideTitle
          ariaLabel={m('usageOverviewMenuUsageList')}
          subtitle={m('usageOverviewDistinctUsersAreCountedPerSessionUser')}
          columns={columns} getRowId={row => row.id}
          preferenceKey="admin-usage:columns:v2" pageSize={25}
          urlState={tableUrlState} activeRowId={focus}
          rowAction={(row, { compact }) => <RowAction compact={compact} icon={PanelRight} label={m('usageOverviewView', { id: row.id })} text={m('usageOverviewView2')} onClick={() => setPage({ focus: row.id })} />}
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
      ? <DetailDrawer key={active.id} id={active.id} title={active.label[lang]} subtitle={m('usageOverviewNextScreensMainScreenEntries')} onClose={() => setPage({ focus: null })}
          tabs={[{ id: 'next', label: m('usageOverviewNextScreens'), content: <UsageNextScreens menuId={active.id} /> }]} />
      : <StateMessage tone="danger" icon={<AlertTriangle aria-hidden />} title={m('usageOverviewThisMenuIsNotRegistered')}
          action={<Button size="sm" variant="secondary" onClick={() => setPage({ focus: null })}>{m('usageOverviewClose')}</Button>} />)}
  </PlatformPage>;
}
