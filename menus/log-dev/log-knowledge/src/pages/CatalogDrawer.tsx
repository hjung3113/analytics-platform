import { useCallback, useEffect, useEffectEvent, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { encodeFilterParams, type ActionResult, type ActionSpec, type ApiResponse, type PageResult } from '@ap/contracts';
import { PlatformLink, useMenuAction, useMenuFetch, useMenuQuery, usePlatform, useUnsavedGuard } from '@ap/kernel';
import { DetailDrawer } from '@ap/components';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Button, Callout, Combobox, FieldLabel, Input, MultiCombobox, StatusBadge,
} from '@ap/ui';
import {
  modelCreate, modelSetActive, modelUpdate, modelsEndpoint, processCreate, processSetActive, processUpdate, processesEndpoint, softwareCreate, softwareSetActive, softwareUpdate,
  softwareVersionsEndpoint, vendorCreate, vendorSetActive, vendorUpdate, vendorsEndpoint, type CatalogPageParams, type CatalogSummary, type ModelRow, type SoftwareRow,
} from '../endpoints';
import { ACTIVE_ONLY, TAB_LABEL, failureText, impactText, mapFieldErrors, type Banner, type CatalogKind, type CatalogRow } from './catalogModel';
import { useOptionPicker, type Option } from './useCatalogOptions';
import { useCloseGuard, type GuardedLeave } from './items/ItemFormParts';

type Write = ActionSpec<Record<string, unknown>, CatalogSummary>;
const asWrite = (spec: unknown) => spec as Write;
const ACTIONS: Record<CatalogKind, { create: Write; update: Write; setActive: Write; fields: readonly string[] }> = {
  vendor: { create: asWrite(vendorCreate), update: asWrite(vendorUpdate), setActive: asWrite(vendorSetActive), fields: ['code', 'name'] },
  process: { create: asWrite(processCreate), update: asWrite(processUpdate), setActive: asWrite(processSetActive), fields: ['code', 'name'] },
  model: { create: asWrite(modelCreate), update: asWrite(modelUpdate), setActive: asWrite(modelSetActive), fields: ['vendorId', 'code', 'name', 'processIds'] },
  software: { create: asWrite(softwareCreate), update: asWrite(softwareUpdate), setActive: asWrite(softwareSetActive), fields: ['modelId', 'versionLabel', 'name'] },
};
const ENDPOINTS = { vendor: vendorsEndpoint, process: processesEndpoint, model: modelsEndpoint, software: softwareVersionsEndpoint } as const;
const NO_ROW = 'new';

type Lookup = { state: 'loading' } | { state: 'ready'; row: CatalogRow | null } | { state: 'missing' } | { state: 'error' };
type Held = { key: string; lookup: Lookup };

/**
 * The row behind `focus=<id>`: from the pages the table already read, else one read with `id in [focus]` (no paging, no scan).
 * The result is scoped to (kind, focus): a result held for another row is never returned, so the form never shows or writes another row.
 * `reload()` skips the cache (a conflict or a save needs the server's row) and starts over for the next row.
 */
export function useCatalogRow(kind: CatalogKind, focus: string, rowsRef: RefObject<Map<string, CatalogRow>>) {
  const endpoint = ENDPOINTS[kind] as unknown as Parameters<typeof useMenuFetch<CatalogPageParams, PageResult<CatalogRow>>>[0];
  const { fetch } = useMenuFetch(endpoint);
  const fetchRef = useRef(fetch);
  useEffect(() => { fetchRef.current = fetch; });
  const key = `${kind}:${focus}`;
  const [held, setHeld] = useState<Held>(() => ({ key, lookup: focus === NO_ROW ? { state: 'ready', row: null } : { state: 'loading' } }));
  const [reloads, setReloads] = useState({ key, n: 0 });
  const n = reloads.key === key ? reloads.n : 0;
  useEffect(() => {
    if (focus === NO_ROW) { setHeld({ key, lookup: { state: 'ready', row: null } }); return; }
    const cached = n === 0 ? rowsRef.current.get(focus.toLowerCase()) : undefined;
    if (cached) { setHeld({ key, lookup: { state: 'ready', row: cached } }); return; }
    const controller = new AbortController();
    // A reload of the same row keeps the row on screen until the server answers; any other row starts empty.
    setHeld(prev => (prev.key === key && prev.lookup.state === 'ready' && n > 0 ? prev : { key, lookup: { state: 'loading' } }));
    const settle = (lookup: Lookup) => { if (!controller.signal.aborted) setHeld({ key, lookup }); };
    (async () => {
      const res: ApiResponse<PageResult<CatalogRow>> = await fetchRef.current({ q: null, page: 0, pageSize: 1, sorting: [{ id: 'createdAt', desc: false }], filters: [{ id: 'id', op: 'in', value: [focus.toLowerCase()] }] }, controller.signal);
      if (res.outcome !== 'ok' && res.outcome !== 'empty') { settle({ state: 'error' }); return; }
      const found = res.data?.rows.find(r => r.id === focus.toLowerCase());
      if (found) { rowsRef.current.set(found.id, found); settle({ state: 'ready', row: found }); } else settle({ state: 'missing' });
    })().catch(() => settle({ state: 'error' }));
    return () => controller.abort();
  }, [kind, focus, key, n, rowsRef]);
  const lookup: Lookup = held.key === key ? held.lookup : focus === NO_ROW ? { state: 'ready', row: null } : { state: 'loading' };
  return { lookup, reload: useCallback(() => setReloads(r => ({ key, n: (r.key === key ? r.n : 0) + 1 })), [key]) };
}

function Field({ id, label, error, hint, required, children }: { id: string; label: string; error?: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return <div className="grid gap-1.5">
    <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>
    {children}
    {hint && !error && <p id={`${id}-hint`} className="text-xs text-text-muted">{hint}</p>}
    {error && <p id={`${id}-error`} role="alert" className="text-xs text-text-danger-label">{error}</p>}
  </div>;
}

type PickerProps = { id: string; invalid: boolean; describedBy: string | undefined };
/** 설비사 / 모델 chooser of a new row: server search over the declared read, the chosen one kept visible while the text changes. */
function ParentPicker({ kind, value, onChange, id, invalid, describedBy }: PickerProps & { kind: 'model' | 'software'; value: string; onChange: (value: string) => void }) {
  const label = kind === 'model' ? '설비사' : '모델';
  const picker = useOptionPicker(kind === 'model' ? vendorsEndpoint : modelsEndpoint);
  const [picked, setPicked] = useState<Option | null>(null);
  const options = picked && !picker.options.some(o => o.value === picked.value) ? [picked, ...picker.options] : picker.options;
  return <Combobox id={id} options={options} value={value || null} filterOptions={false}
    onChange={next => { setPicked(options.find(o => o.value === next) ?? null); onChange(next); }} onSearchChange={picker.setSearch}
    placeholder={`${label} 선택`} searchPlaceholder={`${label} 검색`} listboxLabel={`${label} 목록`} emptyText={picker.loading ? '불러오는 중…' : picker.failed ? '불러오지 못했습니다' : '결과가 없습니다'}
    aria-invalid={invalid} aria-describedby={describedBy} />;
}

/** 공정 chooser: server search and load-more; chips of chosen processes keep their names while the list changes. */
function ProcessPicker({ values, onChange, known, id, invalid, describedBy }: PickerProps & { values: string[]; onChange: (values: string[]) => void; known: ReadonlyMap<string, string> }) {
  const picker = useOptionPicker(processesEndpoint);
  const [names, setNames] = useState(() => new Map(known));
  useEffect(() => { setNames(prev => { let next = prev; for (const o of picker.options) if (prev.get(o.value) !== o.label) { if (next === prev) next = new Map(prev); next.set(o.value, o.label); } return next; }); }, [picker.options]);
  const options = [...picker.options, ...values.filter(v => !picker.options.some(o => o.value === v)).map(v => ({ value: v, label: names.get(v) ?? v, disabled: false }))];
  return <MultiCombobox id={id} label="공정" values={values} onValuesChange={onChange} options={options} getLabel={value => names.get(value) ?? value}
    search={picker.search} onSearchChange={picker.setSearch} loading={picker.loading} error={picker.failed ? '공정을 불러오지 못했습니다' : undefined} onRetry={picker.retry}
    hasMore={picker.hasMore} onLoadMore={picker.loadMore}
    listboxLabel="공정 목록" emptyText="결과가 없습니다" loadingText="불러오는 중…" retryLabel="다시 시도" placeholder="공정 선택" searchPlaceholder="공정 검색"
    selectedSummaryLabel={n => `공정 ${n}개 선택`} moreLabel="더 보기" clearAllLabel="모두 지우기" removeLabel={name => `${name} 빼기`}
    aria-invalid={invalid} aria-describedby={describedBy} />;
}

function ModelSoftware({ modelId }: { modelId: string }) {
  const params = useMemo<CatalogPageParams>(() => ({ q: null, page: 0, pageSize: 20, sorting: [{ id: 'createdAt', desc: true }], filters: [{ id: 'modelId', op: 'in', value: [modelId] }] }), [modelId]);
  const { response } = useMenuQuery(softwareVersionsEndpoint, params);
  const { linkTo } = usePlatform();
  const rows = response?.outcome === 'ok' ? (response.data as PageResult<SoftwareRow>).rows : null;
  const total = response?.outcome === 'ok' ? (response.data as PageResult<SoftwareRow>).total : 0;
  const href = linkTo('log-knowledge-catalog', { page: { tab: 'software', filter: encodeFilterParams([ACTIVE_ONLY, { id: 'modelId', op: 'in', value: [modelId] }]) } });
  if (!rows) return <p className="text-sm text-text-muted">{response ? 'SW 버전을 불러오지 못했습니다.' : '불러오는 중…'}</p>;
  return <div className="grid gap-3">
    {rows.length === 0 ? <p className="text-sm text-text-muted">등록된 SW 버전이 없습니다.</p>
      : <ul className="grid gap-1.5">{rows.map(r => <li key={r.id} className="flex items-center gap-2 text-sm">
        <span className="t-mono">{r.versionLabel}</span><span className="text-text-secondary">{r.name}</span>
        <StatusBadge tone={r.active ? 'success' : 'neutral'}>{r.active ? '활성' : '비활성'}</StatusBadge>
      </li>)}</ul>}
    {total > rows.length && <p className="text-xs text-text-muted">외 {total - rows.length}개</p>}
    <Button asChild size="sm" variant="secondary"><PlatformLink href={href}>SW 버전 탭에서 보기</PlatformLink></Button>
  </div>;
}

function CatalogForm({ kind, row, options, onWritten, onReload, onClose, markDirty, released }: {
  kind: CatalogKind; row: CatalogRow | null; options: { vendors: Option[]; processes: Option[]; models: Option[] };
  onWritten: () => void; onReload: () => void; onClose: () => void; markDirty: (dirty: boolean) => void; released: boolean;
}) {
  const { setPage, toast } = usePlatform();
  const actions = ACTIONS[kind];
  const create = useMenuAction(actions.create), update = useMenuAction(actions.update), setActive = useMenuAction(actions.setActive);
  const uid = useId();
  const isNew = row === null;
  const model = kind === 'model' ? (row as ModelRow | null) : null;
  const [values, setValues] = useState<Record<string, string>>(() => ({
    code: row && kind !== 'software' ? row.code : '', versionLabel: row && kind === 'software' ? row.code : '', name: row?.name ?? '',
    vendorId: model?.vendorId ?? '', modelId: kind === 'software' ? ((row as SoftwareRow | null)?.modelId ?? '') : '',
  }));
  const [processIds, setProcessIds] = useState<string[]>(() => model?.processes.map(p => p.id) ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<Banner | null>(null);
  const [confirming, setConfirming] = useState(false);
  const busy = create.pending || update.pending || setActive.pending;
  const set = (field: string, value: string) => setValues(v => ({ ...v, [field]: value }));
  // ADR-0115: typed input differs from what the form opened with. Esc, the close button and 취소 ask through the drawer's close guard;
  // any other address change (Back, a link, another row) asks through the platform guard. The guard is off once the person confirmed the
  // discard (`released`) or a new row was created, and the focus write happens after that commit so the shell never asks a second time.
  const snapshot = JSON.stringify({ values, processIds });
  const [start] = useState(snapshot);
  const dirty = snapshot !== start;
  const [createdId, setCreatedId] = useState<string | null>(null);
  useEffect(() => { markDirty(dirty); }, [dirty, markDirty]);
  useEffect(() => () => markDirty(false), [markDirty]);
  useUnsavedGuard(dirty && !released && createdId === null, { leaves: 'address' });
  const openCreated = useEffectEvent((id: string) => setPage({ focus: id }));
  useEffect(() => { if (createdId !== null) openCreated(createdId); }, [createdId]);

  function settle(res: ActionResult<CatalogSummary>, onOk: (data: CatalogSummary | null) => void) {
    // ok, conflict and unknown may have changed the rows: the table reads again.
    if (res.outcome === 'ok' || res.outcome === 'conflict' || res.outcome === 'unknown') onWritten();
    if (res.outcome === 'ok') { setBanner(null); setErrors({}); onOk(res.data); return; }
    if (res.outcome === 'conflict') { setBanner({ kind: 'conflict' }); return; }
    const mapped = res.outcome === 'invalid' ? mapFieldErrors(res.fieldErrors, actions.fields) : {};
    setErrors(mapped);
    const formError = mapped['form'];
    if (res.outcome === 'invalid' && Object.keys(mapped).length > 0 && !formError) { setBanner(null); return; }
    setBanner({ kind: 'failed', text: formError ?? failureText(res.outcome), ...(res.retry ? { retry: () => { const retry = res.retry; if (retry) void retry().then(next => settle(next, onOk)).catch(() => undefined); } } : {}) });
  }
  const input = (): Record<string, unknown> => {
    const base = kind === 'software' ? { versionLabel: values['versionLabel'], name: values['name'] } : { code: values['code'], name: values['name'] };
    const parent = kind === 'model' ? { vendorId: values['vendorId'] } : kind === 'software' ? { modelId: values['modelId'] } : {};
    const processes = kind === 'model' ? { processIds } : {};
    return row ? { id: row.id, ...base, ...processes } : { ...parent, ...base, ...processes };
  };
  const save = () => {
    const run = row ? update.run(input(), { expectedVersion: row.version }) : create.run(input());
    void run.then(res => settle(res, data => {
      toast(row ? '저장했습니다' : `${TAB_LABEL[kind]}을(를) 추가했습니다`, 'info');
      if (row) onReload(); else if (data) setCreatedId(data.id);
    })).catch(() => undefined);
  };
  const toggle = (active: boolean) => {
    if (!row) return;
    setConfirming(false);
    void setActive.run({ id: row.id, active }, { expectedVersion: row.version }).then(res => settle(res, () => { toast(active ? '다시 활성화했습니다' : '비활성화했습니다', 'info'); onReload(); })).catch(() => undefined);
  };

  const codeField = kind === 'software' ? 'versionLabel' : 'code';
  const err = (field: string) => errors[field];
  const describedBy = (field: string) => (err(field) ? `${uid}-${field}-error` : undefined);
  const parentField = kind === 'model' ? 'vendorId' : 'modelId';
  const parentLabel = kind === 'model' ? '설비사' : '모델';
  const knownProcesses = new Map((model?.processes ?? []).map(p => [p.id, p.name] as const));
  return <form className="flex min-h-full flex-col gap-4" noValidate onSubmit={event => { event.preventDefault(); if (!busy) save(); }}>
    {row && !row.active && <div role="status" className="grid gap-2 rounded-md border border-border-subtle bg-surface-sunken p-3">
      <p className="text-sm font-semibold">비활성 {TAB_LABEL[kind]}</p>
      <p className="text-xs text-text-secondary">비활성 항목이라 새 연결을 만들 수 없습니다. 코드와 기존 연결은 그대로 남습니다.</p>
      <div><Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => toggle(true)}>다시 활성화</Button></div>
    </div>}
    {banner?.kind === 'conflict' && <Callout tone="amber" title="다른 사람이 먼저 고쳤습니다" action={<Button type="button" size="sm" variant="secondary" onClick={() => { setBanner(null); setErrors({}); onReload(); }}>새로 불러오기</Button>}>
      저장하지 않은 입력은 새로 불러오면 사라집니다.
    </Callout>}
    {banner?.kind === 'failed' && <Callout tone="red" title="저장하지 못했습니다" action={banner.retry ? <Button type="button" size="sm" variant="secondary" onClick={banner.retry}>다시 시도</Button> : undefined}>{banner.text}</Callout>}
    {(kind === 'model' || kind === 'software') && <Field id={`${uid}-${parentField}`} label={parentLabel} required error={err(parentField)}
      hint={isNew ? undefined : `등록 후에는 ${parentLabel}${kind === 'model' ? '를' : '을'} 바꿀 수 없습니다`}>
      {isNew
        ? <ParentPicker kind={kind} id={`${uid}-${parentField}`} value={values[parentField] ?? ''} onChange={value => set(parentField, value)} invalid={err(parentField) !== undefined} describedBy={describedBy(parentField)} />
        : <p className="text-sm" id={`${uid}-${parentField}`}>{kind === 'model' ? model?.vendorName : options.models.find(o => o.value === values[parentField])?.label ?? values[parentField]}</p>}
    </Field>}
    <div className="grid grid-cols-2 gap-3">
      <Field id={`${uid}-${codeField}`} label={kind === 'software' ? '버전 표기' : '코드'} required error={err(codeField)}>
        <Input id={`${uid}-${codeField}`} value={values[codeField]} onChange={e => set(codeField, e.target.value)} aria-invalid={err(codeField) !== undefined} aria-describedby={describedBy(codeField)} />
      </Field>
      <Field id={`${uid}-name`} label={kind === 'software' ? '이름 (선택)' : '이름'} required={kind !== 'software'} error={err('name')}>
        <Input id={`${uid}-name`} value={values['name']} onChange={e => set('name', e.target.value)} aria-invalid={err('name') !== undefined} aria-describedby={describedBy('name')} />
      </Field>
    </div>
    {kind === 'model' && <Field id={`${uid}-processIds`} label="공정" error={err('processIds')} hint="고르지 않으면 미분류입니다">
      <ProcessPicker id={`${uid}-processIds`} values={processIds} onChange={setProcessIds} known={knownProcesses} invalid={err('processIds') !== undefined} describedBy={describedBy('processIds')} />
    </Field>}
    <div className="sticky bottom-0 z-10 -mx-5 mt-auto flex items-center justify-between gap-2 border-t border-border-subtle bg-surface-detail px-5 py-3">
      <div>{row?.active && <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirming(true)}>비활성화</Button>}</div>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>취소</Button>
        <Button type="submit" disabled={busy}>{busy ? '저장 중…' : '저장'}</Button>
      </div>
    </div>
    {row && <AlertDialog open={confirming} onOpenChange={setConfirming}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{row.code}을(를) 비활성화할까요?</AlertDialogTitle>
          <AlertDialogDescription>{impactText(kind, row)} 비활성화 후 하위 항목 유지 · 언제든 재활성화 가능</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction onClick={() => toggle(false)}>비활성화</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
  </form>;
}

export function CatalogDrawer({ kind, focus, rowsRef, options, onWritten, leaveRef }: {
  kind: CatalogKind; focus: string; rowsRef: RefObject<Map<string, CatalogRow>>;
  options: { vendors: Option[]; processes: Option[]; models: Option[] }; onWritten: () => void;
  /** Filled with the guard's `leave` while the drawer is open, so a page view that replaces the drawer (가져오기) asks first (#1542). */
  leaveRef: RefObject<((next: GuardedLeave) => void) | null>;
}) {
  const { setPage } = usePlatform();
  const { lookup, reload } = useCatalogRow(kind, focus, rowsRef);
  const [tab, setTab] = useState('info');
  // Closing turns the unsaved guard off first (`released`) and writes the address after that commit (ADR-0115, as the improvement create drawer).
  const [released, setReleased] = useState(false);
  const closeNow = useEffectEvent(() => setPage({ focus: null }));
  useEffect(() => { if (released) closeNow(); }, [released]);
  useEffect(() => { setReleased(false); }, [focus]);
  const guard = useCloseGuard(() => setReleased(true));
  useEffect(() => { leaveRef.current = guard.leave; return () => { leaveRef.current = null; }; }, [leaveRef, guard.leave]);
  // The SW 버전 tab unmounts the 정보 form, so switching away from it asks like closing (#1542).
  const changeTab = (next: string) => {
    if (tab !== 'info' || next === 'info') { setTab(next); return; }
    // Tabs activate on focus, and the question returns focus to whatever held it when it opened: hand focus back to the selected 정보 tab
    // first, or 계속 작성 would refocus SW 버전 and ask again.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.getAttribute('role') === 'tab') focused.closest('[role="tablist"]')?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    guard.leave({ run: () => setTab(next), title: '작성 중인 내용이 사라집니다. 탭을 바꿀까요?', message: '탭을 바꾸면 입력한 내용을 되찾을 수 없습니다.', confirmLabel: '바꾸기' });
  };
  const row = lookup.state === 'ready' ? lookup.row : null;
  const body = lookup.state === 'loading' ? <p className="text-sm text-text-muted">불러오는 중…</p>
    : lookup.state === 'missing' ? <p role="alert" className="text-sm">항목을 찾을 수 없습니다. 삭제되었거나 주소가 틀렸습니다.</p>
    : lookup.state === 'error' ? <p role="alert" className="text-sm">항목을 불러오지 못했습니다. <Button size="sm" variant="secondary" onClick={reload}>다시 시도</Button></p>
    : <CatalogForm key={`${focus}:${row?.version ?? 'new'}`} kind={kind} row={row} options={options} onWritten={onWritten} onReload={reload} onClose={guard.request} markDirty={guard.markDirty} released={released} />;
  const tabs = kind === 'model' && row
    ? [{ id: 'info', label: '정보', content: body }, { id: 'software', label: 'SW 버전', content: <ModelSoftware modelId={row.id} /> }]
    : [{ id: 'info', label: '정보', content: body }];
  return <><DetailDrawer key={focus} title={focus === NO_ROW ? `${TAB_LABEL[kind]} 추가` : row ? <span className="t-mono">{row.code}</span> : TAB_LABEL[kind]}
    subtitle={`${TAB_LABEL[kind]} · 카탈로그 관리`} onClose={guard.request} tab={tabs.some(t => t.id === tab) ? tab : 'info'} onTabChange={changeTab} tabs={tabs} />
    {guard.dialog}
  </>;
}
