import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { PERMISSIONS, type AccessPrincipal, type AccessSortField } from '@ap/contracts';
import { useI18n, usePlatform } from '@ap/kernel';
import { DetailDrawer, PlatformDataTable, PlatformPage, encodeTableSort } from '@ap/components';
import { Button, StatusBadge } from '@ap/ui';
import { grantTotals, menusForPermissions } from '../access-rows';
import { ACCESS_PAGE_KEYS, parseAccessKeys } from '../access-query';

const control = 'h-8 rounded-sm border border-border-control bg-surface-card px-2 text-[12px] focus-visible:outline-2 focus-visible:outline-focus-ring';
const mono = (value: unknown) => <span className="t-mono">{String(value)}</span>;

/**
 * 권한/역할 (issue #49, 06 §12.3 management list). Read-only console directory over the accessDirectory
 * port: the server sorts and pages, the client never re-sorts a page, and the default (no sort key) is
 * the server's role-ascending. The menu list in the drawer is the registry joined to the principal's
 * permission set client-side — a declaration, not an authorization proof. This screen grants and revokes
 * nothing: the write owner is decision issue #98. Not mart data, so there is no trust indicator.
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
  const filters = <form className="mb-3" onSubmit={applyDraft}>
    <fieldset className="flex flex-wrap items-center gap-2 border-l-2 border-border-strong pl-3">
      <legend className="t-caption text-text-muted">{ko ? '필터' : 'Filters'}</legend>
      <label className="flex items-center gap-1 text-xs">{ko ? '권한' : 'Permission'}
        <select className={control} value={raw.permission ?? ''} onChange={e => setFilter('permission', e.target.value || null)}>
          <option value="">{ko ? '전체' : 'All'}</option>
          {PERMISSIONS.map(permission => <option key={permission} value={permission}>{permission}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1 text-xs">{ko ? '역할' : 'Role'}
        <input className={control} aria-label={ko ? '역할 정확 일치' : 'Exact role'} value={draft} onChange={e => setDraft(e.target.value)} />
      </label>
      <Button type="submit" size="sm" variant="secondary">{ko ? '적용' : 'Apply'}</Button>
      {parsed.ok && clear}
    </fieldset>
  </form>;
  const columns = useMemo<ColumnDef<AccessPrincipal>[]>(() => [
    { accessorKey: 'name', header: ko ? '이름' : 'Name', cell: info => <span className="t-mono">{String(info.getValue())}</span> },
    { accessorKey: 'role', header: ko ? '역할' : 'Role', cell: info => mono(info.getValue()) },
    { id: 'title', header: ko ? '직책' : 'Title', enableSorting: false, accessorFn: row => row.title[lang] },
    { id: 'permissionCount', header: ko ? '권한 수' : 'Permissions', accessorFn: row => row.permissions.length },
    {
      id: 'grantCount',
      header: ko ? 'room 부여' : 'Room grants',
      accessorFn: row => grantTotals(row).granted,
      cell: ({ row }) => {
        const totals = grantTotals(row.original);
        return <span className="tabular">{totals.granted}/{totals.total}</span>;
      },
    },
    { id: 'menus', header: ko ? '메뉴' : 'Menus', enableSorting: false, accessorFn: row => menusForPermissions(registry, row.permissions).length },
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
                  <p className="t-mono text-[13px] font-medium">{permission}</p>
                  {joined.length
                    ? <ul className="grid gap-1">
                        {joined.map(menu => <li key={menu.id} className="flex items-center justify-between gap-2 rounded-sm bg-surface-sunken px-2 py-1 text-[13px]">
                          <span>{menu.label[lang]} <span className="t-mono text-text-muted">{menu.id}</span></span>
                          <span className="flex items-center gap-2">
                            <span className="t-mono text-text-muted">{menu.path}</span>
                            {menu.spaceGated && <StatusBadge tone="neutral">{ko ? '공간' : 'space'}</StatusBadge>}
                          </span>
                        </li>)}
                      </ul>
                    : <p className="text-[12px] text-text-muted">{ko ? '이 권한으로 열리는 메뉴가 레지스트리에 없습니다.' : 'No registry menu declares this permission.'}</p>}
                </div>;
              })}
            </div>,
          },
          {
            id: 'sites',
            label: ko ? '사이트 범위' : 'Site scope',
            content: <ul className="grid gap-1.5 text-[13px]">
              {active.sites.map(site => <li key={site.id} className="flex items-center justify-between gap-2 rounded-sm bg-surface-sunken px-2 py-1">
                <span>{site.label}</span>
                <span className="flex items-center gap-2">
                  <span className="tabular">{site.grantedRooms.length}/{site.totalRooms}</span>
                  {site.grantedRooms.length
                    ? <span className="t-mono">{site.grantedRooms.join(', ')}</span>
                    : <span className="text-text-muted">{ko ? '부여 없음' : 'No rooms granted'}</span>}
                </span>
              </li>)}
            </ul>,
          },
        ]} />
    : <div role="alert" className="p-3">
        <p>{ko ? '없는 주체입니다.' : 'Unknown principal.'} <span className="t-mono">{parsed.focus}</span></p>
        <Button size="sm" variant="secondary" className="mt-2" onClick={() => setPage({ focus: null })}>{ko ? '닫기' : 'Close'}</Button>
      </div>) : null;
  return <PlatformPage description={ko
    ? '권한·역할 조회 화면입니다. 부여·회수는 이 화면에서 하지 않으며 쓰기 주체는 이슈 #98의 결정 사항입니다.'
    : 'Read-only directory of permissions and roles. Grant/revoke is not on this screen; the write owner is decision issue #98.'}>
    {filters}
    {!parsed.ok && <p role="alert">{ko ? '필터 값이 잘못되었습니다.' : 'Invalid filter value.'} {clear}</p>}
    {parsed.ok && <PlatformDataTable<AccessPrincipal>
        title={ko ? '권한/역할' : 'Roles & access'}
        ariaLabel={ko ? '권한/역할 목록' : 'Roles and access list'}
        subtitle={ko ? '권한·room 부여 조회 전용입니다. 메뉴 목록은 레지스트리 조합이며 지표 데이터가 아니므로 신뢰도 표시가 없습니다.' : 'Read-only permissions and room grants. The menu list joins the client registry; not mart data, so there is no trust indicator.'}
        columns={columns} getRowId={row => row.id} filterKey={filterKey}
        preferenceKey="admin-roles:columns:v1" pageSize={25} height={430} activeRowId={parsed.focus}
        urlState={{
          page: parsed.page,
          sorting: parsed.sorting,
          onChange: ({ page, sorting }) => setPage({ sort: encodeTableSort(sorting), page: page === null ? null : String(page) }),
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
    {drawer}
  </PlatformPage>;
}
