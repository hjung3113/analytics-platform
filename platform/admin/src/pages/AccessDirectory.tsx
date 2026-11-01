import { useMemo, useState } from 'react';
import { type AccessPrincipal, type ColumnFilter } from '@ap/contracts';
import { useI18n, usePlatform } from '@ap/kernel';
import { PanelRight } from 'lucide-react';
import { DetailDrawer, RowAction, ManagementLayout, type PlatformColumn, PlatformDataTable, PlatformPage, PageKeyWarning, TableUrlWarning, usePageKeyRules, useTableUrlState, type TableFilterField } from '@ap/components';
import { Button, StatusBadge } from '@ap/ui';
import { grantTotals, menusForPermissions } from '../access-rows';
import { SORT_FIELDS, invalidText } from '../access-query';
import { accessFilterSpecs, accessLegacyKeys, accessValueCheck, toAccessQuery } from '../access-filters';

const NO_FILTERS: ColumnFilter[] = [];

const mono = (value: unknown) => <span className="t-mono">{String(value)}</span>;

/**
 * 권한/역할 (issue #49, 06 §12.3 management list). Read-only console directory over the accessDirectory
 * port: the server sorts and pages, the client never re-sorts a page, and the default (no sort key) is
 * the server's role-ascending. The menu list in the drawer is the registry joined to the principal's
 * permission set client-side — a declaration, not an authorization proof. This screen grants and revokes
 * nothing: room/individual grants are meta-DB owned but the role-membership source stays open (issue #98). Not mart data, so there is no trust indicator.
 */
export default function AccessDirectory() {
  const { t, lang } = useI18n();
  const ko = lang === 'ko';
  const { adapter, registry, pageParam, setPage } = usePlatform();
  const focus = pageParam('focus');
  // §13 drawer tab is URL-owned like the other page keys (W-350): the default stays off the URL and an
  // unknown value is the drawer alert — always controlled, so history traversal reselects the alert tab.
  const drawerTab = pageParam('tab') ?? 'permissions';
  const validTab = ['permissions', 'sites'].includes(drawerTab);
  // ADR-0105: 역할 and 권한 are conditions of one hidden repeated page key `filter`; the old `role=` / `permission=` links are read for one release and rewritten.
  const specs = useMemo(() => accessFilterSpecs(registry.permissions), [registry.permissions]);
  const urlFilters = useMemo(() => ({
    key: 'filter', specs, legacy: accessLegacyKeys(registry.permissions), validate: accessValueCheck(registry.permissions),
    labels: { role: ko ? '역할' : 'Role', permission: ko ? '권한' : 'Permission' },
  }), [specs, registry.permissions, ko]);
  // A user sort/page/filter change moves rows between pages, so the focused row leaves with them (bot review P2).
  const { urlState, invalid, sentences, recoverKeys, cause } = useTableUrlState(SORT_FIELDS, { extraPatch: reason => reason === 'user' ? { focus: null, tab: null } : undefined, filters: urlFilters });
  const conditions = urlState?.filters ?? NO_FILTERS;
  // `focus` selects the drawer row and is never sent to accessDirectory: a malformed one alerts (adapter not called), an unknown one is the drawer alert.
  const focusRule = usePageKeyRules([{ key: 'focus', label: { ko: '상세 대상', en: 'Detail target' }, valid: raw => !invalidText(raw) }]);
  const ready = !invalid && !focusRule.invalid;
  const filterFields = useMemo<TableFilterField[]>(() => [{ id: 'permission', label: { ko: '권한', en: 'Permission' }, spec: specs.permission, pinned: true }], [specs]);
  const columns = useMemo<PlatformColumn<AccessPrincipal>[]>(() => [
    { id: 'name', header: ko ? '이름' : 'Name' },
    { id: 'role', header: ko ? '역할' : 'Role', filter: specs.role, filterPinned: true, cell: row => mono(row.role) },
    { id: 'title', header: ko ? '직책' : 'Title', sortable: false, value: row => row.title[lang] },
    { id: 'permissionCount', header: ko ? '권한 수' : 'Permissions', value: row => row.permissions.length },
    {
      id: 'grantCount',
      header: ko ? 'room 부여' : 'Room grants',
      value: row => grantTotals(row).granted,
      cell: row => {
        const totals = grantTotals(row);
        return <span className="tabular">{totals.granted}/{totals.total}</span>;
      },
    },
    { id: 'menus', header: ko ? '메뉴' : 'Menus', sortable: false, value: row => menusForPermissions(registry, row.permissions).length },
  ], [ko, lang, registry, specs]);
  // The drawer reads the loaded page's rows (the last loadPage result) — no second adapter call for a row.
  // Null until the current page request answered ok or empty: before that, and after forbidden/error/timeout, the page cannot
  // say a focus is unknown (06 §17 — no access and not loaded are not "no such principal").
  const [rows, setRows] = useState<readonly AccessPrincipal[] | null>(null);
  const active = ready && focus && rows ? rows.find(p => p.id === focus) : undefined;
  // Computed outside JSX children: a multi-line JSX ternary in children is a parser trap.
  const drawer = ready && focus && rows ? (active
    ? <DetailDrawer key={active.id} title={active.name} subtitle={active.title[lang]}
        context={<span className="flex items-center gap-2"><span className="t-mono">{active.role}</span><StatusBadge tone="neutral">{ko ? '조회 전용' : 'Read-only'}</StatusBadge></span>}
        onClose={() => setPage({ focus: null, tab: null })}
        tab={validTab ? drawerTab : 'invalid'} onTabChange={tab => setPage({ tab: tab === 'permissions' ? null : tab })}
        tabs={validTab ? [
          {
            id: 'permissions',
            label: ko ? '권한' : 'Permissions',
            content: <div className="grid gap-3">
              {active.permissions.map(permission => {
                const joined = menusForPermissions(registry, active.permissions).filter(m => m.permission === permission);
                return <div key={permission} className="grid gap-1">
                  <p className="t-mono text-sm font-medium">{permission}</p>
                  {joined.length
                    ? <ul className="grid gap-1">
                        {joined.map(menu => <li key={menu.id} className="flex items-center justify-between gap-2 rounded-sm bg-surface-sunken px-2 py-1 text-sm">
                          <span>{menu.label[lang]} <span className="t-mono text-text-secondary">{menu.id}</span></span>
                          <span className="flex items-center gap-2">
                            <span className="t-mono text-text-secondary">{menu.path}</span>
                            {menu.spaceId === null && <StatusBadge tone="neutral">{menu.spaceLabel[lang]}</StatusBadge>}
                            {menu.spaceGated && <StatusBadge tone="neutral">{ko ? '공간' : 'space'}</StatusBadge>}
                            {menu.missingPermissions.length > 0 && <StatusBadge tone="neutral">{ko ? `추가 권한 필요: ${menu.missingPermissions.join(', ')}` : `needs ${menu.missingPermissions.join(', ')}`}</StatusBadge>}
                          </span>
                        </li>)}
                      </ul>
                    : <p className="text-xs text-text-muted">{ko ? '이 권한으로 열리는 메뉴가 레지스트리에 없습니다.' : 'No registry menu declares this permission.'}</p>}
                </div>;
              })}
            </div>,
          },
          {
            id: 'sites',
            label: ko ? '사이트 범위' : 'Site scope',
            content: <ul className="grid gap-1.5 text-sm">
              {active.sites.map(site => <li key={site.id} className="flex items-center justify-between gap-2 rounded-sm bg-surface-sunken px-2 py-1">
                <span>{site.label}</span>
                <span className="flex items-center gap-2">
                  <span className="tabular">{site.grantedRooms.length}/{site.totalRooms}</span>
                  {site.grantedRooms.length
                    ? <span className="t-mono">{site.grantedRooms.join(', ')}</span>
                    : <span className="text-text-secondary">{ko ? '부여 없음' : 'No rooms granted'}</span>}
                </span>
              </li>)}
            </ul>,
          },
        ] : [{
          id: 'invalid',
          label: ko ? '알 수 없는 탭' : 'Unregistered tab',
          content: <p role="alert">{ko ? '등록되지 않은 탭입니다.' : 'This tab is not registered.'} <Button size="sm" variant="secondary" onClick={() => setPage({ tab: null })}>{ko ? '권한 열기' : 'Open permissions'}</Button></p>,
        }]} />
    : <div role="alert" className="p-3">
        {/* Only the loaded page is known here: absence from it is not proof the principal does not exist. */}
        <p>{ko ? '이 페이지에 없는 주체입니다.' : 'Principal not on this page.'} <span className="t-mono">{focus}</span></p>
        <Button size="sm" variant="secondary" className="mt-2" onClick={() => setPage({ focus: null, tab: null })}>{ko ? '닫기' : 'Close'}</Button>
      </div>) : null;
  return <PlatformPage description={ko
    ? '조회 전용 화면입니다. 권한 부여·회수는 하지 않습니다.'
    : 'Read-only view. Grants and revocations are not made here.'}>
    <ManagementLayout drawer={drawer}
      table={() => invalid ? <TableUrlWarning sentences={sentences} recoverKeys={recoverKeys} cause={cause} />
        : focusRule.invalid ? <PageKeyWarning sentences={focusRule.sentences} onRecover={focusRule.recover} /> :
    <PlatformDataTable<AccessPrincipal>
        title={ko ? '권한/역할' : 'Roles & access'}
        ariaLabel={ko ? '권한/역할 목록' : 'Roles and access list'}
        subtitle={ko ? '권한·room 부여 조회 전용입니다.' : 'Read-only permissions and room grants.'}
        columns={columns} filterFields={filterFields} getRowId={row => row.id} filterKey=""
        preferenceKey="admin-roles:columns:v1" pageSize={25} activeRowId={focus ?? undefined}
        urlState={urlState}
        loadPage={async (pageQuery, signal) => {
          // A new request voids the last answer: until it settles ok/empty, neither the old drawer nor an
          // "unknown" verdict speaks for the current query (a rejected request leaves them void too).
          setRows(null);
          // The port answers AccessDirectoryPage { items, total }; the table wants PageResult { rows, total }.
          const response = await adapter.accessDirectory(toAccessQuery(pageQuery.filters ?? NO_FILTERS, { page: pageQuery.page + 1, pageSize: 25, sorting: pageQuery.sorting }), signal);
          // Keep drawer data aligned with the latest non-aborted page result. ok/empty are answers about
          // principals; any other outcome clears them so neither a stale drawer nor an "unknown" alert survives.
          if (!signal.aborted) setRows(response.outcome === 'ok' || response.outcome === 'empty' ? response.data?.items ?? [] : null);
          return {
            outcome: response.outcome,
            data: response.data === null ? null : { rows: [...response.data.items], total: response.data.total },
            assessments: response.assessments,
            trust: response.trust,
            correlationId: response.correlationId,
            ...(response.message !== undefined && { message: response.message }),
          };
        }}
        emptyAction={conditions.length > 0 ? <Button type="button" size="sm" variant="secondary" onClick={() => setPage({ filter: null, page: null, focus: null, tab: null })}>{t('clearFilters')}</Button> : null}
        rowAction={(row, { compact }) => <RowAction compact={compact} icon={PanelRight} label={ko ? `${row.id} 보기` : `View ${row.id}`} text={ko ? '보기' : 'View'} onClick={() => setPage({ focus: row.id, tab: null })} />}
      />} />
  </PlatformPage>;
}
