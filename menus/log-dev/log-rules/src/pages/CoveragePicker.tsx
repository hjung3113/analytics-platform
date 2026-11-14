import { useCallback, useEffect, useRef, useState } from 'react';
import { useMenuFetch } from '@ap/kernel';
import { Button, Combobox, FieldLabel, type ComboboxOption } from '@ap/ui';
import { modelOptionsEndpoint, softwareOptionsEndpoint, type ModelOption, type SoftwareOption } from '../endpoints';

const PAGE = 20;
const MODEL_BASE = '__model_base__';
const modelLabel = (m: ModelOption) => `${m.name || m.code}${m.vendorName ? ` · ${m.vendorName}` : ''}${m.active ? '' : ' (비활성)'}`;
const softwareLabel = (s: SoftwareOption) => `${s.versionLabel}${s.name ? ` · ${s.name}` : ''}${s.active ? '' : ' (비활성)'}`;

/** Server-searched, server-paged model options. A page that fails is a retry row, never a silent empty list. */
function useModelOptions() {
  const { fetch } = useMenuFetch(modelOptionsEndpoint);
  const fetchRef = useRef(fetch);
  useEffect(() => { fetchRef.current = fetch; });
  const [search, setSearch] = useState('');
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState({ search: '', options: [] as ComboboxOption[], total: 0, page: -1, loading: true, failed: false });
  const run = useCallback(async (text: string, page: number, signal: AbortSignal) => {
    setState(s => ({ ...s, loading: true, failed: false }));
    try {
      const res = await fetchRef.current({ q: text.trim() === '' ? null : text.trim(), page, pageSize: PAGE }, signal);
      if (signal.aborted) return;
      if ((res.outcome !== 'ok' && res.outcome !== 'empty') || !res.data) { setState(s => ({ ...s, loading: false, failed: true })); return; }
      const next = res.data.rows.map(m => ({ value: m.id, label: modelLabel(m) }));
      const total = res.data.total;
      setState(s => ({ search: text, options: page === 0 ? next : [...s.options, ...next.filter(o => !s.options.some(x => x.value === o.value))], total, page, loading: false, failed: false }));
    } catch { if (!signal.aborted) setState(s => ({ ...s, loading: false, failed: true })); }
  }, []);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const next = new AbortController();
    controller.current?.abort(); controller.current = next;
    void run(search, 0, next.signal);
    return () => next.abort();
  }, [search, nonce, run]);
  const loadMore = () => { if (state.loading) return; const next = new AbortController(); controller.current = next; void run(search, state.page + 1, next.signal); };
  return { ...state, setSearch, loadMore, retry: () => setNonce(n => n + 1), hasMore: state.search === search && (state.page + 1) * PAGE < state.total };
}

function useSoftwareOptions(modelId: string | null) {
  const { fetch } = useMenuFetch(softwareOptionsEndpoint);
  const fetchRef = useRef(fetch);
  useEffect(() => { fetchRef.current = fetch; });
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ modelId: string | null; options: ComboboxOption[]; failed: boolean }>({ modelId: null, options: [], failed: false });
  useEffect(() => {
    if (modelId === null) return;
    const controller = new AbortController();
    void fetchRef.current({ modelId }, controller.signal).then(res => {
      if (controller.signal.aborted) return;
      const ok = (res.outcome === 'ok' || res.outcome === 'empty') && res.data;
      setState({ modelId, options: ok ? res.data!.rows.map(s => ({ value: s.id, label: softwareLabel(s) })) : [], failed: !ok });
    }).catch(() => { if (!controller.signal.aborted) setState({ modelId, options: [], failed: true }); });
    return () => controller.abort();
  }, [modelId, nonce]);
  const retry = () => { setState(s => ({ ...s, failed: false })); setNonce(n => n + 1); };
  return { ...(state.modelId === modelId ? state : { modelId, options: [], failed: false }), retry };
}

/**
 * The Coverage tab's model → SW version picker (#1496). The address keeps the UUID keys `modelId` / `softwareId`; a chosen id that the list
 * cannot label (an old link, a model beyond the first page) reads as the raw id. Choosing a model drops the SW version.
 */
export function CoveragePicker({ modelId, softwareId, onChange }: { modelId: string | null; softwareId: string | null; onChange: (next: { modelId: string; softwareId: string | null }) => void }) {
  const models = useModelOptions();
  const software = useSoftwareOptions(modelId);
  const [picked, setPicked] = useState<ComboboxOption | null>(null);
  const modelOptions = modelId && !models.options.some(o => o.value === modelId) ? [picked?.value === modelId ? picked : { value: modelId, label: modelId }, ...models.options] : models.options;
  const softwareOptions: ComboboxOption[] = [{ value: MODEL_BASE, label: '모델 기준 (SW 버전 없음)' }, ...(softwareId && !software.options.some(o => o.value === softwareId) ? [{ value: softwareId, label: softwareId }] : []), ...software.options];
  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    <div className="flex min-w-0 items-center gap-2">
      <FieldLabel htmlFor="coverage-model">모델</FieldLabel>
      {/* eslint-disable-next-line shadcn/no-restyle -- Combobox has no toolbar size yet; this row is 32px toolbar controls (DESIGN.md), the conductor chose className over an SDK prop */}
      <Combobox id="coverage-model" className="h-8 w-80 bg-surface-sunken px-2.5 py-0" options={modelOptions} value={modelId} filterOptions={false} onSearchChange={models.setSearch}
        onChange={next => { setPicked(modelOptions.find(o => o.value === next) ?? null); onChange({ modelId: next, softwareId: null }); }}
        placeholder="모델 선택" searchPlaceholder="모델 코드·이름 검색" listboxLabel="모델 목록"
        {...(models.hasMore ? { footerText: '일부만 표시. 검색하거나 옆의 더 보기를 누르세요' } : {})}
        emptyText={models.loading ? '불러오는 중…' : models.failed ? '불러오지 못했습니다' : '결과가 없습니다'} />
      {models.failed && <><span role="alert" className="text-xs text-text-danger-label">모델 목록을 불러오지 못했습니다</span><Button type="button" size="toolbar" variant="ghost" onClick={models.retry}>다시 시도</Button></>}
      {!models.failed && models.hasMore && <Button type="button" size="toolbar" variant="ghost" disabled={models.loading} onClick={models.loadMore}>{models.loading ? '불러오는 중…' : '모델 더 보기'}</Button>}
    </div>
    <div className="flex min-w-0 items-center gap-2">
      <FieldLabel htmlFor="coverage-software">SW 버전 (선택)</FieldLabel>
      {/* eslint-disable-next-line shadcn/no-restyle -- Combobox has no toolbar size yet; this row is 32px toolbar controls (DESIGN.md), the conductor chose className over an SDK prop */}
      <Combobox id="coverage-software" className="h-8 w-64 bg-surface-sunken px-2.5 py-0" options={softwareOptions} value={softwareId ?? MODEL_BASE} disabled={modelId === null}
        onChange={next => modelId && onChange({ modelId, softwareId: next === MODEL_BASE ? null : next })}
        placeholder="모델 기준" searchPlaceholder="버전 검색" listboxLabel="SW 버전 목록"
        emptyText="이 모델에 SW 버전이 없습니다" />
      {software.failed && <><span role="alert" className="text-xs text-text-danger-label">SW 버전 목록을 불러오지 못했습니다</span><Button type="button" size="toolbar" variant="ghost" onClick={software.retry}>다시 시도</Button></>}
    </div>
  </div>;
}
