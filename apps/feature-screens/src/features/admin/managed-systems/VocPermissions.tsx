import { Button, Checkbox, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, StatusBadge } from '@ap/ui';
import { ArrowDown, ArrowUp, LockKeyhole, Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { ClosableDetailParts } from '@/lib/host/detail-parts';
import { PermissionGate } from '../permissions/permission-gate';
import { VocPermissionEditor } from './VocPermissionEditor';
import { sameVocSetting, useVocPermissions, vocSettingLabel, type VocMode } from './useVocPermissions';

export type SystemPermissionRow = {
  key: string; id: string; name: string; kind: string; platform: boolean; archived: boolean;
  business: ReactNode; link: ReactNode;
};
type Props = { rows: SystemPermissionRow[]; fallback: ReactNode; renderDetail: (parts: ClosableDetailParts) => ReactNode };

/** System connections keep their existing read gate; editing uses the console's server-side admin gate. */
export function SystemVocPermissions(props: Props) {
  return <PermissionGate capability="workspace.admin" fallback={props.fallback} loading={props.fallback}><VocPermissionsBody {...props} /></PermissionGate>;
}
function VocPermissionsBody({ rows, renderDetail }: Props) {
  const state = useVocPermissions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState<'asc' | 'desc' | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [preview, setPreview] = useState<VocMode | null>(null);
  const selected = rows.find(row => row.id === selectedId);
  const visible = rows.filter(row => filter === 'all' || state.ready && state.known(row.id) && state.saved(row.id, row.platform).mode === filter);
  if (sort && state.ready) visible.sort((a, b) => {
    const aValue = state.saved(a.id, a.platform); const bValue = state.saved(b.id, b.platform);
    const order = Number(aValue.mode === 'restricted') - Number(bValue.mode === 'restricted') || aValue.people.length - bValue.people.length || a.name.localeCompare(b.name);
    return sort === 'asc' ? order : -order;
  });
  const targets = [...new Map(rows.filter(r => checked.includes(r.id) && !r.platform && !r.archived && state.known(r.id)).map(r => [r.id, r])).values()];
  const open = (row: SystemPermissionRow, element: HTMLElement) => { element.focus(); setSelectedId(row.id); };
  return <div className="flex flex-col gap-3">
    <p className="text-xs text-text-muted">목록은 저장된 설정입니다. 미저장 초안은 시스템별로 유지되며, 닫거나 다른 시스템을 선택해도 보존됩니다.</p>
    <div className="flex flex-wrap items-center gap-2">
      <Search className="size-4 shrink-0" aria-hidden /><span className="shrink-0 whitespace-nowrap text-xs">VOC 등록</span>
      <Select value={filter} onValueChange={setFilter} disabled={!state.ready || state.busy}>
        <SelectTrigger aria-label="VOC 등록 필터" className="w-40 shrink-0"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup><SelectItem value="all">전체</SelectItem><SelectItem value="open">모두</SelectItem><SelectItem value="restricted">지정한 사람만</SelectItem></SelectGroup></SelectContent>
      </Select>
      <span className="ml-auto whitespace-nowrap text-xs text-text-muted">{visible.length}개 시스템</span>
    </div>
    {!state.ready && <div role="status" className="flex items-center gap-2 text-xs text-text-secondary"><span>{state.systems.isPending || state.grants.isPending ? 'VOC 등록 설정을 불러오는 중…' : 'VOC 등록 설정을 불러오지 못했습니다.'}</span><Button variant="subtle" size="sm" onClick={() => void state.refresh()}>설정 다시 불러오기</Button></div>}
    <section aria-label="VOC 등록 모드 일괄 변경" className="flex flex-col gap-2 border-b border-border-subtle pb-3">
      <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-text-secondary">일괄 변경 대상 {targets.length}개</span>
        <Button size="sm" variant="secondary" disabled={!state.ready || state.busy || targets.length === 0} onClick={() => setPreview('open')}>모두로</Button>
        <Button size="sm" variant="secondary" disabled={!state.ready || state.busy || targets.length === 0} onClick={() => setPreview('restricted')}>지정한 사람만으로</Button>
        {state.undo && Object.keys(state.undo).length > 0 && <Button size="sm" variant="secondary" disabled={state.busy || !state.ready} onClick={() => { void state.bulk([], null).then(ok => { if (ok) setPreview(null); }); }}>일괄 변경 되돌리기</Button>}
      </div>
      {preview && <section aria-label="일괄 변경 적용 전 확인" className="flex flex-col gap-2 text-xs">
        <p>{targets.length}개 시스템의 저장된 설정을 {preview === 'open' ? '모두' : '지정한 사람만'}으로 변경합니다.</p>
        {preview === 'restricted' && <p className="text-text-warning-label">이 중 {targets.filter(r => state.saved(r.id).people.length === 0).length}개는 지정 인원이 없어 Admin만 등록 가능</p>}
        <p className="text-text-secondary">지정된 사람은 변경하지 않습니다. 미저장 초안은 적용 대상에 포함되지 않으며 그대로 보존됩니다.</p>
        <div className="flex gap-2"><Button size="sm" disabled={state.busy || !state.ready || targets.length === 0} onClick={() => { void state.bulk(targets, preview).then(ok => { if (ok) setPreview(null); }); }}>{targets.length}개 시스템에 적용</Button><Button size="sm" variant="secondary" disabled={state.busy} onClick={() => setPreview(null)}>일괄 변경 취소</Button></div>
      </section>}
      <p className="text-xs text-text-muted">플랫폼과 보관된 시스템은 일괄 변경에서 제외됩니다. 워크스페이스 전체 부여·명시적 거부는 별도로 적용됩니다.</p>
      {state.notice && <p role={state.notice.includes('실패') ? 'alert' : 'status'} className="text-xs text-text-secondary">{state.notice}</p>}
    </section>
    <table className="w-full text-left text-sm">
      <caption className="sr-only">업무 시스템과 추적 시스템의 연결 및 VOC 등록 권한</caption>
      <thead><tr className="text-xs font-semibold text-text-secondary"><th scope="col"><span className="sr-only">일괄 변경 대상 선택</span></th><th scope="col" className="py-1 pr-3">업무 시스템</th><th scope="col" className="py-1 pr-3">추적 시스템</th><th scope="col" className="py-1 pr-3">연결 상태</th><th scope="col" aria-sort={sort === null ? 'none' : sort === 'asc' ? 'ascending' : 'descending'}><Button size="sm" variant="subtle" aria-label="VOC 등록 정렬" disabled={!state.ready} onClick={() => setSort(sort === 'asc' ? 'desc' : 'asc')}>VOC 등록{sort === 'desc' ? <ArrowDown aria-hidden /> : <ArrowUp aria-hidden />}</Button></th></tr></thead>
      <tbody>{visible.map(row => {
        const setting = state.saved(row.id, row.platform);
        const draft = state.drafts[row.id];
        const dirty = draft !== undefined && !sameVocSetting(draft, setting);
        return <tr key={row.key} data-kind={row.kind} className="border-t border-border-subtle hover:bg-surface-row-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring" tabIndex={0} aria-label={`${row.name} VOC 등록 설정 행`} onClick={event => { if (event.target instanceof Element && event.target.closest('button, input, a')) return; open(row, event.currentTarget); }} onKeyDown={event => { if (event.key === 'Enter' && event.target === event.currentTarget) { event.preventDefault(); open(row, event.currentTarget); } }}>
          <td className="pr-2"><Checkbox aria-label={`${row.name} 선택`} disabled={!state.ready || state.busy || row.platform || row.archived || !state.known(row.id)} checked={checked.includes(row.id)} onCheckedChange={value => { setChecked(current => value === true ? [...current, row.id] : current.filter(id => id !== row.id)); setPreview(null); }} /></td>
          <td className="py-2 pr-3">{row.business}</td>
          <td className="py-2 pr-3">{row.name}{row.archived && <span className="ml-2 text-xs text-text-secondary">보관됨</span>}</td>
          <td className="py-2 pr-3">{row.link}</td>
          <td className="py-2"><div className="flex items-center gap-1">{row.platform && <LockKeyhole className="size-3.5 shrink-0" aria-label="플랫폼 항상 모두" />}<Button size="sm" variant="subtle" aria-label={`${row.name} VOC 등록 설정`} onClick={event => open(row, event.currentTarget)}><StatusBadge tone={setting.mode === 'restricted' ? setting.people.length === 0 ? 'warning' : 'info' : 'neutral'}>{state.ready && state.known(row.id) ? vocSettingLabel(setting) : '확인 필요'}</StatusBadge></Button></div>
            {state.ready && state.known(row.id) && setting.mode === 'restricted' && setting.people.length === 0 && <p className="text-xs text-text-warning-label">Admin만 등록 가능</p>}
            {dirty && <span className="text-xs text-text-warning-label">미저장</span>}
          </td>
        </tr>;
      })}</tbody>
    </table>
    {visible.length === 0 && <p role="status" className="text-sm text-text-secondary">조건에 맞는 시스템이 없습니다.</p>}
    {selected && renderDetail({ title: selected.name, subtitle: 'VOC 등록 권한', body: <VocPermissionEditor key={selected.id} row={selected} state={state} />, requestClose: () => setSelectedId(null) })}
  </div>;
}
