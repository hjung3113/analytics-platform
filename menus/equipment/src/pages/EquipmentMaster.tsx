import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { PlatformLink, useI18n, usePlatform, usePlatformQuery } from '@ap/kernel';
import { serve, type Equipment } from '../api';
import { DetailDrawer, PlatformDataTable, PlatformPage, QueryView, sortAndPage } from '@ap/components';
import { Button } from '@ap/ui';
import { EquipmentPanel, EquipmentStatus } from './EquipmentDetail';
import { downloadCsv, fields, filterEquipment, statusText } from './data';

export default function EquipmentMaster() {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { global, scope, pageParam, setPage, linkTo, toast } = usePlatform();
  const [drawerTab, setDrawerTab] = useState('attributes');
  const q = pageParam('q') ?? '', status = pageParam('status') ?? '', maker = pageParam('maker') ?? '', focus = pageParam('focus');
  const filterKey = JSON.stringify([q, status, maker]);
  const source = usePlatformQuery(signal => serve({ global, signal, mergeTimeDomain: false, compute: ({ equipment }) => equipment }), null, scope.status === 'valid');
  const columns = useMemo<ColumnDef<Equipment>[]>(() => fields.map(f => ({
    accessorKey: f.key, header: f[lang], size: ['validFrom', 'validTo', 'updatedAt'].includes(f.key) ? 188 : f.key === 'name' ? 220 : f.key === 'equipmentId' ? 184 : 128,
    cell: ({ row }) => f.key === 'status' ? <EquipmentStatus equipment={row.original} /> : <span className={f.key === 'equipmentId' ? 't-mono' : f.key.includes('At') || f.key.startsWith('valid') ? 'tabular' : ''}>{row.original[f.key] ?? '—'}</span>,
  })), [lang]);
  const control = 'h-8 rounded-sm border border-border-control bg-surface-card px-2 text-[12px] focus-visible:outline-2 focus-visible:outline-focus-ring';
  const clear = <Button size="sm" variant="secondary" onClick={() => setPage({ q: null, status: null, maker: null })}>{ko ? '페이지 필터 초기화' : 'Clear page filters'}</Button>;
  return <PlatformPage description={ko ? '설비 속성 → 유효구간 → Audit. 합성 데이터 · 조회 전용 Candidate.' : 'Equipment attributes → validity → audit. Synthetic data · read-only Candidate.'}>
    <QueryView query={source}>{rows => <PlatformDataTable<Equipment>
      title={ko ? '설비 목록' : 'Equipment list'} ariaLabel={ko ? '설비 마스터 목록' : 'Equipment master list'}
      subtitle={ko ? '행 체크는 내보내기용입니다. 분석 이동을 클릭할 때만 전역 Selection을 교체합니다.' : 'Row checks are for export. Only the explicit analysis link replaces global Selection.'}
      columns={columns} getRowId={e => e.equipmentId} filterKey={filterKey} preferenceKey="equipment-master:columns:v1" activeRowId={focus} pageSize={25} height={430}
      loadPage={(page, signal) => serve({ global, signal, mergeTimeDomain: false, compute: ({ equipment }) => sortAndPage(filterEquipment(equipment, q, status, maker), page), isEmpty: data => data.total === 0 })}
      filters={<fieldset className="flex flex-wrap items-center gap-2 border-l-2 border-border-strong pl-3"><legend className="t-caption text-text-muted">{ko ? '페이지 필터' : 'Page filters'}</legend>
        <label className="flex items-center gap-1 text-xs">{ko ? '검색' : 'Search'}<input className={control} aria-label={ko ? '설비 ID 또는 이름 검색' : 'Search equipment ID or name'} value={q} onChange={e => setPage({ q: e.target.value || null }, { replace: true })} /></label>
        <label className="flex items-center gap-1 text-xs">{ko ? '상태' : 'Status'}<select className={control} value={status} onChange={e => setPage({ status: e.target.value || null })}><option value="">{ko ? '전체' : 'All'}</option>{Object.entries(statusText).map(([id, text]) => <option key={id} value={id}>{text[lang]}</option>)}</select></label>
        <label className="flex items-center gap-1 text-xs">Maker<select className={control} value={maker} onChange={e => setPage({ maker: e.target.value || null })}><option value="">{ko ? '전체' : 'All'}</option>{[...new Set([...rows.map(e => e.maker), ...(maker ? [maker] : [])])].sort().map(m => <option key={m}>{m}</option>)}</select></label>{clear}
      </fieldset>}
      rowAction={e => <Button size="sm" variant="ghost" onClick={() => { setDrawerTab('attributes'); setPage({ focus: e.equipmentId }); }}>{ko ? '보기' : 'View'}</Button>}
      bulkActions={ids => <Button asChild size="sm"><PlatformLink href={linkTo('productivity-overview', { global: { selection: ids } })}>{ko ? '선택 설비로 분석' : 'Analyze selected equipment'}</PlatformLink></Button>}
      onExport={exportScope => {
        const filtered = filterEquipment(rows, q, status, maker);
        const output = exportScope.kind === 'selected' ? filtered.filter(e => exportScope.ids.includes(e.equipmentId)) : filtered;
        downloadCsv(output);
        toast(ko ? `CSV: ${exportScope.kind === 'selected' ? '선택 행' : '필터된 전체 결과'} ${output.length}건 내보내기` : `CSV: exported ${output.length} ${exportScope.kind === 'selected' ? 'selected rows' : 'rows from all filtered results'}`);
      }} emptyAction={clear}
    />}</QueryView>
    {focus && <DetailDrawer key={focus} title={<span className="t-mono">{focus}</span>} subtitle={ko ? '설비 상세 · 합성 데이터' : 'Equipment details · synthetic data'}
      onClose={() => setPage({ focus: null })} tab={drawerTab} onTabChange={setDrawerTab}
      context={ko ? '목적지 ID만 열었습니다. 전역 Selection과 목록 필터는 유지됩니다.' : 'Only the destination ID is opened. Global Selection and list filters are preserved.'}
      headerActions={<Button asChild size="sm" variant="secondary"><PlatformLink href={linkTo('equipment-detail', { params: { equipmentId: focus }, returnTo: true })}>{ko ? '전체 화면' : 'Full page'}</PlatformLink></Button>}
      tabs={[{ id: 'attributes', label: ko ? '속성' : 'Attributes', content: <EquipmentPanel id={focus} kind="attributes" /> }, { id: 'validity', label: ko ? '유효구간 이력' : 'Validity history', content: <EquipmentPanel id={focus} kind="validity" /> }, { id: 'audit', label: 'Audit', content: <EquipmentPanel id={focus} kind="audit" /> }]} />}
  </PlatformPage>;
}
