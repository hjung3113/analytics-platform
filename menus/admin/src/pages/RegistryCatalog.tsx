import { useMemo } from 'react';
import { CONTEXT_LABELS, PAGE_TYPE_LABELS, useI18n, usePlatform } from '@ap/kernel';
import type { Text } from '@ap/contracts';
import { DetailDrawer, type PlatformColumn, encodeTableSort, parsePageIndex, parseTableSort, PlatformDataTable, PlatformPage, sortAndPage } from '@ap/components';
import { Button, StatusBadge } from '@ap/ui';
import { toRegistryRow, type RegistryRow } from '../registry-rows';

const SORT_FIELDS = ['id', 'spaceId', 'groupId', 'path', 'permission', 'capabilities', 'pageKeys', 'contextResetKeys', 'status'] as const;
// Shell vocabulary; `t` is kernel-only so the status words are hardcoded here (design §1).
const STATUS: Record<RegistryRow['status'], Text> = { implemented: { ko: '구현', en: 'Implemented' }, planned: { ko: '예정', en: 'Planned' } };

/**
 * 메뉴 레지스트리 (issue #42; 06 §12.4 catalog archetype — the object is a definition, not a mutable master).
 * Reads `usePlatform().registry` directly: the registry is a client declaration, never a mart result,
 * so there is no adapter method or endpoint and `loadPage` stays client-side (trust stays null).
 */
export default function RegistryCatalog() {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { registry, pageParam, setPage } = usePlatform();
  // §6.1 page keys (sort/page/focus): invalid wire values alert instead of substituting — same as EquipmentMaster.
  const focus = pageParam('focus');
  const parsedSort = parseTableSort(pageParam('sort'), SORT_FIELDS);
  const parsedPage = parsePageIndex(pageParam('page'));
  const tableInvalid = !parsedSort.ok || !parsedPage.ok;
  // Every registered menu stays: planned, navHidden and other-permission rows included (design §1).
  const rows = useMemo(() => registry.menus.map(menu => toRegistryRow(menu, registry)), [registry]);
  // Full 8-key context, one badge per value — the PlannedPage capability list, copied inline (do not extract).
  const tone = { apply: 'success', reference: 'info', unsupported: 'neutral' } as const;
  const columns = useMemo<PlatformColumn<RegistryRow>[]>(() => [
    { id: 'id', header: 'ID', cell: row => <span className="t-mono">{String(row.id)}</span> },
    { id: 'spaceId', header: ko ? '공간' : 'Space', cell: row => <span className="t-mono">{String(row.spaceId)}</span> },
    { id: 'groupId', header: ko ? '그룹' : 'Group', cell: row => <span className="t-mono">{String(row.groupId)}</span> },
    { id: 'path', header: 'Path', cell: row => <span className="t-mono">{String(row.path)}</span> },
    { id: 'permission', header: ko ? '권한' : 'Permission', cell: row => <span className="t-mono">{String(row.permission)}</span> },
    { id: 'capabilities', header: ko ? 'Context' : 'Context' },
    { id: 'pageKeys', header: ko ? '페이지 키' : 'Page keys', cell: row => <span className="t-mono">{String(row.pageKeys)}</span> },
    { id: 'contextResetKeys', header: ko ? '리셋 키' : 'Reset keys', cell: row => <span className="t-mono">{String(row.contextResetKeys)}</span> },
    { id: 'status', header: ko ? '상태' : 'Status', cell: row => STATUS[row.status][lang] },
  ], [ko, lang]);
  const menu = focus ? registry.menus.find(m => m.id === focus) : undefined;
  // Computed outside JSX children: a multi-line JSX ternary in children is a parser trap.
  const drawer = focus ? (menu
    ? <DetailDrawer key={menu.id} title={<span className="t-mono">{menu.id}</span>} subtitle={menu.label[lang]}
        onClose={() => setPage({ focus: null })}
        tabs={[{ id: 'declaration', label: ko ? '선언' : 'Declaration', content: <div className="grid gap-3">
          <dl className="grid grid-cols-[9rem_1fr] gap-y-1.5 text-[13px]">
            <dt className="text-text-muted">{ko ? '메뉴' : 'Label'}</dt><dd>{menu.label[lang]}</dd>
            <dt className="text-text-muted">{ko ? '설명' : 'Description'}</dt><dd>{menu.description[lang]}</dd>
            <dt className="text-text-muted">requiresScope</dt><dd className="t-mono">{String(menu.requiresScope)}</dd>
            <dt className="text-text-muted">{ko ? '페이지 유형' : 'Page type'}</dt><dd>{PAGE_TYPE_LABELS[menu.pageType][lang]}</dd>
            <dt className="text-text-muted">{ko ? '기능' : 'Features'}</dt><dd className="t-mono">{Object.entries(menu.features).map(([k, v]) => `${k}: ${v}`).join(', ')}</dd>
            <dt className="text-text-muted">navHidden</dt><dd className="t-mono">{String(!!menu.navHidden)}</dd>
            <dt className="text-text-muted">parent</dt><dd className="t-mono">{menu.parent ?? '—'}</dd>
            <dt className="text-text-muted">primary</dt><dd className="t-mono">{String(!!menu.primary)}</dd>
            <dt className="text-text-muted">initializesMetric</dt><dd className="t-mono">{String(!!menu.initializesMetric)}</dd>
            <dt className="text-text-muted">{ko ? '페이지 키' : 'Page keys'}</dt><dd className="t-mono">{menu.pageKeys.join(', ') || '—'}</dd>
            <dt className="text-text-muted">{ko ? '리셋 키' : 'Reset keys'}</dt><dd className="t-mono">{(menu.contextResetKeys ?? []).join(', ') || '—'}</dd>
          </dl>
          <ul className="grid grid-cols-2 gap-1.5 text-[13px]">
            {(Object.keys(menu.context) as (keyof typeof menu.context)[]).map(k => <li key={k} className="flex items-center justify-between rounded-sm bg-surface-sunken px-2 py-1">
              <span>{CONTEXT_LABELS[k][lang]}</span><StatusBadge tone={tone[menu.context[k]]}>{menu.context[k]}</StatusBadge>
            </li>)}
          </ul>
        </div> }]} />
    : <div role="alert" className="p-3">
        <p>{ko ? '등록되지 않은 메뉴입니다.' : 'Unknown menu.'} <span className="t-mono">{focus}</span></p>
        <Button size="sm" variant="secondary" className="mt-2" onClick={() => setPage({ focus: null })}>{ko ? '닫기' : 'Close'}</Button>
      </div>) : null;
  return <PlatformPage description={ko ? '등록된 메뉴 선언을 조회합니다. 조회 전용이며 레지스트리는 클라이언트 선언입니다.' : 'Read-only view of registered menu declarations. The registry is a client-side declaration.'}>
    {tableInvalid ? <p role="alert">{ko ? '정렬·페이지 값이 잘못되었습니다.' : 'Invalid sort or page value.'} <Button size="sm" variant="secondary" onClick={() => setPage({ sort: null, page: null })}>{ko ? '초기화' : 'Reset'}</Button></p>
      : <PlatformDataTable<RegistryRow>
          title={ko ? '메뉴 레지스트리' : 'Menu registry'}
          ariaLabel={ko ? '메뉴 레지스트리 목록' : 'Menu registry list'}
          subtitle={ko ? '모든 등록된 메뉴가 표시됩니다(예정·숨김 포함). 레지스트리는 지표 데이터가 아니므로 신뢰도 표시가 없습니다.' : 'Every registered menu is listed (planned and hidden included). Not mart data, so there is no trust indicator.'}
          columns={columns} getRowId={row => row.id} filterKey=""
          preferenceKey="admin-registry:columns:v1" pageSize={25} activeRowId={focus}
          urlState={parsedSort.ok && parsedPage.ok ? {
            page: parsedPage.page === 1 ? null : parsedPage.page,
            sorting: parsedSort.sorting,
            onChange: ({ page, sorting }) => setPage({ sort: encodeTableSort(sorting), page: page === null ? null : String(page) }),
          } : undefined}
          rowAction={row => <Button size="sm" variant="ghost" onClick={() => setPage({ focus: row.id })}>{ko ? '보기' : 'View'}</Button>}
          loadPage={async page => {
            // Client envelope: the rows are the registry projection, not a server result — trust is null.
            const paged = sortAndPage(rows, page);
            return { outcome: paged.total ? 'ok' : 'empty', data: paged, assessments: [], trust: null, correlationId: 'client-registry' };
          }}
        />}
    {drawer}
  </PlatformPage>;
}
