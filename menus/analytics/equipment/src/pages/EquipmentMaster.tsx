// THROWAWAY #306 — never merge.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { PlatformLink, useI18n, useMenuFetch, useMenuQuery, usePlatform } from '@ap/kernel';
import { equipmentExportEndpoint, equipmentMakersEndpoint, equipmentPageEndpoint, type Equipment } from '../endpoints';
import { DetailDrawer, ManagementLayout, PageFilterBar, type PlatformColumn, PlatformDataTable, PlatformPage, encodeTableSort, parsePageIndex, parseTableSort } from '@ap/components';
import { Button, usePrototype } from '@ap/ui';
import { EquipmentPanel, EquipmentStatus } from './EquipmentDetail';
import { exportFilterSummary, exportParams, fields, sortFields, statusText } from './data';
import { equipmentPageFilterFields, resetEquipmentPageFilters } from './filter-fields';

const NO_PARAMS = {} as const;

export default function EquipmentMaster() {
  const { t, lang } = useI18n();
  const ko = lang === 'ko';
  const { pageParam, setPage, linkTo } = usePlatform();
  const variant = usePrototype();
  const q = pageParam('q') ?? '', status = pageParam('status') ?? '', maker = pageParam('maker') ?? '', focus = pageParam('focus');
  // §6.1 page keys: sort/page/tab are URL-owned; invalid wire values alert instead of substituting.
  const drawerTab = pageParam('tab') ?? 'attributes';
  const validTab = ['attributes', 'validity', 'audit'].includes(drawerTab);
  // §13: the fullscreen link carries the viewed tab when the destination knows it; the default tab stays off the URL.
  const detailPage = validTab && drawerTab !== 'attributes' ? { tab: drawerTab } : undefined;
  const parsedSort = parseTableSort(pageParam('sort'), sortFields);
  const parsedPage = parsePageIndex(pageParam('page'));
  const tableInvalid = !parsedSort.ok || !parsedPage.ok;
  const filterKey = JSON.stringify([q, status, maker]);
  // #306 prototype: the host owns draft vs applied and commits every filter key plus the page reset in one setPage call.
  const [draft, setDraft] = useState({ q, status, maker });
  const [seen, setSeen] = useState(filterKey);
  if (seen !== filterKey) { setSeen(filterKey); setDraft({ q, status, maker }); }
  const commit = (next: typeof draft, replace = false) => setPage({ q: next.q || null, status: next.status || null, maker: next.maker || null, page: null }, { replace });
  const pending = (['q', 'status', 'maker'] as const).filter(key => draft[key] !== { q, status, maker }[key]).length;
  const live = variant === 'C';
  const onField = (key: 'q' | 'status' | 'maker', value: string) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (live && key !== 'q') commit(next);
  };
  // C: the text field commits 300 ms after the last keystroke; navigation or a variant change cancels it.
  useEffect(() => {
    if (!live || draft.q === q) return;
    const timer = setTimeout(() => commit(draft, true), 300);
    return () => clearTimeout(timer);
  }, [live, draft, q]);
  const applyDraft = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (pending > 0) commit(draft); };
  // #173 review P2-4: the full list is no longer the render gate. Maker options come from a small distinct-values
  // endpoint; the table renders its own outcomes.
  const makers = useMenuQuery(equipmentMakersEndpoint, NO_PARAMS, !tableInvalid);
  const makerOptions = [...new Set([
    ...(makers.response?.outcome === 'ok' ? makers.response.data! : []),
    ...(maker ? [maker] : []), // the chosen value stays selectable while the options (re)load
  ])].sort();
  const pages = useMenuFetch(equipmentPageEndpoint);
  const exports = useMenuFetch(equipmentExportEndpoint);

  // A global-Context change clears `page` in the kernel (manifest contextResetKeys); pages write no reset effect.
  const columns = useMemo<PlatformColumn<Equipment>[]>(() => fields.map(f => ({
    id: f.key, header: f[lang], size: ['validFrom', 'validTo', 'updatedAt'].includes(f.key) ? 188 : f.key === 'equipmentId' ? 184 : 128,
    cell: row => f.key === 'status' ? <EquipmentStatus equipment={row} /> : <span className={f.key === 'equipmentId' ? 't-mono' : f.key.includes('At') || f.key.startsWith('valid') ? 'tabular' : ''}>{row[f.key] ?? '—'}</span>,
    // The status cell shows a label badge; the export shows the same text (06 §15).
    exportValue: f.key === 'status' ? (row: Equipment) => statusText[row.status][lang] : undefined,
  })), [lang]);
  const clear = <Button type="button" size={live ? 'sm' : 'md'} variant="secondary" onClick={() => resetEquipmentPageFilters(setPage)}>{live ? (ko ? '초기화' : 'Reset') : t('clearFilters')}</Button>;
  const filterActions = <>
    {!live && <Button type="submit" size="md" variant="secondary" disabled={pending === 0}>{variant === 'B' && pending > 0 ? `${ko ? '적용' : 'Apply'} (${pending})` : ko ? '적용' : 'Apply'}</Button>}
    {[q, status, maker].some(Boolean) && clear}
  </>;
  return <PlatformPage description={ko ? '설비 속성 → 유효구간 → 변경 이력. 합성 데이터 · 조회 전용.' : 'Equipment attributes → validity → change history. Synthetic data · read-only.'}>
    <ManagementLayout filter={<form onSubmit={applyDraft}><PageFilterBar orientation="column" label={t('pageFilter')} fields={equipmentPageFilterFields({ ...draft, makers: makerOptions, lang, setPage, onField })} actions={filterActions} /></form>} activeFilterCount={[q, status, maker].filter(Boolean).length} pendingFilterCount={pending}
      drawer={focus && <DetailDrawer key={focus} title={<span className="t-mono">{focus}</span>} subtitle={ko ? '설비 상세 · 합성 데이터' : 'Equipment details · synthetic data'}
      onClose={() => setPage({ focus: null, tab: null })} tab={validTab ? drawerTab : 'invalid'} onTabChange={tab => setPage({ tab: tab === 'attributes' ? null : tab })}
      context={ko ? '목적지 ID만 열었습니다. 전역 Selection과 목록 필터는 유지됩니다.' : 'Only the destination ID is opened. Global Selection and list filters are preserved.'}
      headerActions={<Button asChild size="sm" variant="secondary"><PlatformLink href={linkTo('equipment-detail', { params: { equipmentId: focus }, page: detailPage, returnTo: true })}>{ko ? '전체 화면' : 'Full page'}</PlatformLink></Button>}
      tabs={validTab ? [{ id: 'attributes', label: ko ? '속성' : 'Attributes', content: <EquipmentPanel id={focus} kind="attributes" /> }, { id: 'validity', label: ko ? '유효구간 이력' : 'Validity history', content: <EquipmentPanel id={focus} kind="validity" /> }, { id: 'audit', label: ko ? '변경 이력' : 'Change history', content: <EquipmentPanel id={focus} kind="audit" /> }]
        : [{ id: 'invalid', label: ko ? '알 수 없는 탭' : 'Unregistered tab', content: <p role="alert">{ko ? '등록되지 않은 탭입니다.' : 'This tab is not registered.'} <Button size="sm" variant="secondary" onClick={() => setPage({ tab: null })}>{ko ? '속성 열기' : 'Open attributes'}</Button></p> }]} />}
      table={filterSlot => tableInvalid ? <p role="alert">{filterSlot}{ko ? '정렬·페이지 값이 잘못되었습니다.' : 'Invalid sort or page value.'} <Button size="sm" variant="secondary" onClick={() => setPage({ sort: null, page: null })}>{ko ? '초기화' : 'Reset'}</Button></p> :
    <PlatformDataTable<Equipment>
      title={ko ? '설비 목록' : 'Equipment list'} ariaLabel={ko ? '설비 마스터 목록' : 'Equipment master list'}
      subtitle={ko ? '행 체크는 내보내기용입니다. 분석 이동을 클릭할 때만 전역 Selection을 교체합니다.' : 'Row checks are for export. Only the explicit analysis link replaces global Selection.'}
      columns={columns} getRowId={e => e.equipmentId} filterKey={filterKey} preferenceKey="equipment-master:columns:v1" activeRowId={focus} pageSize={25} height={430}
      urlState={parsedSort.ok && parsedPage.ok ? {
        page: parsedPage.page === 1 ? null : parsedPage.page,
        sorting: parsedSort.sorting,
        onChange: ({ page, sorting }, reason) => setPage({ sort: encodeTableSort(sorting), page: page === null ? null : String(page) }, { replace: reason === 'clamp' }),
      } : undefined}
      loadPage={(page, signal) => pages.fetch({ q, status, maker, ...page }, signal)}
      filters={filterSlot}
      onRowActivate={e => setPage({ focus: e.equipmentId, tab: null })} rowActivateLabel={e => ko ? `${e.equipmentId} 상세 열기` : `Open ${e.equipmentId} details`}
      rowAction={e => <Button size="toolbar" variant="ghost" aria-label={ko ? `${e.equipmentId} 보기` : `View ${e.equipmentId}`} onClick={() => setPage({ focus: e.equipmentId, tab: null })}>{ko ? '보기' : 'View'}</Button>}
      bulkActions={ids => <Button asChild size="sm"><PlatformLink href={linkTo('productivity-overview', { global: { selection: ids } })}>{ko ? '선택 설비로 분석' : 'Analyze selected equipment'}</PlatformLink></Button>}
      // Table-owned export (#173): the page only says how to read the rows; the table builds the file.
      exportRows={(request, signal) => exports.fetch(exportParams({ q, status, maker }, request), signal)}
      exportFilterSummary={exportFilterSummary({ q, status, maker }, lang)} exportContext={equipmentExportEndpoint.context}
      emptyAction={clear}
    />} />

  </PlatformPage>;
}
