/** PROTOTYPE shared bits (#1194): status badge, deactivate confirmation, model form, local paging. Layout stays per variant. */
import { useCallback, useId, useState, type ReactNode } from 'react';
import { AlertTriangle, PowerOff, RotateCcw } from 'lucide-react';
import type { ApiResponse, ColumnFilter, ColumnFilterSpec, GroupedPageResult, PageSort, TableQuery } from '@ap/contracts';
import { filterRows, sortAndPage } from '@ap/contracts';
import type { TableUrlState } from '@ap/components';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Button, Callout, FieldLabel, Input, MultiCombobox, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StatusBadge, cn,
} from '@ap/ui';
import { duplicateModelCode, impactOf, ko, nameOf, statusLabel, type Catalog, type EntityKind, type ModelDraft, type SaveErrors, type Status, type StatusFilter } from './fixture';

export function StatusCell({ status }: { status: Status }) {
  return <StatusBadge tone={status === 'active' ? 'success' : 'neutral'}>{statusLabel[status]}</StatusBadge>;
}

export function UnclassifiedBadge() {
  return <StatusBadge tone="warning">미분류</StatusBadge>;
}

/** Process codes as compact chips; zero processes reads 미분류. */
export function ProcessChips({ catalog, ids, max = 3 }: { catalog: Catalog; ids: string[]; max?: number }) {
  if (ids.length === 0) return <UnclassifiedBadge />;
  const shown = ids.slice(0, max);
  return <span className="flex min-w-0 flex-wrap items-center gap-1">
    {shown.map(id => <span key={id} className="t-mono rounded-sm border border-border-subtle bg-surface-raised px-1.5 text-text-secondary">{nameOf(catalog, 'process', id)}</span>)}
    {ids.length > max && <span className="t-caption text-text-muted">+{ids.length - max}</span>}
  </span>;
}

export function StatusFilterSelect({ value, onChange, className }: { value: StatusFilter; onChange: (v: StatusFilter) => void; className?: string }) {
  return <Select value={value} onValueChange={v => onChange(v as StatusFilter)}>
    <SelectTrigger aria-label="상태" className={cn('h-8 w-28', className)}><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="active">활성</SelectItem>
      <SelectItem value="inactive">비활성</SelectItem>
      <SelectItem value="all">전체 상태</SelectItem>
    </SelectContent>
  </Select>;
}

export type DeactivateTarget = { kind: EntityKind; id: string } | null;

export function DeactivateDialog({ catalog, target, onCancel, onConfirm }: { catalog: Catalog; target: DeactivateTarget; onCancel: () => void; onConfirm: () => void }) {
  return <AlertDialog open={target != null} onOpenChange={open => { if (!open) onCancel(); }}>
    {target && <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{ko[target.kind]} {nameOf(catalog, target.kind, target.id)} 비활성화</AlertDialogTitle>
        <AlertDialogDescription>{impactOf(catalog, target.kind, target.id)}</AlertDialogDescription>
      </AlertDialogHeader>
      <p className="text-sm text-text-secondary">지우지 않습니다. 코드와 연결은 남고, 언제든 다시 활성화할 수 있습니다.</p>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={onCancel}>취소</AlertDialogCancel>
        <Button variant="destructive" onClick={onConfirm}>비활성화</Button>
      </AlertDialogFooter>
    </AlertDialogContent>}
  </AlertDialog>;
}

const TOPIC: Record<EntityKind, string> = { maker: '이 제조사는', process: '이 공정은', model: '이 모델은', version: '이 SW 버전은' };

/** An inactive item's notice with its reactivate action (no confirmation: reversible). */
export function InactiveNotice({ kind, onReactivate }: { kind: EntityKind; onReactivate: () => void }) {
  return <Callout tone="blue" icon={<PowerOff className="size-4" aria-hidden />} title={`비활성 ${ko[kind]}`}
    action={<Button size="sm" variant="secondary" onClick={onReactivate}><RotateCcw className="size-3.5" aria-hidden />다시 활성화</Button>}>
    {TOPIC[kind]} 새 연결에 쓰이지 않습니다. 코드와 기존 연결은 그대로 남습니다.
  </Callout>;
}

export function ConflictBanner({ onReload }: { onReload: () => void }) {
  return <div role="alert"><Callout tone="red" icon={<AlertTriangle className="size-4" aria-hidden />}
    action={<Button size="sm" variant="secondary" onClick={onReload}>새로 불러오기</Button>}>
    <span className="text-sm text-text-primary">다른 사람이 먼저 고쳤습니다 — 새로 불러오기</span>
    <span className="mt-0.5 block">불러오기 전까지 내 입력은 그대로 둡니다.</span>
  </Callout></div>;
}

/** The model create/edit form. The maker is fixed once the model exists (ADR-0107: no maker move in P0). */
export function ModelForm({ catalog, initial, initialErrors, onSave, onCancel, onDeactivate, footerClassName, extra }: {
  catalog: Catalog; initial: ModelDraft; initialErrors?: SaveErrors;
  onSave: (d: ModelDraft) => void; onCancel: () => void; onDeactivate?: () => void; footerClassName?: string; extra?: ReactNode;
}) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<SaveErrors>(initialErrors ?? {});
  const [search, setSearch] = useState('');
  const id = useId();
  const editing = initial.id != null;
  const processOptions = catalog.processes
    .filter(p => p.status === 'active' || draft.processIds.includes(p.id))
    .map(p => ({ value: p.id, label: `${p.code} · ${p.name}`, description: p.status === 'inactive' ? '비활성 공정' : undefined }));
  const maker = catalog.makers.find(m => m.id === draft.makerId);
  const submit = () => {
    const dup = duplicateModelCode(catalog, draft);
    const required = !draft.code.trim() ? '모델 코드를 입력하세요' : null;
    if (dup || required) { setErrors({ code: required ?? dup! }); return; }
    setErrors({});
    onSave(draft);
  };
  const reload = () => {
    const fresh = catalog.models.find(m => m.id === initial.id);
    if (fresh) setDraft({ id: fresh.id, makerId: fresh.makerId, code: fresh.code, name: fresh.name, processIds: fresh.processIds });
    setErrors({});
  };
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4">
      {errors.conflict && <ConflictBanner onReload={reload} />}
      <div className="grid gap-1.5">
        <FieldLabel htmlFor={`${id}-maker`} required>제조사</FieldLabel>
        {editing
          ? <><Input id={`${id}-maker`} value={maker?.name ?? ''} readOnly disabled aria-describedby={`${id}-maker-help`} />
            <p id={`${id}-maker-help`} className="t-caption text-text-muted">등록 후에는 제조사를 바꿀 수 없습니다.</p></>
          : <Select value={draft.makerId} onValueChange={v => setDraft(d => ({ ...d, makerId: v }))}>
            <SelectTrigger id={`${id}-maker`}><SelectValue placeholder="제조사 선택" /></SelectTrigger>
            <SelectContent>{catalog.makers.filter(m => m.status === 'active').map(m => <SelectItem key={m.id} value={m.id}>{m.name} ({m.code})</SelectItem>)}</SelectContent>
          </Select>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={`${id}-code`} required>모델 코드</FieldLabel>
          <Input id={`${id}-code`} value={draft.code} onChange={e => setDraft(d => ({ ...d, code: e.target.value }))}
            aria-invalid={errors.code ? true : undefined} aria-describedby={errors.code ? `${id}-code-err` : undefined} />
          {errors.code && <p id={`${id}-code-err`} className="t-caption text-text-danger">{errors.code}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={`${id}-name`} required>모델명</FieldLabel>
          <Input id={`${id}-name`} value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <FieldLabel id={`${id}-proc-label`}>공정</FieldLabel>
        <MultiCombobox aria-labelledby={`${id}-proc-label`} values={draft.processIds} onValuesChange={v => setDraft(d => ({ ...d, processIds: v }))}
          options={processOptions} getLabel={v => nameOf(catalog, 'process', v)} search={search} onSearchChange={setSearch}
          listboxLabel="공정 목록" emptyText="맞는 공정이 없습니다" selectedSummaryLabel={n => `공정 ${n}개 선택`} moreLabel="더 보기" clearAllLabel="모두 지우기"
          removeLabel={l => `${l} 빼기`} placeholder="공정 선택" searchPlaceholder="공정 검색" loadingText="불러오는 중" retryLabel="다시 시도" maxVisibleChips={6} />
        <p className="t-caption text-text-muted">공정은 여러 개 연결할 수 있습니다. 없으면 미분류로 보입니다.</p>
      </div>
      {extra}
    </div>
    <div className={cn('flex items-center gap-2 border-t border-border-subtle pt-3', footerClassName)}>
      {editing && onDeactivate && <Button variant="outline" size="sm" onClick={onDeactivate}>비활성화</Button>}
      <span className="flex-1" />
      <Button variant="secondary" size="sm" onClick={onCancel}>취소</Button>
      <Button size="sm" onClick={submit}>{editing ? '변경 저장' : '모델 등록'}</Button>
    </div>
  </div>;
}

/** Code + name form for makers and processes. */
export function SimpleForm({ kind, code, name, onCancel, onDeactivate }: { kind: 'maker' | 'process'; code: string; name: string; onCancel: () => void; onDeactivate?: () => void }) {
  const id = useId();
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex flex-1 flex-col gap-4 pb-4">
      <div className="grid gap-1.5"><FieldLabel htmlFor={`${id}-c`} required>{ko[kind]} 코드</FieldLabel><Input id={`${id}-c`} defaultValue={code} /></div>
      <div className="grid gap-1.5"><FieldLabel htmlFor={`${id}-n`} required>{kind === 'maker' ? '제조사명' : '공정명'}</FieldLabel><Input id={`${id}-n`} defaultValue={name} /></div>
    </div>
    <div className="flex items-center gap-2 border-t border-border-subtle pt-3">
      {onDeactivate && <Button variant="outline" size="sm" onClick={onDeactivate}>비활성화</Button>}
      <span className="flex-1" />
      <Button variant="secondary" size="sm" onClick={onCancel}>취소</Button>
      <Button size="sm" onClick={onCancel}>변경 저장</Button>
    </div>
  </div>;
}

/** Local paging for PlatformDataTable: the fixture plays the server. Array fields (`processIds`) match when any value is chosen; `__none` = empty. */
export function localPage<T>(rows: T[], arrayFields: readonly string[] = []) {
  return async (q: TableQuery): Promise<ApiResponse<GroupedPageResult<T>>> => {
    const own = (q.filters ?? []).filter(f => arrayFields.includes(f.id));
    const rest = (q.filters ?? []).filter(f => !arrayFields.includes(f.id));
    const byArray = rows.filter(r => own.every(f => {
      if (f.op !== 'in' && f.op !== 'notIn') return true;
      const vs = (r as Record<string, unknown>)[f.id] as string[];
      const hit = f.value.some(v => v === NONE ? vs.length === 0 : vs.includes(v));
      return f.op === 'in' ? hit : !hit;
    }));
    return { outcome: 'ok', data: sortAndPage(filterRows(byArray, rest), q), assessments: [], trust: null, correlationId: 'prototype' };
  };
}
export const NONE = '__none';

export const STATUS_FILTER: ColumnFilterSpec = { kind: 'enum', options: [{ value: 'active', label: '활성' }, { value: 'inactive', label: '비활성' }] };
export const ACTIVE_ONLY: ColumnFilter[] = [{ id: 'status', op: 'in', value: ['active'] }];

/** Table page/sort/filter state held in React state instead of the URL (prototype only; the real screen uses `useTableUrlState`). */
export function useLocalTableState(initial: ColumnFilter[]): [TableUrlState, (filters: ColumnFilter[]) => void] {
  const [state, setState] = useState<{ page: number | null; sorting: PageSort[]; filters: ColumnFilter[] }>({ page: null, sorting: [], filters: initial });
  return [{ ...state, onChange: next => setState(s => ({ page: next.page, sorting: next.sorting, filters: next.filters ?? s.filters })) },
    useCallback((filters: ColumnFilter[]) => setState({ page: null, sorting: [], filters }), [])];
}

export const includesText = (q: string, ...fields: string[]) => !q || fields.some(f => f.toLowerCase().includes(q.toLowerCase()));
