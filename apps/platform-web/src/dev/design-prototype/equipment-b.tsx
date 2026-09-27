/**
 * #52 prototype — variant B (Datadog / Grafana) equipment master page (throwaway). A 36px title strip, then one
 * bordered dense panel: page filters live in the panel header (segmented status), all 14 master columns, 32px zebra
 * rows, status pills. The global Context lives in the shell's top bar — this page draws no Context row.
 */
import { AlertTriangle, Ban, ChevronDown, ChevronLeft, ChevronRight, Check, Info, Loader2, RotateCw, Search, Star, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useI18n, usePlatform } from '@ap/kernel';
import type { ApiResponse } from '@ap/contracts';
import { cn, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import { popStyle } from './context-editors';
import { EquipmentDrawer, useDrawerPush } from './drawer';
import { CheckBox, Gate, TrustLine } from './equipment-a';
import {
  downloadCsv, type Equipment, FIELDS, filterRows, makers, pageOf, STATUS_TEXT, STATUSES, type Status, useEquipmentQuery, usePageFilters, wall,
} from './equipment-query';

const WIDTH: Partial<Record<keyof Equipment, number>> = {
  equipmentId: 128, room: 84, line: 60, stgroup: 76, team: 72, maker: 72, model: 96, chamberType: 84, status: 84,
  validFrom: 116, validTo: 116, updatedAt: 116, updatedBy: 80,
};
const PILL: Record<Status, [string, string]> = {
  active: ['#e7f6ee', '#0e7c3a'], idle: ['#f3f4f6', '#4b5563'], maintenance: ['#fef3c7', '#92400e'], retired: ['#f3f4f6', '#6b7280'],
};
const isFailure = (r: ApiResponse<unknown> | null) => !!r && (r.outcome === 'error' || r.outcome === 'timeout' || r.outcome === 'too_large');

export function EquipmentB() {
  const { route, scope, favorites, toggleFavorite } = usePlatform();
  const { t, tx, lang } = useI18n();
  const ko = lang === 'ko';
  const filters = usePageFilters();
  const query = useEquipmentQuery();
  const response = query.response;
  const menu = route!.menu;
  const fav = favorites.includes(menu.id);
  const push = useDrawerPush('B', !!filters.focus);
  const failed = isFailure(response) ? response : null;
  const rows = response?.data ?? [];
  const trustResponse = scope.status === 'valid' && query.status !== 'loading' ? response : null;

  return <div className="min-h-full" style={{ paddingRight: push }}>
    {failed && <div role="alert" className="flex h-7 items-center gap-2 border-b border-[#fed7aa] bg-(--dp-danger-soft) px-3 text-[12px] text-(--dp-danger-text)">
      <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate"><span className="font-semibold">{ko ? '조회 실패' : 'Query failed'}</span><span className="mx-1.5 opacity-40">|</span>{failed.message ?? failed.outcome}
        <span className="mx-1.5 opacity-40">|</span><span className="dp-mono text-[11px]">{failed.correlationId}</span></span>
      <button type="button" onClick={query.refetch} className="inline-flex h-5 items-center gap-1 rounded-(--dp-radius-sm) px-1.5 text-[11px] font-semibold hover:bg-[rgba(194,65,12,.1)]"><RotateCw className="size-3" aria-hidden />{ko ? '재시도' : 'Retry'}</button>
    </div>}
    <div className="px-3 pb-24">
      <div className="flex h-9 items-center gap-0.5">
        <h1 className="mr-1 truncate text-[16px] font-semibold text-(--dp-text)">{tx(menu.label)}</h1>
        <button type="button" onClick={() => toggleFavorite(menu.id)} aria-pressed={fav} aria-label={fav ? t('removeFavorite') : t('addFavorite')} title={fav ? t('removeFavorite') : t('addFavorite')}
          className="grid size-6 place-items-center rounded-(--dp-radius) hover:bg-[#e9ebee]">
          <Star className={cn('size-3.5', fav ? 'fill-(--dp-star) text-(--dp-star)' : 'text-(--dp-faint)')} strokeWidth={1.75} aria-hidden />
        </button>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" aria-label={ko ? '화면 설명' : 'About this page'} className="grid size-6 place-items-center rounded-(--dp-radius) text-(--dp-faint) hover:bg-[#e9ebee] hover:text-(--dp-muted)"><Info className="size-3.5" strokeWidth={1.75} aria-hidden /></button>
          </PopoverTrigger>
          <PopoverContent align="start" className="dp-pop" style={popStyle(320)}>
            <div className="space-y-2 p-3 text-[12px] leading-[18px]">
              <p className="font-semibold">{tx(menu.label)}</p>
              <p className="text-(--dp-secondary)">{tx(menu.description)}</p>
              <p className="border-t border-(--dp-border) pt-2 text-(--dp-muted)">{ko ? '상단 바의 조건은 모든 화면에 전달됩니다. 패널 안 필터는 이 목록에만 적용됩니다.' : 'Top-bar conditions carry to every page. Panel filters apply to this list only.'}</p>
            </div>
          </PopoverContent>
        </Popover>
        <span className="ml-auto">{trustResponse?.trust && <TrustLine response={trustResponse} />}</span>
      </div>
      {scope.status !== 'valid'
        ? <div className="rounded-(--dp-radius) border border-(--dp-border) bg-(--dp-surface) px-4 [&>div]:mt-0 [&>div]:border-t-0"><Gate /></div>
        : <Panel rows={rows} response={response} loading={query.status === 'loading'} refreshing={query.status === 'refreshing'} onRetry={query.refetch} />}
    </div>
    {filters.focus && <EquipmentDrawer key={filters.focus} variant="B" id={filters.focus} row={rows.find(r => r.equipmentId === filters.focus) ?? null} onClose={filters.close} />}
  </div>;
}

function Panel({ rows, response, loading, refreshing, onRetry }: { rows: Equipment[]; response: ApiResponse<Equipment[]> | null; loading: boolean; refreshing: boolean; onRetry: () => void }) {
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
  const counts = useMemo(() => Object.fromEntries(STATUSES.map(s => [s, filterRows(rows, f.q, s, f.maker).length])), [rows, f.q, f.maker]);
  const exportRows = () => {
    const out = inView.length ? filtered.filter(r => inView.includes(r.equipmentId)) : filtered;
    downloadCsv(out);
    toast(ko ? `CSV: ${inView.length ? '체크한 행' : '필터된 전체 결과'} ${out.length}건 내보내기` : `CSV: exported ${out.length} ${inView.length ? 'checked rows' : 'filtered rows'}`);
  };
  const span = FIELDS.length + 1;

  let body: ReactNode;
  if (loading) body = Array.from({ length: 10 }, (_, i) => <tr key={i} className={cn('h-8 border-b border-(--dp-row-line)', i % 2 && 'bg-(--dp-zebra)')}><td /><td colSpan={FIELDS.length} className="px-2"><span className="block h-2 animate-pulse rounded-full bg-[#e9ebee]" style={{ width: `${35 + ((i * 37) % 55)}%` }} /></td></tr>);
  else if (outcome === 'error' || outcome === 'timeout' || outcome === 'too_large') {
    body = <Line span={span} icon={<AlertTriangle className="size-3.5 text-(--dp-danger)" aria-hidden />} message={ko ? '설비 목록을 불러오지 못했습니다.' : 'Could not load the equipment list.'} id={response!.correlationId} onRetry={onRetry} />;
  } else if (outcome === 'forbidden') {
    body = <Line span={span} icon={<Ban className="size-3.5 text-(--dp-warning)" aria-hidden />} message={ko ? '이 Scope의 설비 데이터에 접근 권한이 없습니다. 빈 목록이 아닙니다.' : 'No access to equipment data in this scope. This is not an empty list.'} id={response!.correlationId} />;
  } else if (!filtered.length) {
    body = <tr><td colSpan={span} className="h-20 px-3 text-[12px] text-(--dp-muted)">
      {rows.length ? (ko ? '이 화면 필터에 맞는 설비가 없습니다.' : 'No equipment matches these page filters.') : (ko ? '조회 조건에 해당하는 설비가 없습니다.' : 'No equipment in the current context.')}
      {f.active && <button type="button" onClick={f.clear} className="ml-2 font-semibold text-(--dp-secondary) underline-offset-2 hover:underline">{ko ? '필터 초기화' : 'Clear filters'}</button>}
    </td></tr>;
  } else {
    body = view.rows.map((r, i) => {
      const active = f.focus === r.equipmentId;
      const isChecked = checked.includes(r.equipmentId);
      return <tr key={r.equipmentId} onClick={() => f.open(r.equipmentId)} aria-selected={active}
        className={cn('h-8 cursor-pointer border-b border-(--dp-row-line) text-[12px] text-(--dp-text)',
          active ? 'bg-(--dp-row-active) shadow-[inset_2px_0_0_var(--dp-primary)]' : cn(i % 2 ? 'bg-(--dp-zebra)' : 'bg-(--dp-surface)', 'hover:bg-(--dp-row-hover)'))}>
        <td className="pl-0.5" onClick={e => e.stopPropagation()}>
          <CheckBox checked={isChecked} label={r.equipmentId} onChange={() => setChecked(c => (isChecked ? c.filter(x => x !== r.equipmentId) : [...c, r.equipmentId]))} />
        </td>
        {FIELDS.map(c => <td key={c.key} className={cn('truncate px-2', c.align === 'right' && 'text-right')}>
          {c.kind === 'id' ? <span className="dp-mono text-[11.5px] font-medium">{r.equipmentId}</span>
            : c.kind === 'status' ? <span className="inline-flex h-[18px] items-center rounded-(--dp-radius-sm) px-1.5 text-[10px] font-semibold" style={{ background: PILL[r.status][0], color: PILL[r.status][1] }}>{STATUS_TEXT[r.status][lang]}</span>
              : c.kind === 'time' ? <span className="dp-num text-(--dp-secondary)">{wall(r[c.key] as string | null)}</span>
                : <span className={c.key === 'name' ? '' : 'text-(--dp-secondary)'}>{String(r[c.key] ?? '—')}</span>}
        </td>)}
      </tr>;
    });
  }

  return <section aria-label={ko ? '설비 목록' : 'Equipment list'} className="overflow-hidden rounded-(--dp-radius) border border-(--dp-border) bg-(--dp-surface)">
    <div role="group" aria-label={ko ? '이 화면 필터' : 'Page filters'} className="flex h-9 items-center gap-2 border-b border-(--dp-border) px-2">
      <span className="pl-1 pr-1 text-[10px] font-semibold tracking-[0.04em] text-(--dp-faint)">{ko ? '페이지' : 'PAGE'}</span>
      <label className="flex h-[26px] w-[200px] items-center gap-1.5 rounded-(--dp-radius-sm) border border-(--dp-border) bg-(--dp-surface) px-1.5 focus-within:border-(--dp-primary)">
        <Search className="size-3 shrink-0 text-(--dp-faint)" aria-hidden />
        <input value={f.q} onChange={e => f.setQ(e.target.value)} placeholder={ko ? 'ID·설비명' : 'ID or name'} aria-label={ko ? '설비 ID 또는 이름 검색' : 'Search equipment ID or name'}
          className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-(--dp-faint)" />
        {f.q && <button type="button" onClick={() => f.setQ('')} aria-label={ko ? '검색 지우기' : 'Clear search'} className="text-(--dp-muted) hover:text-(--dp-text)"><X className="size-3" aria-hidden /></button>}
      </label>
      <div role="radiogroup" aria-label={ko ? '상태' : 'Status'} className="flex h-[26px] overflow-hidden rounded-(--dp-radius-sm) border border-(--dp-border)">
        {[{ v: '', label: ko ? '전체' : 'All', n: filterRows(rows, f.q, '', f.maker).length }, ...STATUSES.map(s => ({ v: s, label: STATUS_TEXT[s][lang], n: counts[s] }))].map((o, i) =>
          <button key={o.v || 'all'} type="button" role="radio" aria-checked={f.status === o.v} onClick={() => f.setStatus(o.v)}
            className={cn('dp-num flex items-center gap-1 px-2 text-[12px]', i > 0 && 'border-l border-(--dp-border)',
              f.status === o.v ? 'border-(--dp-seg-on) bg-(--dp-seg-on) font-medium text-white' : 'text-(--dp-secondary) hover:bg-(--dp-chip-soft)')}>
            {o.label}{outcome === 'ok' && <span className={cn('text-[10px]', f.status === o.v ? 'text-white/60' : 'text-(--dp-faint)')}>{o.n}</span>}
          </button>)}
      </div>
      <MakerMenu value={f.maker} options={makers(rows, f.maker)} onChange={f.setMaker} />
      {f.active && <button type="button" onClick={f.clear} className="h-[26px] px-1 text-[12px] text-(--dp-muted) hover:text-(--dp-text)">{ko ? '필터 초기화' : 'Clear'}</button>}
      <span className="ml-auto flex items-center gap-2.5 text-[12px]">
        {refreshing && <Loader2 className="size-3.5 animate-spin text-(--dp-faint)" aria-label={ko ? '새로 고침 중' : 'Refreshing'} />}
        {outcome === 'ok' && <span className="dp-num text-(--dp-muted)">{filtered.length}{ko ? '대' : ' items'}{inView.length > 0 && <span className="text-(--dp-secondary)"> · {inView.length}{ko ? '개 체크' : ' checked'}</span>}</span>}
        <button type="button" onClick={exportRows} disabled={outcome !== 'ok' || !filtered.length} title={ko ? '체크한 행이 있으면 그 행만, 없으면 필터된 전체를 내보냅니다.' : 'Checked rows if any, else all filtered rows.'}
          className="h-[26px] px-1 font-semibold text-(--dp-secondary) hover:text-(--dp-text) disabled:text-(--dp-faint)">CSV</button>
      </span>
    </div>
    <div className="dp-scroll overflow-x-auto">
      <table className="w-full min-w-[1360px] table-fixed border-collapse" aria-busy={loading || refreshing}>
        <colgroup><col style={{ width: 32 }} />{FIELDS.map(c => <col key={c.key} style={WIDTH[c.key] ? { width: WIDTH[c.key] } : undefined} />)}</colgroup>
        <thead>
          <tr className="h-7 border-b border-(--dp-border) bg-(--dp-chip-soft) text-[11px] font-semibold text-(--dp-secondary)">
            <th className="pl-0.5 text-left">
              <CheckBox checked={allOnPage} label={ko ? '이 페이지 전체' : 'This page'} disabled={!pageIds.length || outcome !== 'ok'}
                onChange={() => setChecked(c => (allOnPage ? c.filter(id => !pageIds.includes(id)) : [...new Set([...c, ...pageIds])]))} />
            </th>
            {FIELDS.map(c => <th key={c.key} scope="col" className={cn('truncate px-2 font-semibold', c.align === 'right' ? 'text-right' : 'text-left')}>{ko ? c.ko : c.en}</th>)}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
    {outcome === 'ok' && filtered.length > 0 && <div className="dp-num flex h-8 items-center justify-between border-t border-(--dp-border) px-3 text-[11px] text-(--dp-muted)">
      <span>{view.start + 1}–{view.start + view.rows.length} / {view.total}</span>
      <span className="flex items-center gap-1">
        <span className="mr-1">{view.index + 1} / {view.pages}</span>
        <button type="button" aria-label={ko ? '이전' : 'Previous'} disabled={view.index === 0} onClick={() => setPageIndex(view.index - 1)} className="grid size-6 place-items-center rounded-(--dp-radius-sm) border border-(--dp-border) hover:bg-(--dp-chip-soft) disabled:opacity-40"><ChevronLeft className="size-3.5" aria-hidden /></button>
        <button type="button" aria-label={ko ? '다음' : 'Next'} disabled={view.index >= view.pages - 1} onClick={() => setPageIndex(view.index + 1)} className="grid size-6 place-items-center rounded-(--dp-radius-sm) border border-(--dp-border) hover:bg-(--dp-chip-soft) disabled:opacity-40"><ChevronRight className="size-3.5" aria-hidden /></button>
      </span>
    </div>}
  </section>;
}

function Line({ span, icon, message, id, onRetry }: { span: number; icon: ReactNode; message: string; id: string; onRetry?: () => void }) {
  const { lang } = useI18n();
  return <tr className="h-10 border-b border-(--dp-row-line)"><td colSpan={span} className="px-3">
    <span className="flex items-center gap-2 text-[12px]">
      {icon}<span>{message}</span><span className="dp-mono text-[11px] text-(--dp-muted)">{id}</span>
      {onRetry && <button type="button" onClick={onRetry} className="inline-flex h-6 items-center gap-1 rounded-(--dp-radius-sm) border border-(--dp-border) px-2 text-[11px] font-semibold text-(--dp-secondary) hover:bg-(--dp-chip-soft)"><RotateCw className="size-3" aria-hidden />{lang === 'ko' ? '재시도' : 'Retry'}</button>}
    </span>
  </td></tr>;
}

function MakerMenu({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const { lang } = useI18n();
  const [open, setOpen] = useState(false);
  const all = lang === 'ko' ? '전체' : 'All';
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" aria-haspopup="listbox" className={cn('inline-flex h-[26px] items-center gap-1 rounded-(--dp-radius-sm) border px-2 text-[12px] data-[state=open]:bg-(--dp-chip-soft)',
        value ? 'border-(--dp-seg-on) text-(--dp-text)' : 'border-(--dp-border) text-(--dp-secondary) hover:bg-(--dp-chip-soft)')}>
        <span className="text-(--dp-muted)">Maker</span><span className="font-medium">{value || all}</span><ChevronDown className="size-3 text-(--dp-muted)" aria-hidden />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="dp-pop" style={popStyle(180)}>
      <div role="listbox" aria-label="Maker" className="p-1">
        {['', ...options].map(o => <button key={o || 'all'} type="button" role="option" aria-selected={value === o} onClick={() => { onChange(o); setOpen(false); }}
          className="flex h-7 w-full items-center gap-2 rounded-(--dp-radius-sm) px-2 text-left text-[12px] hover:bg-(--dp-chip-soft)">
          <span className="flex-1">{o || all}</span>{value === o && <Check className="size-3.5 text-(--dp-text)" strokeWidth={2.5} aria-hidden />}
        </button>)}
      </div>
    </PopoverContent>
  </Popover>;
}
