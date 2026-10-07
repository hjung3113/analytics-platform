import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { PERMISSIONS, type AccessPrincipal, type AccessSortField } from '@ap/contracts';
import { useI18n, usePlatform } from '@ap/kernel';
import { DetailDrawer, ManagementLayout, PageFilterBar, type PlatformColumn, PlatformDataTable, PlatformPage, encodeTableSort } from '@ap/components';
import { Button, StatusBadge } from '@ap/ui';
import { grantTotals, menusForPermissions } from '../access-rows';
import { ACCESS_PAGE_KEYS, parseAccessKeys } from '../access-query';

const mono = (value: unknown) => <span className="t-mono">{String(value)}</span>;

/**
 * 권한/역할 (issue #49, 06 §12.3 management list). Read-only console directory over the accessDirectory
 * port: the server sorts and pages, the client never re-sorts a page, and the default (no sort key) is
 * the server's role-ascending. The menu list in the drawer is the registry joined to the principal's
 * permission set client-side — a declaration, not an authorization proof. This screen grants and revokes
 * nothing: room/individual grants are meta-DB owned but the role-membership source stays open (issue #98). Not mart data, so there is no trust indicator.
 */
export default function AccessDirectory() {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { adapter, registry, pageParam, setPage } = usePlatform();
  const raw = {
    role: pageParam('role'), permission: pageParam('permission'), sort: pageParam('sort'),
    page: pageParam('page'), focus: pageParam('focus'),
  };
  // §6.1 page keys: an invalid wire value alerts instead of substituting, and no adapter call is made.
  const parsed = parseAccessKeys(raw);
  // Adapter filter JSON (role + permission only): a focus change must not refetch the table.
  const filterKey = JSON.stringify(parsed.ok ? parsed.filters : null);
  // Every filter change returns to page 1 in the same setPage call — the table does not reset a controlled page.
  const setFilter = (key: string, value: string | null) => setPage({ [key]: value, page: null });
  const [draft, setDraft] = useState(raw.role ?? '');
  useEffect(() => { setDraft(raw.role ?? ''); }, [raw.role]);
  const applyDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage({ role: draft || null, page: null });
  };
  const clearFilters = () => {
    setDraft('');
    setPage(Object.fromEntries(ACCESS_PAGE_KEYS.map(k => [k, null])));
  };
  const clear = <Button type="button" size="sm" variant="secondary" onClick={clearFilters}>{ko ? '필터 초기화' : 'Clear filters'}</Button>;
  const filters = <form onSubmit={applyDraft}>
    <PageFilterBar orientation="column" label={ko ? '필터' : 'Filters'} fields={[
      { kind: 'select', key: 'permission', label: ko ? '권한' : 'Permission', value: raw.permission ?? '', emptyOptionLabel: ko ? '전체' : 'All', options: PERMISSIONS.map(value => ({ value, label: value })), onValueChange: value => setFilter('permission', value || null) },
      { kind: 'text', key: 'role', label: ko ? '역할 정확 일치' : 'Exact role', value: draft, onValueChange: setDraft },
    ]} actions={<><Button type="submit" size="sm" variant="secondary">{ko ? '적용' : 'Apply'}</Button>{parsed.ok && clear}</>} />
  </form>;
  const columns = useMemo<PlatformColumn<AccessPrincipal>[]>(() => [
    { id: 'name', header: ko ? '이름' : 'Name', cell: row => <span className="t-mono">{String(row.name)}</span> },
    { id: 'role', header: ko ? '역할' : 'Role', cell: row => mono(row.role) },
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
  ], [ko, lang, registry]);
  // The drawer reads the loaded page's rows (the last loadPage result) — no second adapter call for a row.
  // Null until the current page request answered ok or empty: before that, and after forbidden/error/timeout, the page cannot
  // say a focus is unknown (06 §17 — no access and not loaded are not "no such principal").
  const [rows, setRows] = useState<readonly AccessPrincipal[] | null>(null);
  const active = parsed.ok && parsed.focus && rows ? rows.find(p => p.id === parsed.focus) : undefined;
  // Computed outside JSX children: a multi-line JSX ternary in children is a parser trap.
  const drawer = parsed.ok && parsed.focus && rows ? (active
    ? <DetailDrawer key={active.id} title={active.name} subtitle={active.title[lang]}
        context={<span className="flex items-center gap-2"><span className="t-mono">{active.role}</span><StatusBadge tone="neutral">{ko ? '조회 전용' : 'Read-only'}</StatusBadge></span>}
        onClose={() => setPage({ focus: null })}
        tabs={[
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
                            {menu.spaceGated && <StatusBadge tone="neutral">{ko ? '공간' : 'space'}</StatusBadge>}
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
        ]} />
    : <div role="alert" className="p-3">
        {/* Only the loaded page is known here: absence from it is not proof the principal does not exist. */}
        <p>{ko ? '이 페이지에 없는 주체입니다.' : 'Principal not on this page.'} <span className="t-mono">{parsed.focus}</span></p>
        <Button size="sm" variant="secondary" className="mt-2" onClick={() => setPage({ focus: null })}>{ko ? '닫기' : 'Close'}</Button>
      </div>) : null;
  return <PlatformPage description={ko
    ? '권한·역할 조회 화면입니다. 부여·회수는 이 화면에서 하지 않으며 역할 소속 원천은 이슈 #98에서 결정 대기입니다.'
    : 'Read-only directory of permissions and roles. Grant/revoke is not on this screen; the role-membership source is pending in issue #98.'}>
    <ManagementLayout filter={filters} activeFilterCount={[raw.role, raw.permission].filter(Boolean).length} drawer={drawer}
      table={filterSlot => <>
    {!parsed.ok && <p role="alert">{filterSlot}{ko ? '필터 값이 잘못되었습니다.' : 'Invalid filter value.'} {clear}</p>}
    {parsed.ok && <PlatformDataTable<AccessPrincipal>
        title={ko ? '권한/역할' : 'Roles & access'}
        ariaLabel={ko ? '권한/역할 목록' : 'Roles and access list'}
        subtitle={ko ? '권한·room 부여 조회 전용입니다. 메뉴 목록은 레지스트리 조합이며 지표 데이터가 아니므로 신뢰도 표시가 없습니다.' : 'Read-only permissions and room grants. The menu list joins the client registry; not mart data, so there is no trust indicator.'}
        filters={filterSlot}
        columns={columns} getRowId={row => row.id} filterKey={filterKey}
        preferenceKey="admin-roles:columns:v1" pageSize={25} height={430} activeRowId={parsed.focus}
        urlState={{
          page: parsed.page,
          sorting: parsed.sorting,
          // A user sort/page change moves rows between pages, so the focused row leaves with them (bot review P2).
          onChange: ({ page, sorting }, reason) => setPage({ sort: encodeTableSort(sorting), page: page === null ? null : String(page), ...(reason === 'user' && { focus: null }) }),
        }}
        loadPage={async (pageQuery, signal) => {
          const { filters } = parsed;
          const sort = pageQuery.sorting[0];
          // A new request voids the last answer: until it settles ok/empty, neither the old drawer nor an
          // "unknown" verdict speaks for the current query (a rejected request leaves them void too).
          setRows(null);
          // The port answers AccessDirectoryPage { items, total }; the table wants PageResult { rows, total }.
          const response = await adapter.accessDirectory({
            ...(filters.role && { role: filters.role }),
            ...(filters.permission && { permission: filters.permission }),
            ...(sort && { sort: { field: sort.id as AccessSortField, desc: sort.desc } }),
            page: pageQuery.page + 1,
            pageSize: 25,
          }, signal);
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
        emptyAction={clear}
        rowAction={row => <Button size="sm" variant="ghost" onClick={() => setPage({ focus: row.id })}>{ko ? '보기' : 'View'}</Button>}
      />}
      </>} />
  </PlatformPage>;
}
