import { useEffect, useState } from 'react';
import { Button, Combobox, FieldLabel, RadioGroup, RadioGroupItem } from '@ap/ui';
import { handoffModelsEndpoint, handoffSoftwareEndpoint, type HandoffModel } from '../endpoints';
import { useSourceRead } from './useSourceRead';

export type HandoffOwner = { ownerKind: 'model' | 'software'; modelId: string; softwareId: string };
type Option = { value: string; label: string };
const modelOption = (row: HandoffModel): Option => ({ value: row.id, label: `${row.code} · ${row.name}` });

/** Menu-local domain picker: mirrors ItemFormParts without importing another menu. */
export function HandoffOwnerFields({ uid, value, onChange, disabled }: { uid: string; value: HandoffOwner; onChange: (patch: Partial<HandoffOwner>) => void; disabled: boolean }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [options, setOptions] = useState<Option[]>([]);
  const [picked, setPicked] = useState<Option | null>(null);
  const models = useSourceRead(handoffModelsEndpoint, { q: search || null, page, pageSize: 20 });
  const data = models.response?.outcome === 'ok' ? models.response.data : null;
  useEffect(() => {
    if (!data) return;
    const next = data.rows.filter(row => row.active).map(modelOption);
    setOptions(previous => page === 0 ? next : [...previous, ...next.filter(row => !previous.some(p => p.value === row.value))]);
  }, [data, page]);
  const shown = picked && !options.some(row => row.value === picked.value) ? [picked, ...options] : options;
  const hasMore = data !== null && (page + 1) * 20 < data.total;
  return <div className="grid gap-1.5">
    <FieldLabel htmlFor={`${uid}-model`} required>소유 대상</FieldLabel>
    <div className="grid gap-2">
      <RadioGroup appearance="segmented" aria-label="소유 종류" disabled={disabled} value={value.ownerKind} onValueChange={kind => onChange({ ownerKind: kind === 'software' ? 'software' : 'model', softwareId: '' })}>
        <RadioGroupItem appearance="segmented" value="model">모델</RadioGroupItem><RadioGroupItem appearance="segmented" value="software">SW 버전</RadioGroupItem>
      </RadioGroup>
      <Combobox id={`${uid}-model`} options={shown} value={value.modelId || null} disabled={disabled} filterOptions={false}
        onChange={modelId => { setPicked(shown.find(row => row.value === modelId) ?? null); onChange({ modelId, softwareId: '' }); }}
        onSearchChange={q => { setSearch(q); setPage(0); setOptions([]); }} placeholder="모델 선택" searchPlaceholder="모델 코드·이름 검색" listboxLabel="모델 목록" emptyText={models.loading ? '불러오는 중…' : '결과가 없습니다'} />
      {models.failed && <p role="alert" className="text-xs text-text-danger-label">모델 목록을 불러오지 못했습니다 <Button type="button" variant="ghost" size="sm" onClick={models.retry}>다시 시도</Button></p>}
      {hasMore && <div><Button type="button" variant="ghost" size="sm" disabled={disabled || models.loading} onClick={() => setPage(n => n + 1)}>모델 더 보기</Button></div>}
      {value.ownerKind === 'software' && <SoftwarePicker key={value.modelId} id={`${uid}-software`} modelId={value.modelId} value={value.softwareId} disabled={disabled} onChange={softwareId => onChange({ softwareId })} />}
    </div>
    <p className="text-xs text-text-muted">소유 대상은 모델 또는 SW 버전 하나입니다.</p>
  </div>;
}

function SoftwarePicker({ id, modelId, value, disabled, onChange }: { id: string; modelId: string; value: string; disabled: boolean; onChange: (id: string) => void }) {
  const read = useSourceRead(handoffSoftwareEndpoint, { modelId }, modelId !== '');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(20);
  const [picked, setPicked] = useState<Option | null>(null);
  const rows = read.response?.outcome === 'ok' ? read.response.data ?? [] : [];
  const matches = rows.filter(row => row.active && `${row.versionLabel} ${row.name}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const options = matches.slice(0, limit).map(row => ({ value: row.id, label: `${row.versionLabel} · ${row.name}` }));
  const shown = picked && !options.some(row => row.value === picked.value) ? [picked, ...options] : options;
  return <>
    <Combobox id={id} aria-label="SW 버전" options={shown} value={value || null} disabled={disabled || !modelId} filterOptions={false}
      onChange={next => { setPicked(shown.find(row => row.value === next) ?? null); onChange(next); }} onSearchChange={q => { setSearch(q); setLimit(20); }}
      placeholder="모델을 고른 뒤 SW 버전 선택" searchPlaceholder="버전 검색" listboxLabel="SW 버전 목록" emptyText={read.loading ? '불러오는 중…' : '이 모델에 활성 SW 버전이 없습니다'} />
    {read.failed && <p role="alert" className="text-xs text-text-danger-label">SW 버전 목록을 불러오지 못했습니다 <Button type="button" size="sm" variant="ghost" onClick={read.retry}>다시 시도</Button></p>}
    {matches.length > limit && <div><Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => setLimit(n => n + 20)}>SW 버전 더 보기</Button></div>}
  </>;
}
