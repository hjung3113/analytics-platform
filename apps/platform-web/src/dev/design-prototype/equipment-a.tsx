/**
 * #52 prototype — variant A (Linear / Vercel) equipment master page (throwaway). No card, no zebra, no vertical
 * rules; sentence-case headers; status as dot + text. PlatformDataTable/PlatformPage/StateView are not used on
 * purpose (uppercase headers and pink boxes would come back).
 */
import { AlertCircle, Ban, Check, ChevronDown, Info, Loader2, MapPinOff, RotateCw, Search, Star, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useI18n, usePlatform } from '@ap/kernel';
import type { ApiResponse, Assessment } from '@ap/contracts';
import { cn, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import { popStyle } from './context-editors';
import { EquipmentDrawer, useDrawerPush } from './drawer';
import {
  columns, downloadCsv, type Equipment, filterRows, makers, pageOf, STATUS_TEXT, STATUSES, type Status, useEquipmentQuery, usePageFilters, wall,
} from './equipment-query';

const COLS = columns(['equipmentId', 'name', 'room', 'maker', 'model', 'status', 'updatedAt']);
const WIDTH: Partial<Record<keyof Equipment, number>> = { equipmentId: 160, room: 104, maker: 80, model: 124, status: 96, updatedAt: 160 };
const DOT: Record<Status, string> = { active: '#1f8a4c', idle: '#71717a', maintenance: '#b45309', retired: '#a1a1aa' };

export function EquipmentA({ contextRow }: { contextRow: ReactNode }) {
  const { route, registry, scope } = usePlatform();
  const { lang } = useI18n();
  const filters = usePageFilters();
  const query = useEquipmentQuery();
  const response = query.response;
  const menu = route!.menu;
  const group = registry.groupById(menu.group);
  const push = useDrawerPush('A', !!filters.focus);
  const failed = response && (response.outcome === 'error' || response.outcome === 'timeout' || response.outcome === 'too_large') ? response : null;
  const allRows = response?.data ?? [];

  return <div className="min-h-full" style={{ paddingRight: push }}>
    <div className="px-(--dp-gutter) pb-24 pt-3">
      <nav aria-label="Breadcrumb" className="flex h-7 items-center gap-1.5 text-[12px] text-(--dp-muted)">
        <span>{lang === 'ko' ? group.label.ko : group.label.en}</span><span aria-hidden className="text-(--dp-faint)">/</span>
        <span aria-current="page" className="text-(--dp-secondary)">{lang === 'ko' ? menu.label.ko : menu.label.en}</span>
      </nav>
      <TitleRow response={scope.status === 'valid' && query.status !== 'loading' ? response : null} />
      {failed && <Banner response={failed} onRetry={query.refetch} />}
      {contextRow}
      {scope.status !== 'valid' ? <Gate /> : <ListArea rows={allRows} response={response} loading={query.status === 'loading'} refreshing={query.status === 'refreshing'} onRetry={query.refetch} />}
    </div>
    {filters.focus && <EquipmentDrawer key={filters.focus} variant="A" id={filters.focus} row={allRows.find(r => r.equipmentId === filters.focus) ?? null} onClose={filters.close} />}
  </div>;
}

/* ---------- header ---------- */

function TitleRow({ response }: { response: ApiResponse<Equipment[]> | null }) {
  const { route, favorites, toggleFavorite } = usePlatform();
  const { t, tx, lang } = useI18n();
  const menu = route!.menu;
  const fav = favorites.includes(menu.id);
  return <div className="flex h-9 items-center gap-1">
    <h1 className="mr-1 truncate text-[20px] font-semibold leading-7 tracking-[-0.2px] text-(--dp-text)">{tx(menu.label)}</h1>
    <button type="button" onClick={() => toggleFavorite(menu.id)} aria-pressed={fav} aria-label={fav ? t('removeFavorite') : t('addFavorite')} title={fav ? t('removeFavorite') : t('addFavorite')}
      className="grid size-7 place-items-center rounded-(--dp-radius) hover:bg-(--dp-chip-soft)">
      <Star className={cn('size-4', fav ? 'fill-(--dp-star) text-(--dp-star)' : 'text-(--dp-faint)')} strokeWidth={1.75} aria-hidden />
    </button>
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={lang === 'ko' ? '화면 설명' : 'About this page'} className="grid size-7 place-items-center rounded-(--dp-radius) text-(--dp-faint) hover:bg-(--dp-chip-soft) hover:text-(--dp-muted) data-[state=open]:bg-(--dp-chip-soft)">
          <Info className="size-4" strokeWidth={1.75} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="dp-pop" style={popStyle(320)}>
        <div className="space-y-2 p-3 text-[12px] leading-[18px]">
          <p className="font-[560] text-(--dp-text)">{tx(menu.label)}</p>
          <p className="text-(--dp-secondary)">{tx(menu.description)}</p>
          <p className="border-t border-(--dp-border) pt-2 text-(--dp-muted)">{lang === 'ko' ? '위의 조건은 모든 화면에 전달됩니다. 아래 필터는 이 목록에만 적용됩니다.' : 'Conditions above carry to every page. Filters below apply to this list only.'}</p>
        </div>
      </PopoverContent>
    </Popover>
    <span className="ml-auto">{response?.trust && <TrustLine response={response} />}</span>
  </div>;
}

const shortTime = (v: string | null | undefined) => (v ? v.replace('T', ' ').slice(5, 16) : '—');
const KIND: Record<Assessment['kind'], { ko: string; en: string }> = {
  collection: { ko: '수집', en: 'Collection' }, processing_delay: { ko: '처리 지연', en: 'Processing delay' },
  coverage: { ko: '커버리지', en: 'Coverage' }, time_domain: { ko: '시간역', en: 'Time domain' },
};

/** §18: dot + headline + coverage + updated. `unknown` is never folded into healthy. */
export function TrustLine({ response }: { response: ApiResponse<unknown> }) {
  const { t, tx, lang } = useI18n();
  const trust = response.trust!;
  const confirmed = response.assessments.filter(a => a.state === 'confirmed');
  const unknown = response.assessments.filter(a => a.state === 'unknown');
  const tone = confirmed.length ? 'var(--dp-warning)' : unknown.length ? 'var(--dp-faint)' : 'var(--dp-success)';
  const headline = confirmed.length ? (lang === 'ko' ? `확인된 이슈 ${confirmed.length}건` : `${confirmed.length} confirmed issue(s)`)
    : unknown.length ? (lang === 'ko' ? `일부 상태 미확인 (${unknown.length})` : `Some status unknown (${unknown.length})`)
      : (lang === 'ko' ? '확인된 이슈 없음' : 'No confirmed issues');
  const coverage = trust.coverage === null ? '—' : `${(trust.coverage * 100).toFixed(1)}%`;
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" aria-label={t('dataTrust')} className="dp-num inline-flex h-7 items-center gap-1.5 rounded-(--dp-radius) px-2 text-[12px] text-(--dp-muted) hover:bg-(--dp-chip-soft) hover:text-(--dp-secondary) data-[state=open]:bg-(--dp-chip-soft)">
        <span aria-hidden className="size-1.5 rounded-full" style={{ background: tone, boxShadow: unknown.length && !confirmed.length ? 'inset 0 0 0 1px var(--dp-muted)' : undefined }} />
        <span className="text-(--dp-secondary)">{headline}</span>
        <span aria-hidden className="text-(--dp-faint)">·</span><span>{t('coverage')} {coverage}</span>
        <span aria-hidden className="text-(--dp-faint)">·</span><span>{t('updated')} {shortTime(trust.updatedAt)}</span>
        {trust.provisional && <span className="rounded-(--dp-radius-sm) bg-(--dp-chip-soft) px-1 text-[10px] font-medium text-(--dp-warning)">{t('provisional')}</span>}
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" className="dp-pop" style={popStyle(320)}>
      <div className="p-3 text-[12px]">
        <p className="mb-2 font-[560]">{t('dataTrust')}</p>
        <dl className="dp-num grid grid-cols-[96px_1fr] gap-y-1.5">
          <dt className="text-(--dp-muted)">Updated</dt><dd>{trust.updatedAt.replace('T', ' ')}</dd>
          <dt className="text-(--dp-muted)">Data through</dt><dd>{trust.dataThrough?.replace('T', ' ') ?? '—'}</dd>
          <dt className="text-(--dp-muted)">Coverage</dt><dd>{trust.coverage === null ? t('stateUnknown') : coverage}</dd>
          <dt className="text-(--dp-muted)">{lang === 'ko' ? '잠정 여부' : 'Provisional'}</dt><dd>{trust.provisional ? t('provisional') : t('final')}</dd>
          <dt className="text-(--dp-muted)">Source</dt><dd className="dp-mono text-[11.5px]">{trust.source}</dd>
        </dl>
        <ul className="mt-3 space-y-1.5 border-t border-(--dp-border) pt-2.5">
          {response.assessments.map(a => <li key={a.kind} className="flex items-start justify-between gap-3">
            <span className="text-(--dp-secondary)">{tx(KIND[a.kind])}</span>
            <span className="text-right">
              <span className="font-[560]" style={{ color: a.state === 'confirmed' ? 'var(--dp-warning)' : a.state === 'clear' ? 'var(--dp-success)' : 'var(--dp-muted)' }}>{a.state}</span>
              <span className="dp-num block text-[11px] text-(--dp-muted)">{a.state === 'unknown' ? a.reason : `${a.statusSource} · ${shortTime(a.observedAt)}`}</span>
            </span>
          </li>)}
        </ul>
        <p className="mt-2 text-[11px] leading-4 text-(--dp-muted)">{lang === 'ko' ? 'clear는 해당 kind 문제가 없음을 원천이 확인했다는 제한적 주장입니다.' : '“clear” only means the source confirmed that kind of problem is absent.'}</p>
      </div>
    </PopoverContent>
  </Popover>;
}

function Banner({ response, onRetry }: { response: ApiResponse<unknown>; onRetry: () => void }) {
  const { lang } = useI18n();
  return <div role="alert" className="mb-1 mt-1 flex h-9 items-center gap-2 border-l-4 border-(--dp-danger) bg-(--dp-danger-soft) pl-3 pr-2 text-[13px] text-(--dp-danger-text)">
    <AlertCircle className="size-3.5 shrink-0" aria-hidden />
    <span className="min-w-0 flex-1 truncate">
      <span className="font-[560]">{lang === 'ko' ? '조회 실패' : 'Query failed'}</span>
      <span className="mx-1.5 opacity-50">·</span>{response.message ?? response.outcome}
      <span className="mx-1.5 opacity-50">·</span><span className="dp-mono text-[12px]">{response.correlationId}</span>
    </span>
    <button type="button" onClick={onRetry} className="inline-flex h-7 items-center gap-1 rounded-(--dp-radius) px-2 text-[12px] font-[560] hover:bg-[rgba(185,28,28,.08)]">
      <RotateCw className="size-3.5" aria-hidden />{lang === 'ko' ? '재시도' : 'Retry'}
    </button>
  </div>;
}

/* ---------- scope gate (same t() copy as PlatformPage) ---------- */

export function Gate() {
  const { scope, lastScope, setGlobal } = usePlatform();
  const { t } = useI18n();
  const g = scope.status === 'validating' ? { icon: <Loader2 className="size-4 animate-spin" aria-hidden />, title: t('scopeValidating'), body: null }
    : scope.status === 'none' ? { icon: <MapPinOff className="size-4" aria-hidden />, title: t('selectScope'), body: t('selectScopeBody') }
      : scope.status === 'unknown_scope' ? { icon: <MapPinOff className="size-4" aria-hidden />, title: t('scopeUnknownTitle'), body: <>{t('scopeUnknownBody')} <span className="dp-mono text-[12px]">scopeId={scope.scopeId}</span></> }
        : { icon: <Ban className="size-4" aria-hidden />, title: t('stateForbidden'), body: <>{t('stateForbiddenBody')} <span className="dp-mono text-[12px]">scopeId={scope.scopeId}</span></> };
  return <div role="status" className="mt-3 flex items-start gap-3 border-t border-(--dp-border) py-10">
    <span className={cn('mt-0.5', scope.status === 'forbidden' ? 'text-(--dp-warning)' : 'text-(--dp-muted)')}>{g.icon}</span>
    <div className="max-w-[560px]">
      <p className="text-[14px] font-[560] text-(--dp-text)">{g.title}</p>
      {g.body && <p className="mt-1 text-[13px] leading-5 text-(--dp-muted)">{g.body}</p>}
      {scope.status === 'none' && lastScope && <button type="button" onClick={() => setGlobal({ scopeId: lastScope })}
        className="mt-3 inline-flex h-7 items-center rounded-(--dp-radius) bg-(--dp-text) px-3 text-[12px] font-[560] text-white hover:opacity-90">{t('applySuggested')}: {lastScope}</button>}
    </div>
  </div>;
}

/* ---------- filters + table ---------- */

function ListArea({ rows, response, loading, refreshing, onRetry }: { rows: Equipment[]; response: ApiResponse<Equipment[]> | null; loading: boolean; refreshing: boolean; onRetry: () => void }) {
  const { toast } = usePlatform();
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const f = usePageFilters();
  const [page, setPageIndex] = useState(0);
  const [checked, setChecked] = useState<string[]>([]);
  const filtered = useMemo(() => filterRows(rows, f.q, f.status, f.maker), [rows, f.q, f.status, f.maker]);
  useEffect(() => { setPageIndex(0); }, [f.q, f.status, f.maker]);
  const view = pageOf(filtered, page);
  const inView = checked.filter(id => filtered.some(r => r.equipmentId === id));
  const pageIds = view.rows.map(r => r.equipmentId);
  const allOnPage = pageIds.length > 0 && pageIds.every(id => checked.includes(id));
  const outcome = response?.outcome;
  const exportRows = () => {
    const out = inView.length ? filtered.filter(r => inView.includes(r.equipmentId)) : filtered;
    downloadCsv(out);
    toast(ko ? `CSV: ${inView.length ? '체크한 행' : '필터된 전체 결과'} ${out.length}건 내보내기` : `CSV: exported ${out.length} ${inView.length ? 'checked rows' : 'rows from all filtered results'}`);
  };

  let body: ReactNode;
  if (loading) body = Array.from({ length: 8 }, (_, i) => <tr key={i} className="h-9 border-b border-(--dp-row-line)"><td /><td colSpan={COLS.length}><span className="block h-2.5 animate-pulse rounded-full bg-(--dp-chip-soft)" style={{ width: `${40 + ((i * 37) % 50)}%` }} /></td></tr>);
  else if (outcome === 'error' || outcome === 'timeout' || outcome === 'too_large') {
    body = <WidgetRow icon={<AlertCircle className="size-3.5 text-(--dp-danger)" aria-hidden />} message={ko ? '설비 목록을 불러오지 못했습니다.' : 'Could not load the equipment list.'} id={response!.correlationId} onRetry={onRetry} />;
  } else if (outcome === 'forbidden') {
    body = <WidgetRow icon={<Ban className="size-3.5 text-(--dp-warning)" aria-hidden />} message={ko ? '이 Scope의 설비 데이터에 접근 권한이 없습니다. 빈 목록이 아닙니다.' : 'You do not have access to equipment data in this scope. This is not an empty list.'} id={response!.correlationId} />;
  } else if (!filtered.length) {
    body = <tr><td colSpan={COLS.length + 1} className="h-24 text-center text-[13px] text-(--dp-muted)">
      {rows.length ? (ko ? '이 화면 필터에 맞는 설비가 없습니다.' : 'No equipment matches these page filters.') : (ko ? '조회 조건에 해당하는 설비가 없습니다.' : 'No equipment in the current context.')}
      {f.active && <button type="button" onClick={f.clear} className="ml-2 text-(--dp-primary) hover:underline">{ko ? '필터 초기화' : 'Clear filters'}</button>}
    </td></tr>;
  } else {
    body = view.rows.map(r => {
      const active = f.focus === r.equipmentId;
      const isChecked = checked.includes(r.equipmentId);
      return <tr key={r.equipmentId} onClick={() => f.open(r.equipmentId)} aria-selected={active}
        className={cn('h-9 cursor-pointer border-b border-(--dp-row-line) text-[13px] text-(--dp-text)', active ? 'bg-(--dp-row-active)' : 'hover:bg-(--dp-row-hover)')}>
        <td className="pl-1" onClick={e => e.stopPropagation()}>
          <CheckBox checked={isChecked} label={r.equipmentId} onChange={() => setChecked(c => (isChecked ? c.filter(x => x !== r.equipmentId) : [...c, r.equipmentId]))} />
        </td>
        {COLS.map(c => <td key={c.key} className={cn('truncate px-3', c.align === 'right' && 'text-right')}>
          {c.kind === 'id' ? <button type="button" onClick={e => { e.stopPropagation(); f.open(r.equipmentId); }} className="dp-mono rounded-(--dp-radius-sm) text-[12px] text-(--dp-text) hover:underline">{r.equipmentId}</button>
            : c.kind === 'status' ? <span className="inline-flex items-center gap-1.5 text-[12px] text-(--dp-secondary)"><span aria-hidden className="size-1.5 rounded-full" style={{ background: DOT[r.status] }} />{STATUS_TEXT[r.status][lang]}</span>
              : c.kind === 'time' ? <span className="dp-num text-(--dp-secondary)">{wall(r[c.key] as string | null)}</span>
                : <span className={c.key === 'name' ? '' : 'text-(--dp-secondary)'}>{String(r[c.key] ?? '—')}</span>}
        </td>)}
      </tr>;
    });
  }

  return <section aria-label={ko ? '설비 목록' : 'Equipment list'}>
    <div role="group" aria-label={ko ? '이 화면 필터' : 'Page filters'} className="mt-1 flex h-10 items-center gap-1.5">
      <span className="w-[60px] shrink-0 text-[11px] font-medium text-(--dp-muted)">{ko ? '이 화면' : 'This page'}</span>
      <label className="flex h-7 w-[220px] items-center gap-1.5 rounded-(--dp-radius) bg-(--dp-chip-soft) px-2 focus-within:bg-(--dp-surface) focus-within:shadow-[0_0_0_1px_var(--dp-border-strong),0_0_0_3px_var(--dp-focus)]">
        <Search className="size-3.5 shrink-0 text-(--dp-muted)" aria-hidden />
        <input value={f.q} onChange={e => f.setQ(e.target.value)} placeholder={ko ? 'ID·설비명 검색' : 'Search ID or name'} aria-label={ko ? '설비 ID 또는 이름 검색' : 'Search equipment ID or name'}
          className="min-w-0 flex-1 bg-transparent text-[12px] text-(--dp-text) outline-none placeholder:text-(--dp-faint)" />
        {f.q && <button type="button" onClick={() => f.setQ('')} aria-label={ko ? '검색 지우기' : 'Clear search'} className="text-(--dp-muted) hover:text-(--dp-text)"><X className="size-3" aria-hidden /></button>}
      </label>
      <FilterMenu label={ko ? '상태' : 'Status'} value={f.status} onChange={f.setStatus}
        options={STATUSES.map(s => ({ value: s, label: STATUS_TEXT[s][lang], dot: DOT[s] }))} />
      <FilterMenu label="Maker" value={f.maker} onChange={f.setMaker} options={makers(rows, f.maker).map(m => ({ value: m, label: m }))} />
      {f.active && <button type="button" onClick={f.clear} className="ml-1 h-7 rounded-(--dp-radius) px-1.5 text-[12px] text-(--dp-muted) hover:text-(--dp-text)">{ko ? '필터 초기화' : 'Clear filters'}</button>}
      <span className="ml-auto flex items-center gap-3 text-[12px]">
        {refreshing && <Loader2 className="size-3.5 animate-spin text-(--dp-faint)" aria-label={ko ? '새로 고침 중' : 'Refreshing'} />}
        {outcome === 'ok' && <span className="dp-num text-(--dp-muted)">{ko ? `${filtered.length}대` : `${filtered.length} items`}{inView.length > 0 && <span className="text-(--dp-secondary)"> · {ko ? `${inView.length}개 체크` : `${inView.length} checked`}</span>}</span>}
        <button type="button" onClick={exportRows} disabled={outcome !== 'ok' || !filtered.length} title={ko ? '체크한 행이 있으면 그 행만, 없으면 필터된 전체를 내보냅니다.' : 'Checked rows if any, else all filtered rows.'}
          className="h-7 rounded-(--dp-radius) px-1.5 font-[560] text-(--dp-secondary) hover:text-(--dp-text) disabled:text-(--dp-faint)">CSV</button>
      </span>
    </div>
    <div className="dp-scroll overflow-x-auto">
      <table className="w-full min-w-[980px] table-fixed border-collapse" aria-busy={loading || refreshing}>
        <colgroup><col style={{ width: 36 }} />{COLS.map(c => <col key={c.key} style={WIDTH[c.key] ? { width: WIDTH[c.key] } : undefined} />)}</colgroup>
        <thead>
          <tr className="h-8 border-b border-(--dp-border) text-[12px] font-medium text-(--dp-muted)">
            <th className="pl-1 text-left font-medium">
              <CheckBox checked={allOnPage} label={ko ? '이 페이지 전체' : 'This page'} disabled={!pageIds.length || outcome !== 'ok'}
                onChange={() => setChecked(c => (allOnPage ? c.filter(id => !pageIds.includes(id)) : [...new Set([...c, ...pageIds])]))} />
            </th>
            {COLS.map(c => <th key={c.key} scope="col" className={cn('px-3 font-medium', c.align === 'right' ? 'text-right' : 'text-left')}>{lang === 'ko' ? c.ko : c.en}</th>)}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
    {outcome === 'ok' && filtered.length > 0 && <div className="dp-num flex h-10 items-center justify-between text-[12px] text-(--dp-muted)">
      <span>{view.start + 1}–{view.start + view.rows.length} / {view.total}</span>
      <span className="flex items-center gap-1">
        <button type="button" disabled={view.index === 0} onClick={() => setPageIndex(view.index - 1)} className="h-7 rounded-(--dp-radius) px-2 hover:text-(--dp-text) disabled:text-(--dp-faint)">{ko ? '이전' : 'Previous'}</button>
        <span className="text-(--dp-faint)">{view.index + 1} / {view.pages}</span>
        <button type="button" disabled={view.index >= view.pages - 1} onClick={() => setPageIndex(view.index + 1)} className="h-7 rounded-(--dp-radius) px-2 hover:text-(--dp-text) disabled:text-(--dp-faint)">{ko ? '다음' : 'Next'}</button>
      </span>
    </div>}
  </section>;
}

function WidgetRow({ icon, message, id, onRetry }: { icon: ReactNode; message: string; id: string; onRetry?: () => void }) {
  const { lang } = useI18n();
  return <tr className="h-12 border-b border-(--dp-row-line)">
    <td />
    <td colSpan={COLS.length} className="px-3">
      <span className="flex items-center gap-2 text-[13px] text-(--dp-text)">
        {icon}<span>{message}</span>
        <span className="dp-mono text-[11px] text-(--dp-muted)">{id}</span>
        {onRetry && <button type="button" onClick={onRetry} className="ml-1 text-[12px] font-[560] text-(--dp-primary) hover:underline">{lang === 'ko' ? '재시도' : 'Retry'}</button>}
      </span>
    </td>
  </tr>;
}

/** Export-scope check only; never calls setGlobal (it is not the analysis Selection). */
export function CheckBox({ checked, onChange, label, disabled }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return <button type="button" role="checkbox" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange}
    className="grid size-7 place-items-center rounded-(--dp-radius-sm) disabled:opacity-40">
    <span className={cn('grid size-3.5 place-items-center rounded-[4px] border transition-colors', checked ? 'border-(--dp-text) bg-(--dp-text)' : 'border-(--dp-dashed) bg-(--dp-surface) hover:border-(--dp-muted)')}>
      {checked && <Check className="size-2.5 text-white" strokeWidth={3.5} aria-hidden />}
    </span>
  </button>;
}

function FilterMenu({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string; dot?: string }[]; onChange: (v: string) => void }) {
  const { lang } = useI18n();
  const [open, setOpen] = useState(false);
  const all = lang === 'ko' ? '전체' : 'All';
  const current = options.find(o => o.value === value);
  const pick = (v: string) => { onChange(v); setOpen(false); };
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" aria-haspopup="listbox" className={cn('inline-flex h-7 items-center gap-1 rounded-(--dp-radius) px-2.5 text-[12px] data-[state=open]:bg-(--dp-border)',
        value ? 'bg-(--dp-primary-soft) text-(--dp-text) hover:bg-(--dp-border)' : 'bg-(--dp-chip-soft) hover:bg-(--dp-border)')}>
        <span className="text-(--dp-muted)">{label}:</span>
        <span className="font-[560] text-(--dp-text)">{current?.label ?? (value || all)}</span>
        <ChevronDown className="size-3 text-(--dp-muted)" aria-hidden />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="dp-pop" style={popStyle(200)}>
      <div role="listbox" aria-label={label} className="p-1">
        {[{ value: '', label: all } as { value: string; label: string; dot?: string }, ...options].map(o => <button key={o.value || 'all'} type="button" role="option" aria-selected={value === o.value} onClick={() => pick(o.value)}
          className="flex h-8 w-full items-center gap-2 rounded-(--dp-radius-sm) px-2 text-left text-[12px] text-(--dp-text) hover:bg-(--dp-chip-soft)">
          {o.dot ? <span aria-hidden className="size-1.5 rounded-full" style={{ background: o.dot }} /> : <span aria-hidden className="size-1.5" />}
          <span className="flex-1">{o.label}</span>
          {value === o.value && <Check className="size-3.5 text-(--dp-primary)" strokeWidth={2.5} aria-hidden />}
        </button>)}
      </div>
    </PopoverContent>
  </Popover>;
}
