import { useEffect, useState } from 'react';
import { Button, Combobox, FieldLabel, Label, RadioGroup, RadioGroupItem } from '@ap/ui';
import { handoffModelsEndpoint, handoffSoftwareEndpoint, type HandoffModel } from '../endpoints';
import { useSourceRead } from './useSourceRead';

export type HandoffOwner = { ownerKind: 'model' | 'software'; modelId: string; softwareId: string };
type Option = { value: string; label: string };
const modelOption = (row: HandoffModel): Option => ({ value: row.id, label: `${row.code} · ${row.name}` });
function useRequiredPicker(id: string) {
  // Combobox forwards descriptions and invalid state, but has no required prop. Keep this semantic local to the form.
  useEffect(() => { document.getElementById(id)?.setAttribute('aria-required', 'true'); }, [id]);
}

/** Menu-local domain picker: mirrors ItemFormParts without importing another menu. */
export function HandoffOwnerFields({ uid, value, onChange, disabled, errors }: { uid: string; value: HandoffOwner; onChange: (patch: Partial<HandoffOwner>) => void; disabled: boolean; errors: { model?: string; software?: string } }) {
  useRequiredPicker(`${uid}-model`);
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
      <Combobox id={`${uid}-model`} aria-invalid={!!errors.model} aria-describedby={`${uid}-owner-hint${errors.model ? ` ${uid}-model-error` : ''}`} options={shown} value={value.modelId || null} disabled={disabled} filterOptions={false}
        onChange={modelId => { setPicked(shown.find(row => row.value === modelId) ?? null); onChange({ modelId, softwareId: '' }); }}
        onSearchChange={q => { setSearch(q); setPage(0); setOptions([]); }} placeholder="모델 선택" searchPlaceholder="모델 코드·이름 검색" listboxLabel="모델 목록" emptyText={models.loading ? '불러오는 중…' : '결과가 없습니다'} {...(hasMore ? { footerText: '일부만 표시. 검색하거나 아래 더 보기를 누르세요' } : {})} />
      {errors.model && <p id={`${uid}-model-error`} className="text-xs text-text-danger-label">{errors.model}</p>}
      {models.failed && <div className="flex items-center gap-2 text-xs text-text-danger-label"><span role="alert">모델 목록을 불러오지 못했습니다</span><Button type="button" variant="ghost" size="sm" onClick={models.retry}>다시 시도</Button></div>}
      {hasMore && <div><Button type="button" variant="ghost" size="sm" disabled={disabled || models.loading} onClick={() => setPage(n => n + 1)}>모델 더 보기</Button></div>}
      {value.ownerKind === 'software' && <SoftwarePicker key={value.modelId} id={`${uid}-software`} hintId={`${uid}-owner-hint`} error={errors.software} modelId={value.modelId} value={value.softwareId} disabled={disabled} onChange={softwareId => onChange({ softwareId })} />}
    </div>
    <p id={`${uid}-owner-hint`} className="text-xs text-text-muted">소유 대상은 모델 또는 SW 버전 하나입니다.</p>
  </div>;
}

function SoftwarePicker({ id, modelId, value, disabled, onChange, hintId, error }: { id: string; modelId: string; value: string; disabled: boolean; onChange: (id: string) => void; hintId: string; error: string | undefined }) {
  useRequiredPicker(id);
  const read = useSourceRead(handoffSoftwareEndpoint, { modelId }, modelId !== '');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(20);
  const [picked, setPicked] = useState<Option | null>(null);
  const rows = read.response?.outcome === 'ok' ? read.response.data ?? [] : [];
  const matches = rows.filter(row => row.active && `${row.versionLabel} ${row.name}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const options = matches.slice(0, limit).map(row => ({ value: row.id, label: `${row.versionLabel} · ${row.name}` }));
  const shown = picked && !options.some(row => row.value === picked.value) ? [picked, ...options] : options;
  return <>
    <Label htmlFor={id} className="sr-only">SW 버전</Label>
    <Combobox id={id} aria-invalid={!!error} aria-describedby={`${hintId}${error ? ` ${id}-error` : ''}`} options={shown} value={value || null} disabled={disabled || !modelId} filterOptions={false}
      onChange={next => { setPicked(shown.find(row => row.value === next) ?? null); onChange(next); }} onSearchChange={q => { setSearch(q); setLimit(20); }}
      placeholder="모델을 고른 뒤 SW 버전 선택" searchPlaceholder="버전 검색" listboxLabel="SW 버전 목록" emptyText={read.loading ? '불러오는 중…' : '이 모델에 활성 SW 버전이 없습니다'} {...(matches.length > limit ? { footerText: '일부만 표시. 검색하거나 아래 더 보기를 누르세요' } : {})} />
    {error && <p id={`${id}-error`} className="text-xs text-text-danger-label">{error}</p>}
    {read.failed && <div className="flex items-center gap-2 text-xs text-text-danger-label"><span role="alert">SW 버전 목록을 불러오지 못했습니다</span><Button type="button" size="sm" variant="ghost" onClick={read.retry}>다시 시도</Button></div>}
    {matches.length > limit && <div><Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => setLimit(n => n + 20)}>SW 버전 더 보기</Button></div>}
  </>;
}
