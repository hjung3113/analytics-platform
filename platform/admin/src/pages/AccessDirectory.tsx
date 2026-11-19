import { useMessages, useI18n, usePlatform } from '@ap/kernel';
import { ADMIN_MESSAGES } from '../messages';
import { useMemo, useState } from 'react';
import { type AccessPrincipal, type ColumnFilter, isAnswered } from '@ap/contracts';
import { PanelRight } from 'lucide-react';
import { useClearFiltersAction, useTableFilterDeclaration, type TableFilterDeclaration, DetailDrawer, RowAction, ManagementLayout, type PlatformColumn, PlatformDataTable, PlatformPage, PageKeyWarning, TableUrlWarning, usePageKeyRules, useTableUrlState } from '@ap/components';
import { Button, StatusBadge } from '@ap/ui';
import { grantTotals, menusForPermissions } from '../access-rows';
import { SORT_FIELDS } from '../access-query';
import { invalidText } from '../token';
import { accessFilterSpecs, accessValueCheck, toAccessQuery } from '../access-filters';

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
  const m = useMessages(ADMIN_MESSAGES);
  const { lang } = useI18n();
  const { adapter, registry, pageParam, setPage } = usePlatform();
  const focus = pageParam('focus');
  // §13 drawer tab is URL-owned like the other page keys (W-350): the default stays off the URL and an
  // unknown value is the drawer alert — always controlled, so history traversal restores the alert.
  const drawerTab = pageParam('tab') ?? 'permissions';
  // ADR-0105: 역할 and 권한 are conditions of one hidden repeated page key `filter`.
  const filterDeclarations = useMemo<TableFilterDeclaration[]>(() => {
    const specs = accessFilterSpecs(registry.permissions);
    return [
      { id: 'role', label: ADMIN_MESSAGES.accessDirectoryRole, spec: specs.role, pinned: true },
      { id: 'permission', label: ADMIN_MESSAGES.accessDirectoryPermission, spec: specs.permission, pinned: true, column: false },
    ];
  }, [registry.permissions]);
  const validate = useMemo(() => accessValueCheck(registry.permissions), [registry.permissions]);
  const { urlFilters, filterColumnProps, filterFields } = useTableFilterDeclaration('filter', filterDeclarations, { lang, validate });
  // A user sort/page/filter change moves rows between pages, so the focused row leaves with them (bot review P2).
  const { urlState, invalid, sentences, recoverKeys, cause } = useTableUrlState(SORT_FIELDS, { extraPatch: reason => reason === 'user' ? { focus: null, tab: null } : undefined, filters: urlFilters });
  const conditions = urlState?.filters ?? NO_FILTERS;
  const clearButton = useClearFiltersAction({ filterKey: urlFilters.key, hasFilters: conditions.length > 0, extraKeys: ['focus', 'tab'] });
  // `focus` selects the drawer row and is never sent to accessDirectory: a malformed one alerts (adapter not called), an unknown one is the drawer alert.
  const focusRule = usePageKeyRules([{ key: 'focus', label: ADMIN_MESSAGES.accessDirectoryDetailTarget, valid: raw => !invalidText(raw) }]);
  const ready = !invalid && !focusRule.invalid;
  const columns = useMemo<PlatformColumn<AccessPrincipal>[]>(() => [
    { id: 'name', header: m('accessDirectoryName') },
    { ...filterColumnProps('role'), cell: row => mono(row.role) },
    { id: 'title', header: m('accessDirectoryTitle'), sortable: false, value: row => row.title[lang] },
    { id: 'permissionCount', header: m('accessDirectoryPermissions'), value: row => row.permissions.length },
    {
      id: 'grantCount',
      header: m('accessDirectoryRoomGrants'),
      value: row => grantTotals(row).granted,
      cell: row => {
        const totals = grantTotals(row);
        return <span className="tabular">{totals.granted}/{totals.total}</span>;
      },
    },
    { id: 'menus', header: m('accessDirectoryMenus'), sortable: false, value: row => menusForPermissions(registry, row.permissions).length },
  ], [m, lang, registry, filterColumnProps]);
  // The drawer reads the loaded page's rows (the last loadPage result) — no second adapter call for a row.
  // Null until the current page request answered ok or empty: before that, and after forbidden/error/timeout, the page cannot
  // say a focus is unknown (06 §17 — no access and not loaded are not "no such principal").
  const [rows, setRows] = useState<readonly AccessPrincipal[] | null>(null);
  const active = ready && focus && rows ? rows.find(p => p.id === focus) : undefined;
  // Computed outside JSX children: a multi-line JSX ternary in children is a parser trap.
  const drawer = ready && focus && rows ? (active
    ? <DetailDrawer key={active.id} id={active.id} title={active.name} subtitle={active.title[lang]}
        context={<span className="flex items-center gap-2"><span className="t-mono">{active.role}</span><StatusBadge tone="neutral">{m('accessDirectoryReadOnly')}</StatusBadge></span>}
        onClose={() => setPage({ focus: null, tab: null })}
        tab={drawerTab} onTabRecover={() => setPage({ tab: null })} onTabChange={tab => setPage({ tab: tab === 'permissions' ? null : tab })}
        tabs={[
          {
            id: 'permissions',
            label: m('accessDirectoryPermissions2'),
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
                            {menu.spaceGated && <StatusBadge tone="neutral">{m('accessDirectorySpace')}</StatusBadge>}
                            {menu.missingPermissions.length > 0 && <StatusBadge tone="neutral">{m('accessDirectoryNeeds', { value: menu.missingPermissions.join(', ') })}</StatusBadge>}
                          </span>
                        </li>)}
                      </ul>
                    : <p className="text-xs text-text-muted">{m('accessDirectoryNoRegistryMenuDeclaresThisPermission')}</p>}
                </div>;
              })}
            </div>,
          },
          {
            id: 'sites',
            label: m('accessDirectorySiteScope'),
            content: <ul className="grid gap-1.5 text-sm">
              {active.sites.map(site => <li key={site.id} className="flex items-center justify-between gap-2 rounded-sm bg-surface-sunken px-2 py-1">
                <span>{site.label}</span>
                <span className="flex items-center gap-2">
                  <span className="tabular">{site.grantedRooms.length}/{site.totalRooms}</span>
                  {site.grantedRooms.length
                    ? <span className="t-mono">{site.grantedRooms.join(', ')}</span>
                    : <span className="text-text-secondary">{m('accessDirectoryNoRoomsGranted')}</span>}
                </span>
              </li>)}
            </ul>,
          },
        ]} />
    : <div role="alert" className="p-3">
        {/* Only the loaded page is known here: absence from it is not proof the principal does not exist. */}
        <p>{m('accessDirectoryPrincipalNotOnThisPage')} <span className="t-mono">{focus}</span></p>
        <Button size="sm" variant="secondary" className="mt-2" onClick={() => setPage({ focus: null, tab: null })}>{m('accessDirectoryClose')}</Button>
      </div>) : null;
  return <PlatformPage description={m('accessDirectoryPermissionsAndRoomGrantsByRoleReadOnly')}>
    <ManagementLayout drawer={drawer}
      table={invalid ? <TableUrlWarning sentences={sentences} recoverKeys={recoverKeys} cause={cause} />
        : focusRule.invalid ? <PageKeyWarning sentences={focusRule.sentences} onRecover={focusRule.recover} /> :
    <PlatformDataTable<AccessPrincipal>
        title={m('accessDirectoryRolesAccess')}
        ariaLabel={m('accessDirectoryRolesAndAccessList')}
        subtitle={m('accessDirectoryReadOnlyPermissionsAndRoomGrants')}
        columns={columns} filterFields={filterFields} getRowId={row => row.id}
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
          if (!signal.aborted) setRows(isAnswered(response.outcome) ? response.data?.items ?? [] : null);
          return {
            outcome: response.outcome,
            data: response.data === null ? null : { rows: [...response.data.items], total: response.data.total },
            assessments: response.assessments,
            trust: response.trust,
            correlationId: response.correlationId,
            ...(response.message !== undefined && { message: response.message }),
          };
        }}
        emptyAction={clearButton}
        rowAction={(row, { compact }) => <RowAction compact={compact} icon={PanelRight} label={m('accessDirectoryView', { id: row.id })} text={m('accessDirectoryView2')} onClick={() => setPage({ focus: row.id, tab: null })} />}
      />} />
  </PlatformPage>;
}
