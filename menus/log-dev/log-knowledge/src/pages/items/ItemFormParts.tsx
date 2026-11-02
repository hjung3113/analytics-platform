import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { ApiResponse, PageResult } from '@ap/contracts';
import { useMenuFetch } from '@ap/kernel';
import { Button, Combobox, FieldLabel, Input, RadioGroup, RadioGroupItem, cn } from '@ap/ui';
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

const FIELD = 'w-full rounded-md border border-border-subtle bg-surface-field px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export function TextArea({ rows = 4, className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={cn(FIELD, 'resize-y leading-6', className)} {...props} />;
}
export function NativeSelect({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(FIELD, 'h-10 py-0', className)} {...props} />;
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

type PickerShared = { id: string; invalid: boolean; describedBy: string | undefined };
function ModelPicker({ value, onChange, id, invalid, describedBy }: PickerShared & { value: string; onChange: (value: string) => void }) {
  const picker = useOptionPicker(modelsEndpoint);
  const { known, remember } = useChosenOption(modelsEndpoint, value, picker.options);
  const options = known && !picker.options.some(o => o.value === known.value) ? [known, ...picker.options] : picker.options;
  return <Combobox id={id} options={options} value={value || null} filterOptions={false}
    onChange={next => { remember(options.find(o => o.value === next) ?? null); onChange(next); }} onSearchChange={picker.setSearch}
    placeholder="모델 선택" searchPlaceholder="모델 코드·이름 검색" listboxLabel="모델 목록"
    {...(picker.hasMore ? { footerText: '일부만 보입니다 — 검색으로 좁혀 주세요' } : {})}
    emptyText={picker.loading ? '불러오는 중…' : picker.failed ? '불러오지 못했습니다' : '결과가 없습니다'} aria-invalid={invalid} aria-describedby={describedBy} />;
}
/** Active SW versions of one model; keyed by the model by the caller, so a model change starts a fresh list. */
function SoftwarePicker({ modelId, value, onChange, id, invalid, describedBy }: PickerShared & { modelId: string; value: string; onChange: (value: string) => void }) {
  const picker = useOptionPicker(softwareVersionsEndpoint, true, [{ id: 'modelId', op: 'in', value: [modelId] }]);
  const { known, remember } = useChosenOption(softwareVersionsEndpoint, value, picker.options);
  const options = known && !picker.options.some(o => o.value === known.value) ? [known, ...picker.options] : picker.options;
  return <Combobox id={id} options={options} value={value || null} filterOptions={false}
    onChange={next => { remember(options.find(o => o.value === next) ?? null); onChange(next); }} onSearchChange={picker.setSearch}
    placeholder="SW 버전 선택" searchPlaceholder="버전 검색" listboxLabel="SW 버전 목록"
    {...(picker.hasMore ? { footerText: '일부만 보입니다 — 검색으로 좁혀 주세요' } : {})}
    emptyText={picker.loading ? '불러오는 중…' : picker.failed ? '불러오지 못했습니다' : '이 모델에 활성 SW 버전이 없습니다'} aria-invalid={invalid} aria-describedby={describedBy} />;
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
        <NativeSelect id={`${uid}-ev-${i}-sourceKind`} value={row.sourceKind} onChange={e => patch(i, { sourceKind: e.target.value as EvidenceSourceKind })}>
          {EVIDENCE_SOURCE_KINDS.map(kind => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
        </NativeSelect>
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
