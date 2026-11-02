import { useCallback, useEffect, useId, useMemo, useState, type RefObject } from 'react';
import { encodeFilterParams, type ActionResult, type ActionSpec, type ApiResponse, type PageResult } from '@ap/contracts';
import { PlatformLink, useMenuAction, useMenuFetch, useMenuQuery, usePlatform } from '@ap/kernel';
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
import type { Option } from './useCatalogOptions';

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
const PAGE = 200, MAX_PAGES = 50;

type Lookup = { state: 'loading' } | { state: 'ready'; row: CatalogRow | null } | { state: 'missing' } | { state: 'error' };

/**
 * The row behind `focus=<id>`. The reads have no by-id lookup, so it comes from the pages the table already read, else from
 * a scan of the whole list (at most 50 × 200 rows). `reload()` skips the cache: a conflict or a save needs the server's row.
 */
export function useCatalogRow(kind: CatalogKind, focus: string, rowsRef: RefObject<Map<string, CatalogRow>>) {
  const endpoint = ENDPOINTS[kind] as unknown as Parameters<typeof useMenuFetch<CatalogPageParams, PageResult<CatalogRow>>>[0];
  const { fetch } = useMenuFetch(endpoint);
  const [lookup, setLookup] = useState<Lookup>(() => focus === NO_ROW ? { state: 'ready', row: null } : { state: 'loading' });
  const [token, setToken] = useState(0);
  useEffect(() => {
    if (focus === NO_ROW) { setLookup({ state: 'ready', row: null }); return; }
    const cached = token === 0 ? rowsRef.current.get(focus) : undefined;
    if (cached) { setLookup({ state: 'ready', row: cached }); return; }
    const controller = new AbortController();
    setLookup(prev => (prev.state === 'ready' && token > 0 ? prev : { state: 'loading' }));
    (async () => {
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const res: ApiResponse<PageResult<CatalogRow>> = await fetch({ q: null, page, pageSize: PAGE, sorting: [{ id: 'createdAt', desc: false }] }, controller.signal);
        if (controller.signal.aborted) return;
        if (res.outcome !== 'ok' && res.outcome !== 'empty') { setLookup({ state: 'error' }); return; }
        const found = res.data?.rows.find(r => r.id === focus.toLowerCase());
        if (found) { rowsRef.current.set(found.id, found); setLookup({ state: 'ready', row: found }); return; }
        if (!res.data || (page + 1) * PAGE >= res.data.total) break;
      }
      setLookup({ state: 'missing' });
    })().catch(() => { if (!controller.signal.aborted) setLookup({ state: 'error' }); });
    return () => controller.abort();
    // `fetch` changes identity each render; the lookup runs for a new focus or an explicit reload only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, token]);
  return { lookup, reload: useCallback(() => setToken(n => n + 1), []) };
}

function Field({ id, label, error, hint, required, children }: { id: string; label: string; error?: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return <div className="grid gap-1.5">
    <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>
    {children}
    {hint && !error && <p id={`${id}-hint`} className="text-xs text-text-muted">{hint}</p>}
    {error && <p id={`${id}-error`} role="alert" className="text-xs text-text-danger-label">{error}</p>}
  </div>;
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

function CatalogForm({ kind, row, options, onWritten, onReload, onClose }: {
  kind: CatalogKind; row: CatalogRow | null; options: { vendors: Option[]; processes: Option[]; models: Option[] };
  onWritten: () => void; onReload: () => void; onClose: () => void;
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
      if (row) onReload(); else if (data) setPage({ focus: data.id });
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
  const parentOptions = kind === 'model' ? options.vendors : options.models;
  const parentField = kind === 'model' ? 'vendorId' : 'modelId';
  const parentLabel = kind === 'model' ? '제조사' : '모델';
  return <form className="grid gap-4" noValidate onSubmit={event => { event.preventDefault(); if (!busy) save(); }}>
    {banner?.kind === 'conflict' && <Callout tone="amber" title="다른 사람이 먼저 고쳤습니다" action={<Button type="button" size="sm" variant="secondary" onClick={() => { setBanner(null); setErrors({}); onReload(); }}>새로 불러오기</Button>}>
      저장하지 않은 입력은 새로 불러오면 사라집니다.
    </Callout>}
    {banner?.kind === 'failed' && <Callout tone="red" title="저장하지 못했습니다" action={banner.retry ? <Button type="button" size="sm" variant="secondary" onClick={banner.retry}>다시 시도</Button> : undefined}>{banner.text}</Callout>}
    {(kind === 'model' || kind === 'software') && <Field id={`${uid}-${parentField}`} label={parentLabel} required error={err(parentField)}
      hint={isNew ? undefined : `등록 후에는 ${parentLabel}${kind === 'model' ? '를' : '을'} 바꿀 수 없습니다`}>
      {isNew
        ? <Combobox id={`${uid}-${parentField}`} options={parentOptions.map(o => ({ value: o.value, label: o.label, disabled: o.disabled }))} value={values[parentField] || null}
          onChange={value => set(parentField, value)} placeholder={`${parentLabel} 선택`} searchPlaceholder={`${parentLabel} 검색`} listboxLabel={`${parentLabel} 목록`} emptyText="결과가 없습니다"
          aria-invalid={err(parentField) !== undefined} aria-describedby={describedBy(parentField)} />
        : <p className="text-sm" id={`${uid}-${parentField}`}>{kind === 'model' ? model?.vendorName : parentOptions.find(o => o.value === values[parentField])?.label ?? values[parentField]}</p>}
    </Field>}
    <Field id={`${uid}-${codeField}`} label={kind === 'software' ? '버전 표기' : '코드'} required error={err(codeField)}>
      <Input id={`${uid}-${codeField}`} value={values[codeField]} onChange={e => set(codeField, e.target.value)} aria-invalid={err(codeField) !== undefined} aria-describedby={describedBy(codeField)} />
    </Field>
    <Field id={`${uid}-name`} label={kind === 'software' ? '이름 (선택)' : '이름'} required={kind !== 'software'} error={err('name')}>
      <Input id={`${uid}-name`} value={values['name']} onChange={e => set('name', e.target.value)} aria-invalid={err('name') !== undefined} aria-describedby={describedBy('name')} />
    </Field>
    {kind === 'model' && <Field id={`${uid}-processIds`} label="공정" error={err('processIds')} hint="고르지 않으면 미분류입니다">
      <MultiCombobox id={`${uid}-processIds`} label="공정" values={processIds} onValuesChange={setProcessIds}
        options={options.processes.map(o => ({ value: o.value, label: o.label, disabled: o.disabled && !processIds.includes(o.value) }))}
        getLabel={value => model?.processes.find(p => p.id === value)?.name ?? value}
        listboxLabel="공정 목록" emptyText="결과가 없습니다" loadingText="불러오는 중…" retryLabel="다시 시도" placeholder="공정 선택" searchPlaceholder="공정 검색"
        selectedSummaryLabel={n => `공정 ${n}개 선택`} moreLabel="더 보기" clearAllLabel="모두 지우기" removeLabel={name => `${name} 빼기`}
        aria-invalid={err('processIds') !== undefined} aria-describedby={describedBy('processIds')} />
    </Field>}
    <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-3">
      <div>{row && (row.active
        ? <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirming(true)}>비활성화</Button>
        : <Button type="button" variant="secondary" disabled={busy} onClick={() => toggle(true)}>다시 활성화</Button>)}</div>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>취소</Button>
        <Button type="submit" disabled={busy}>{busy ? '저장 중…' : '저장'}</Button>
      </div>
    </div>
    {row && <AlertDialog open={confirming} onOpenChange={setConfirming}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{row.code}을(를) 비활성화할까요?</AlertDialogTitle>
          <AlertDialogDescription>{impactText(kind, row)} 비활성화해도 하위 항목은 바뀌지 않습니다. 언제든 다시 활성화할 수 있습니다.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction onClick={() => toggle(false)}>비활성화</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
  </form>;
}

export function CatalogDrawer({ kind, focus, rowsRef, options, onWritten }: {
  kind: CatalogKind; focus: string; rowsRef: RefObject<Map<string, CatalogRow>>;
  options: { vendors: Option[]; processes: Option[]; models: Option[] }; onWritten: () => void;
}) {
  const { setPage } = usePlatform();
  const { lookup, reload } = useCatalogRow(kind, focus, rowsRef);
  const [tab, setTab] = useState('info');
  const close = () => setPage({ focus: null });
  const row = lookup.state === 'ready' ? lookup.row : null;
  const body = lookup.state === 'loading' ? <p className="text-sm text-text-muted">불러오는 중…</p>
    : lookup.state === 'missing' ? <p role="alert" className="text-sm">항목을 찾을 수 없습니다. 삭제되었거나 주소가 틀렸습니다.</p>
    : lookup.state === 'error' ? <p role="alert" className="text-sm">항목을 불러오지 못했습니다. <Button size="sm" variant="secondary" onClick={reload}>다시 시도</Button></p>
    : <CatalogForm key={`${focus}:${row?.version ?? 'new'}`} kind={kind} row={row} options={options} onWritten={onWritten} onReload={reload} onClose={close} />;
  const tabs = kind === 'model' && row
    ? [{ id: 'info', label: '정보', content: body }, { id: 'software', label: 'SW 버전', content: <ModelSoftware modelId={row.id} /> }]
    : [{ id: 'info', label: '정보', content: body }];
  return <DetailDrawer key={focus} title={focus === NO_ROW ? `${TAB_LABEL[kind]} 추가` : row ? <span className="t-mono">{row.code}</span> : TAB_LABEL[kind]}
    subtitle={`${TAB_LABEL[kind]} · 카탈로그 관리`} onClose={close} tab={tabs.some(t => t.id === tab) ? tab : 'info'} onTabChange={setTab} tabs={tabs} />;
}
