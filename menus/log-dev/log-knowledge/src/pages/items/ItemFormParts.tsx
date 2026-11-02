import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { ApiResponse, PageResult } from '@ap/contracts';
import { useMenuFetch } from '@ap/kernel';
import { Button, Combobox, DirtyConfirmation, FieldLabel, Input, RadioGroup, RadioGroupItem, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@ap/ui';
import { ITEM_LIMITS, EVIDENCE_SOURCE_KINDS, modelsEndpoint, softwareVersionsEndpoint, type CatalogPageParams, type EvidenceSourceKind } from '../../endpoints';
import { useOptionPicker, toOption, type Option } from '../useCatalogOptions';
import { emptyEvidence, evidenceKey, type EvidenceRow, type WriteForm } from './itemWriteModel';

export function Field({ id, label, error, hint, required, badge, children }: { id: string; label: string; error?: string | undefined; hint?: string; required?: boolean; badge?: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5">
    <FieldLabel htmlFor={id} required={required}>{label}{badge && <span className="ml-1.5 rounded-sm border border-border-default px-1 text-tiny font-normal text-text-muted">{badge}</span>}</FieldLabel>
    {children}
    {hint && !error && <p id={`${id}-hint`} className="text-xs text-text-muted">{hint}</p>}
    {error && <p id={`${id}-error`} role="alert" className="text-xs text-text-danger-label">{error}</p>}
  </div>;
}

/** The chosen option's label survives a changing list; a value given without a label (an address `owner`) is read once by id. */
function useChosenOption(endpoint: typeof modelsEndpoint | typeof softwareVersionsEndpoint, value: string, options: readonly Option[]) {
  const { fetch } = useMenuFetch(endpoint as unknown as Parameters<typeof useMenuFetch<CatalogPageParams, PageResult<{ id: string; name: string; code: string; active: boolean }>>>[0]);
  const fetchRef = useRef(fetch);
  useEffect(() => { fetchRef.current = fetch; });
  const [picked, setPicked] = useState<Option | null>(null);
  const known = options.find(o => o.value === value) ?? (picked?.value === value ? picked : null);
  useEffect(() => {
    if (value === '' || known) return;
    const controller = new AbortController();
    void (async () => {
      const res: ApiResponse<PageResult<{ id: string; name: string; code: string; active: boolean }>> = await fetchRef.current({ q: null, page: 0, pageSize: 1, sorting: [{ id: 'createdAt', desc: false }], filters: [{ id: 'id', op: 'in', value: [value] }] }, controller.signal);
      const row = res.outcome === 'ok' || res.outcome === 'empty' ? res.data?.rows.find(r => r.id === value) : undefined;
      if (row && !controller.signal.aborted) setPicked(toOption(row));
    })().catch(() => undefined);
    return () => controller.abort();
  }, [value, known]);
  return { known, remember: setPicked };
}

/** The next page of a picker's matches (and a failed page's retry), beside the combobox: the single-select `Combobox` has no load-more row of its own. */
function PickerPaging({ picker, label }: { picker: Pick<ReturnType<typeof useOptionPicker>, 'hasMore' | 'failed' | 'loading' | 'loadMore' | 'retry'>; label: string }) {
  if (picker.failed) return <div className="flex items-center gap-2 text-xs text-text-danger-label"><span role="alert">{label} 목록을 불러오지 못했습니다</span><Button type="button" size="sm" variant="ghost" onClick={picker.retry}>다시 시도</Button></div>;
  if (!picker.hasMore) return null;
  return <div><Button type="button" size="sm" variant="ghost" disabled={picker.loading} onClick={picker.loadMore}>{picker.loading ? '불러오는 중…' : `${label} 더 보기`}</Button></div>;
}

type PickerShared = { id: string; invalid: boolean; describedBy: string | undefined };
function ModelPicker({ value, onChange, id, invalid, describedBy }: PickerShared & { value: string; onChange: (value: string) => void }) {
  const picker = useOptionPicker(modelsEndpoint);
  const { known, remember } = useChosenOption(modelsEndpoint, value, picker.options);
  const options = known && !picker.options.some(o => o.value === known.value) ? [known, ...picker.options] : picker.options;
  return <><Combobox id={id} options={options} value={value || null} filterOptions={false}
    onChange={next => { remember(options.find(o => o.value === next) ?? null); onChange(next); }} onSearchChange={picker.setSearch}
    placeholder="모델 선택" searchPlaceholder="모델 코드·이름 검색" listboxLabel="모델 목록"
    {...(picker.hasMore ? { footerText: '일부만 보입니다 — 검색하거나 아래 더 보기를 누르세요' } : {})}
    emptyText={picker.loading ? '불러오는 중…' : picker.failed ? '불러오지 못했습니다' : '결과가 없습니다'} aria-invalid={invalid} aria-describedby={describedBy} />
    <PickerPaging picker={picker} label="모델" /></>;
}
/** Active SW versions of one model; keyed by the model by the caller, so a model change starts a fresh list. */
function SoftwarePicker({ modelId, value, onChange, id, invalid, describedBy }: PickerShared & { modelId: string; value: string; onChange: (value: string) => void }) {
  const picker = useOptionPicker(softwareVersionsEndpoint, true, [{ id: 'modelId', op: 'in', value: [modelId] }]);
  const { known, remember } = useChosenOption(softwareVersionsEndpoint, value, picker.options);
  const options = known && !picker.options.some(o => o.value === known.value) ? [known, ...picker.options] : picker.options;
  return <><Combobox id={id} options={options} value={value || null} filterOptions={false}
    onChange={next => { remember(options.find(o => o.value === next) ?? null); onChange(next); }} onSearchChange={picker.setSearch}
    placeholder="SW 버전 선택" searchPlaceholder="버전 검색" listboxLabel="SW 버전 목록"
    {...(picker.hasMore ? { footerText: '일부만 보입니다 — 검색하거나 아래 더 보기를 누르세요' } : {})}
    emptyText={picker.loading ? '불러오는 중…' : picker.failed ? '불러오지 못했습니다' : '이 모델에 활성 SW 버전이 없습니다'} aria-invalid={invalid} aria-describedby={describedBy} />
    <PickerPaging picker={picker} label="SW 버전" /></>;
}

/** 소유 종류 (모델 | SW 버전) → 모델 → (SW 버전). Changing the model clears the SW version; switching to 모델 drops it. */
export function OwnerPicker({ uid, form, onChange, error }: { uid: string; form: Pick<WriteForm, 'ownerKind' | 'modelId' | 'softwareId'>; onChange: (patch: Partial<WriteForm>) => void; error: string | undefined }) {
  const describedBy = error ? `${uid}-owner-error` : undefined;
  return <Field id={`${uid}-owner`} label="소유 대상" required error={error} hint="Item마다 소유 대상은 하나이고 등록 후에는 바꿀 수 없습니다">
    <div className="grid gap-2">
      <RadioGroup appearance="segmented" aria-label="소유 종류" value={form.ownerKind} onValueChange={next => onChange({ ownerKind: next === 'software' ? 'software' : 'model', softwareId: '' })}>
        <RadioGroupItem appearance="segmented" value="model">모델</RadioGroupItem>
        <RadioGroupItem appearance="segmented" value="software">SW 버전</RadioGroupItem>
      </RadioGroup>
      <ModelPicker id={`${uid}-owner`} value={form.modelId} onChange={modelId => onChange({ modelId, softwareId: '' })} invalid={error !== undefined} describedBy={describedBy} />
      {form.ownerKind === 'software' && (form.modelId === '' ? <p className="text-xs text-text-muted">모델을 고르면 그 모델의 SW 버전을 고를 수 있습니다</p>
        : <SoftwarePicker key={form.modelId} id={`${uid}-owner-sw`} modelId={form.modelId} value={form.softwareId} onChange={softwareId => onChange({ softwareId })} invalid={error !== undefined} describedBy={describedBy} />)}
    </div>
  </Field>;
}

const KIND_LABEL: Record<EvidenceSourceKind, string> = { log_file: '로그 파일', spec: '명세', image: '이미지', validation_run: '검증 실행', other: '기타' };

export function EvidenceEditor({ uid, rows, onChange, errors }: { uid: string; rows: EvidenceRow[]; onChange: (rows: EvidenceRow[]) => void; errors: Record<string, string> }) {
  const patch = (i: number, change: Partial<EvidenceRow>) => onChange(rows.map((row, at) => (at === i ? { ...row, ...change } : row)));
  const text = (i: number, field: keyof EvidenceRow, label: string, required = false) => {
    const key = evidenceKey(i, field), id = `${uid}-ev-${i}-${field}`;
    return <Field key={field} id={id} label={label} required={required} error={errors[key]}>
      <Input id={id} value={rows[i]![field]} onChange={e => patch(i, { [field]: e.target.value })} aria-invalid={errors[key] !== undefined} aria-describedby={errors[key] ? `${id}-error` : undefined} />
    </Field>;
  };
  return <div className="grid gap-2">
    {errors['evidenceList'] && <p role="alert" className="text-xs text-text-danger-label">{errors['evidenceList']}</p>}
    {rows.map((row, i) => <fieldset key={i} className="grid gap-2 rounded-md border border-border-subtle bg-surface-card p-3">
      <legend className="flex items-center gap-2 px-1 text-xs font-semibold text-text-secondary">
        근거 {i + 1}
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`근거 ${i + 1} 빼기`} onClick={() => onChange(rows.filter((_, at) => at !== i))}><X className="size-3.5" aria-hidden /></Button>
      </legend>
      {errors[`evidence.${i}`] && <p role="alert" className="text-xs text-text-danger-label">{errors[`evidence.${i}`]}</p>}
      <Field id={`${uid}-ev-${i}-sourceKind`} label="출처 종류" error={errors[evidenceKey(i, 'sourceKind')]}>
        <Select value={row.sourceKind} onValueChange={next => patch(i, { sourceKind: next as EvidenceSourceKind })}>
          <SelectTrigger appearance="field" id={`${uid}-ev-${i}-sourceKind`} aria-invalid={errors[evidenceKey(i, 'sourceKind')] !== undefined} aria-describedby={errors[evidenceKey(i, 'sourceKind')] ? `${uid}-ev-${i}-sourceKind-error` : undefined}><SelectValue placeholder="종류를 골라 주세요" /></SelectTrigger>
          <SelectContent>{EVIDENCE_SOURCE_KINDS.map(kind => <SelectItem key={kind} value={kind}>{KIND_LABEL[kind]}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">{text(i, 'sourceOwner', '출처 소유', true)}{text(i, 'sourceRef', '참조', true)}</div>
      <div className="grid grid-cols-3 gap-2">{text(i, 'sourceVersion', '버전')}{text(i, 'contentHash', '해시')}{text(i, 'locator', '위치')}</div>
      {text(i, 'note', '메모')}
    </fieldset>)}
    <div><Button type="button" size="sm" variant="secondary" disabled={rows.length >= ITEM_LIMITS.evidence} onClick={() => onChange([...rows, emptyEvidence()])}><Plus className="size-3.5" aria-hidden />근거 추가</Button>
      <span className="ml-2 text-xs text-text-muted">{rows.length}/{ITEM_LIMITS.evidence}</span></div>
  </div>;
}

/**
 * The item version a drawer's form is built on. A conflict makes the engine re-read the item, but the form must keep its banner and the user's
 * unsaved input: the form is rebuilt (keyed by `synced`) only after the user asks for the reload (`sync`) and the re-read has brought a new version.
 */
export function useSyncedVersion(live: string) {
  const [state, setState] = useState({ synced: live, waiting: false });
  if (state.waiting && live !== state.synced) setState({ synced: live, waiting: false });
  return { synced: state.synced, sync: () => setState(s => ({ ...s, waiting: true })) };
}

/**
 * Closing a drawer with unsaved input asks first. `request` is what Escape, the close button and 취소 call; `force` closes without asking
 * (after a save). The form reports whether it differs from its start through `markDirty`; `dialog` is rendered once beside the drawer.
 */
export function useCloseGuard(onClose: () => void) {
  const dirty = useRef(false);
  const [asking, setAsking] = useState(false);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  const request = () => { if (dirty.current) setAsking(true); else closeRef.current(); };
  const dialog = <DirtyConfirmation open={asking} title="작성 중인 내용이 사라집니다. 닫을까요?" message="닫으면 입력한 내용을 되찾을 수 없습니다." confirmLabel="닫기" cancelLabel="계속 작성"
    onCancel={() => setAsking(false)} onConfirm={() => { setAsking(false); dirty.current = false; closeRef.current(); }} />;
  const markDirty = useCallback((value: boolean) => { dirty.current = value; }, []);
  return { markDirty, request, force: () => { dirty.current = false; closeRef.current(); }, dialog };
}

/** Whether `value` differs from what it was when the form first mounted; reports each change to `markDirty`. */
export function useDirtyReport(value: unknown, markDirty: (dirty: boolean) => void): void {
  const [start] = useState(() => JSON.stringify(value));
  const now = JSON.stringify(value) !== start;
  useEffect(() => { markDirty(now); }, [now, markDirty]);
}
