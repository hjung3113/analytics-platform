/**
 * #52 prototype — Global Context editor BODIES (throwaway). Each variant shell draws only the trigger chrome and
 * mounts one of these inside its own popover. Copy and modes mirror @ap/shell GlobalContextBar (PeriodControl,
 * SetEditor, ConditionEditor, SelectionEditor); colours come from the active variant's --dp-* tokens.
 */
import { Check, X } from 'lucide-react';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { CONTEXT_LABELS, useAdapterRequest, useI18n, usePlatform } from '@ap/kernel';
import {
  type Capability, type Condition, type ConditionAxis, conditionLabel, type ContextKey, formatDateTime,
  type GlobalContext, parseDateTime, shift,
} from '@ap/contracts';
import { cn } from '@ap/ui';

/* ---------- shared popover surface ---------- */

/** Inline so the variant tokens always win over the shadcn defaults. */
export const popStyle = (width: number): CSSProperties => ({
  width, padding: 0, background: 'var(--dp-surface)', border: '1px solid var(--dp-border)',
  borderRadius: 'var(--dp-radius-lg)', boxShadow: 'var(--dp-shadow-pop)', color: 'var(--dp-text)',
});

const hours = (g: GlobalContext) => (g.from && g.to ? (parseDateTime(g.to, 'to').getTime() - parseDateTime(g.from, 'from').getTime()) / 3_600_000 : null);
const short = (v: string) => v.replace('T', ' ').slice(5, 16);

/* ---------- summaries (trigger text) ---------- */

export function usePeriodPreset(): '1d' | '7d' | 'custom' | null {
  const { global, defaultRangeTo } = usePlatform();
  const h = hours(global);
  return global.to === defaultRangeTo && h === 24 ? '1d' : global.to === defaultRangeTo && h === 168 ? '7d' : global.from ? 'custom' : null;
}

export function usePeriodSummary(): string {
  const { global } = usePlatform();
  const { t } = useI18n();
  const preset = usePeriodPreset();
  if (!global.from || !global.to) return t('none');
  if (preset === '1d') return t('preset1d');
  if (preset === '7d') return t('preset7d');
  return `${short(global.from)} → ${short(global.to)}`;
}

export function setSummary(ids: string[] | null, lang: 'ko' | 'en', absent?: string): string {
  if (ids === null) return absent ?? (lang === 'ko' ? '전체' : 'All');
  if (!ids.length) return lang === 'ko' ? '명시적 빈 집합' : 'Explicit empty set';
  return ids.length <= 2 ? ids.join(', ') : `${ids[0]} +${ids.length - 1}`;
}

export const AXIS_LABEL = (lang: 'ko' | 'en') => ({ stgroup: 'StGroup', team: lang === 'ko' ? '분임조' : 'Team', makerModel: 'Maker+Model' });

export function conditionSummary(c: Condition | null, lang: 'ko' | 'en'): string {
  if (!c) return lang === 'ko' ? '없음' : 'None';
  return `${AXIS_LABEL(lang)[c.axis]}: ${conditionLabel(c)}`;
}

/** Context the current page does not use but must keep (§6): shown as "미적용", removed only with ×. */
export type Carried = { key: ContextKey; label: string; value: string; remove: () => void };

export function useContextModel() {
  const { route, global, setGlobal } = usePlatform();
  const { tx, lang } = useI18n();
  const cap = route?.menu.context ?? null;
  const has: Record<ContextKey, boolean> = {
    time: global.from !== null, roomNames: global.roomNames !== null, condition: global.condition !== null, selection: global.selection !== null,
    lot: global.lotIds !== null, ppid: global.ppid !== null, recipe: global.recipeIds !== null, metric: global.metricId !== null,
  };
  const editable = (k: ContextKey) => !!cap && cap[k] !== 'unsupported';
  const carried: Carried[] = [];
  if (cap) {
    const push = (key: ContextKey, value: string, remove: () => void) => { if (has[key] && cap[key] === 'unsupported') carried.push({ key, label: tx(CONTEXT_LABELS[key]), value, remove }); };
    push('time', global.from ? `${short(global.from)} → ${short(global.to ?? global.from)}` : '', () => setGlobal({ from: null, to: null }));
    push('roomNames', setSummary(global.roomNames, lang), () => setGlobal({ roomNames: null }));
    push('condition', conditionSummary(global.condition, lang), () => setGlobal({ condition: null }));
    push('selection', setSummary(global.selection, lang), () => setGlobal({ selection: null }));
    push('lot', setSummary(global.lotIds, lang), () => setGlobal({ lotIds: null }));
    push('ppid', global.ppid ?? '', () => setGlobal({ ppid: null }));
    push('recipe', setSummary(global.recipeIds, lang), () => setGlobal({ recipeIds: null }));
    push('metric', `${global.metricId}${global.metricVersion ? ` @ ${global.metricVersion}` : ''}`, () => setGlobal({ metricId: null, metricVersion: null }));
  }
  return { cap, has, editable, carried };
}

/** "링크 복사" and "초기화" — same sentences as GlobalContextBar. */
export function useContextActions() {
  const { url, toast, resetContext } = usePlatform();
  const { lang } = useI18n();
  return {
    copyLabel: lang === 'ko' ? '링크 복사' : 'Copy link',
    resetLabel: lang === 'ko' ? '초기화' : 'Reset',
    copyLink: () => {
      void navigator.clipboard?.writeText(window.location.origin + url);
      toast(lang === 'ko' ? '현재 Context가 담긴 링크를 복사했습니다. 받는 사람의 권한으로 서버가 다시 검증합니다.' : 'Copied a link with the current context. The server re-validates for the recipient.');
    },
    reset: resetContext,
  };
}

export function CapTag({ cap }: { cap: Capability }) {
  const { lang } = useI18n();
  if (cap === 'apply') return null;
  return <span className={cn('inline-flex h-[16px] items-center rounded-(--dp-radius-sm) px-1 text-[10px] font-medium leading-none',
    cap === 'reference' ? 'bg-(--dp-chip-soft) text-(--dp-muted)' : 'border border-dashed border-(--dp-dashed) text-(--dp-muted)')}>
    {cap === 'reference' ? (lang === 'ko' ? '참조' : 'Ref') : (lang === 'ko' ? '미적용' : 'Not applied')}
  </span>;
}

/* ---------- small primitives shared by the bodies ---------- */

function Head({ title, hint }: { title: string; hint?: string }) {
  return <div className="px-3 pb-2 pt-3">
    <p className="text-[12px] font-[560] text-(--dp-text)">{title}</p>
    {hint && <p className="mt-0.5 text-[11px] leading-4 text-(--dp-muted)">{hint}</p>}
  </div>;
}

function Seg<T extends string>({ label, value, options, onChange, className }: { label: string; value: T | null; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; className?: string }) {
  return <div role="radiogroup" aria-label={label} className={cn('flex gap-0.5 rounded-(--dp-radius) bg-(--dp-chip-soft) p-0.5', className)}>
    {options.map(o => <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
      className={cn('h-6 flex-1 whitespace-nowrap rounded-(--dp-radius-sm) px-2 text-[12px] transition-colors',
        value === o.value ? 'bg-(--dp-surface) font-[560] text-(--dp-text) shadow-[0_1px_2px_rgba(24,24,27,.08),0_0_0_1px_var(--dp-border)]' : 'text-(--dp-muted) hover:text-(--dp-text)')}>{o.label}</button>)}
  </div>;
}

function Note({ children }: { children: ReactNode }) {
  return <div className="mx-3 mt-2 rounded-(--dp-radius) bg-(--dp-canvas) px-2.5 py-2 text-[11px] leading-4 text-(--dp-muted)">{children}</div>;
}

function Footer({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-(--dp-border) px-3 py-2.5">{children}</div>;
}

export function Btn({ kind = 'secondary', className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'secondary' | 'ghost' }) {
  return <button type="button" {...rest} className={cn('inline-flex h-7 items-center justify-center gap-1 rounded-(--dp-radius) px-2.5 text-[12px] font-[560] disabled:cursor-not-allowed disabled:opacity-40',
    kind === 'primary' && 'bg-[var(--dp-btn-bg,var(--dp-text))] text-white hover:opacity-90',
    kind === 'secondary' && 'border border-(--dp-border-strong) bg-(--dp-surface) text-(--dp-text) hover:bg-(--dp-canvas)',
    kind === 'ghost' && 'text-(--dp-muted) hover:bg-(--dp-chip-soft) hover:text-(--dp-text)', className)} />;
}

function CheckRow({ checked, onClick, children, role = 'checkbox' }: { checked: boolean; onClick: () => void; children: ReactNode; role?: 'checkbox' | 'option' | 'radio' | 'menuitemradio' }) {
  const aria = role === 'option' ? { 'aria-selected': checked } : { 'aria-checked': checked };
  return <button type="button" role={role} {...aria} onClick={onClick}
    className="flex h-8 w-full items-center gap-2 rounded-(--dp-radius-sm) px-2 text-left text-[12px] hover:bg-(--dp-chip-soft)">
    {role === 'checkbox'
      ? <span className={cn('grid size-3.5 shrink-0 place-items-center rounded-[4px] border', checked ? 'border-(--dp-primary) bg-(--dp-primary)' : 'border-(--dp-dashed) bg-(--dp-surface)')}>{checked && <Check className="size-2.5 text-white" strokeWidth={3.5} aria-hidden />}</span>
      : <span className="grid size-3.5 shrink-0 place-items-center">{checked && <Check className="size-3.5 text-(--dp-primary)" strokeWidth={2.5} aria-hidden />}</span>}
    {children}
  </button>;
}

/* ---------- Scope (single select, server re-validated) ---------- */

export function ScopeBody({ onDone }: { onDone: () => void }) {
  const { session, global, setGlobal } = usePlatform();
  const { lang } = useI18n();
  return <div className="pb-2">
    <Head title={lang === 'ko' ? '요청 Scope (단일 선택, 서버 재검증)' : 'Requested scope (single, server re-validated)'} />
    <div role="radiogroup" aria-label="Scope" className="px-1.5">
      {session.scopes.map(s => <CheckRow key={s.id} role="radio" checked={global.scopeId === s.id} onClick={() => { if (global.scopeId !== s.id) setGlobal({ scopeId: s.id }); onDone(); }}>
        <span className="flex-1 truncate">{s.label}</span>
        <span className="dp-num text-[11px] text-(--dp-muted)">room {s.grantedRooms}/{s.totalRooms}</span>
      </CheckRow>)}
    </div>
    <Note>{lang === 'ko' ? '권한 축은 Site 안의 room_name입니다. Scope를 바꾸면 Site 경계를 넘는 room·설비 조건/선택은 초기화됩니다.' : 'Grants are room_name within a Site. Changing scope clears site-bound room/equipment context.'}</Note>
  </div>;
}

/* ---------- Period: 1일 / 7일 / 사용자 지정, naive wall-clock [from, to) ---------- */

export function PeriodBody({ cap, onDone, presetLayout = 'row' }: { cap: Capability; onDone: () => void; presetLayout?: 'row' | 'column' }) {
  const { setGlobal, defaultRangeTo } = usePlatform();
  const { t, lang } = useI18n();
  const preset = usePeriodPreset();
  const [custom, setCustom] = useState(preset === 'custom');
  const presets = [{ id: '1d', label: t('preset1d'), h: 24 }, { id: '7d', label: t('preset7d'), h: 168 }, { id: 'custom', label: t('presetCustom'), h: 0 }] as const;
  const choose = (id: (typeof presets)[number]['id']) => {
    if (id === 'custom') { setCustom(true); return; }
    setGlobal({ from: shift(defaultRangeTo, -presets.find(p => p.id === id)!.h), to: defaultRangeTo });
    onDone();
  };
  const current = custom ? 'custom' : preset;
  return <div>
    <Head title={t('period')} hint={cap === 'reference' ? (lang === 'ko' ? '이 화면에서는 참조만 합니다. 목록 조회에는 적용되지 않습니다.' : 'Reference only on this page; not applied to the list query.') : undefined} />
    {presetLayout === 'row'
      ? <Seg className="mx-3" label={t('period')} value={current} onChange={choose} options={presets.map(p => ({ value: p.id, label: p.label }))} />
      : <div role="radiogroup" aria-label={t('period')} className="px-1.5">{presets.map(p => <CheckRow key={p.id} role="radio" checked={current === p.id} onClick={() => choose(p.id)}><span className="flex-1">{p.label}</span></CheckRow>)}</div>}
    {custom ? <CustomRange onDone={onDone} /> : <p className="px-3 pb-3 pt-2 text-[11px] leading-4 text-(--dp-muted)">{lang === 'ko' ? '설비 wall-clock(naive) 기준이며 UTC로 변환하지 않습니다. 교대일/영업일 의미는 Open입니다.' : 'Equipment wall-clock (naive), never converted to UTC. Shift/business-day semantics are Open.'}</p>}
  </div>;
}

/** Calendar dates are inclusive in the UI and become [D1T00:00:00, (D2+1)T00:00:00) in the URL (§6.3). */
function CustomRange({ onDone }: { onDone: () => void }) {
  const { global, setGlobal, defaultRangeTo } = usePlatform();
  const { t, lang } = useI18n();
  const [mode, setMode] = useState<'date' | 'time'>('date');
  const [start, setStart] = useState((global.from ?? shift(defaultRangeTo, -24)).slice(0, 10));
  const [end, setEnd] = useState(global.to ? shift(global.to, -24).slice(0, 10) : defaultRangeTo.slice(0, 10));
  const [fromT, setFromT] = useState(global.from ?? shift(defaultRangeTo, -24));
  const [toT, setToT] = useState(global.to ?? defaultRangeTo);
  let error: string | null = null;
  let result: { from: string; to: string } | null = null;
  try {
    if (mode === 'date') {
      const from = `${start}T00:00:00`;
      const to = formatDateTime(new Date(parseDateTime(`${end}T00:00:00`, 'end').getTime() + 86_400_000));
      if (from >= to) throw new Error(lang === 'ko' ? '시작일이 종료일보다 늦습니다.' : 'Start is after end.');
      result = { from, to };
    } else {
      const from = fromT.length === 16 ? `${fromT}:00` : fromT; const to = toT.length === 16 ? `${toT}:00` : toT;
      parseDateTime(from, 'from'); parseDateTime(to, 'to');
      if (from >= to) throw new Error(lang === 'ko' ? 'from < to 이어야 합니다.' : 'from must be before to.');
      result = { from, to };
    }
  } catch (e) { error = e instanceof Error ? e.message : String(e); }
  const input = 'dp-num h-8 w-full rounded-(--dp-radius) border border-(--dp-border-strong) bg-(--dp-surface) px-2 text-[12px] text-(--dp-text) outline-none focus:border-(--dp-primary)';
  return <form onSubmit={e => { e.preventDefault(); if (result) { setGlobal(result); onDone(); } }} className="text-[12px]">
    <div className="space-y-2.5 px-3 pt-3">
      <Seg label={lang === 'ko' ? '입력 방식' : 'Input mode'} value={mode} onChange={setMode}
        options={[{ value: 'date', label: lang === 'ko' ? '날짜 (양끝 포함)' : 'Dates (inclusive)' }, { value: 'time', label: lang === 'ko' ? '시각 (초 단위)' : 'Date-time (seconds)' }]} />
      {mode === 'date' ? <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1"><span className="text-[11px] text-(--dp-muted)">{lang === 'ko' ? '시작일' : 'Start date'}</span><input type="date" className={input} value={start} onChange={e => setStart(e.target.value)} /></label>
        <label className="space-y-1"><span className="text-[11px] text-(--dp-muted)">{lang === 'ko' ? '종료일 (포함)' : 'End date (inclusive)'}</span><input type="date" className={input} value={end} onChange={e => setEnd(e.target.value)} /></label>
      </div> : <div className="grid gap-2">
        <label className="space-y-1"><span className="text-[11px] text-(--dp-muted)">from</span><input type="datetime-local" step={1} className={input} value={fromT} onChange={e => setFromT(e.target.value)} /></label>
        <label className="space-y-1"><span className="text-[11px] text-(--dp-muted)">to ({lang === 'ko' ? '미포함' : 'exclusive'})</span><input type="datetime-local" step={1} className={input} value={toT} onChange={e => setToT(e.target.value)} /></label>
      </div>}
      <p aria-live="polite" className={cn('dp-mono rounded-(--dp-radius) px-2 py-1.5 text-[11px]', error ? 'bg-(--dp-danger-soft) text-(--dp-danger)' : 'bg-(--dp-canvas) text-(--dp-secondary)')}>
        {error ?? <>URL: [{result!.from}, {result!.to})</>}
      </p>
      <p className="text-[11px] leading-4 text-(--dp-muted)">{lang === 'ko' ? '설비 wall-clock(naive) 기준이며 UTC로 변환하지 않습니다. 교대일/영업일 의미는 Open입니다.' : 'Equipment wall-clock (naive), never converted to UTC. Shift/business-day semantics are Open.'}</p>
    </div>
    <Footer>
      <Btn onClick={onDone}>{t('cancel')}</Btn>
      <Btn kind="primary" type="submit" disabled={!result}>{t('apply')}</Btn>
    </Footer>
  </form>;
}

/* ---------- Sets: absent / explicit / explicit-empty ---------- */

type SetMode = 'absent' | 'some' | 'empty';
const modeOf = (ids: string[] | null): SetMode => (ids === null ? 'absent' : ids.length ? 'some' : 'empty');

function SetBody({ label, value, options, absentLabel, onApply, onDone, note, search, loading }: {
  label: string; value: string[] | null; options: { id: string; hint?: string; outside?: boolean }[]; absentLabel: string;
  onApply: (v: string[] | null) => void; onDone: () => void; note?: ReactNode; search?: boolean; loading?: ReactNode;
}) {
  const { t, lang } = useI18n();
  const [mode, setMode] = useState<SetMode>(modeOf(value));
  const [picked, setPicked] = useState<string[]>(value ?? []);
  const [q, setQ] = useState('');
  const visible = options.filter(o => !q || o.id.toLowerCase().includes(q.toLowerCase()) || o.hint?.toLowerCase().includes(q.toLowerCase()));
  return <div className="text-[12px]">
    <Head title={label} />
    <Seg className="mx-3" label={label} value={mode} onChange={setMode}
      options={[{ value: 'absent', label: absentLabel }, { value: 'some', label: lang === 'ko' ? '명시 선택' : 'Explicit' }, { value: 'empty', label: t('explicitEmpty') }]} />
    {mode === 'some' && <div className="mt-2">
      {search && <div className="px-3 pb-1.5"><input value={q} onChange={e => setQ(e.target.value)} placeholder={lang === 'ko' ? '검색…' : 'Search…'} aria-label={lang === 'ko' ? '검색' : 'Search'}
        className="h-7 w-full rounded-(--dp-radius) border border-(--dp-border-strong) bg-(--dp-surface) px-2 text-[12px] outline-none focus:border-(--dp-primary)" /></div>}
      {loading}
      <div className="dp-scroll max-h-56 overflow-auto px-1.5">
        {visible.map(o => <CheckRow key={o.id} checked={picked.includes(o.id)} onClick={() => setPicked(p => (p.includes(o.id) ? p.filter(x => x !== o.id) : [...p, o.id]))}>
          <span className="dp-mono text-[11.5px]">{o.id}</span>
          {o.hint && <span className="truncate text-(--dp-muted)">{o.hint}</span>}
          {o.outside && <span className="ml-auto shrink-0 rounded-(--dp-radius-sm) bg-(--dp-chip-soft) px-1 text-[10px] font-medium text-(--dp-warning)">{lang === 'ko' ? '조건 밖' : 'outside'}</span>}
        </CheckRow>)}
      </div>
    </div>}
    {note && <Note>{note}</Note>}
    <Footer>
      <Btn onClick={onDone}>{t('cancel')}</Btn>
      <Btn kind="primary" disabled={mode === 'some' && !picked.length} onClick={() => { onApply(mode === 'absent' ? null : mode === 'empty' ? [] : picked); onDone(); }}>{t('apply')}</Btn>
    </Footer>
  </div>;
}

export function RoomBody({ onDone }: { onDone: () => void }) {
  const { global, setGlobal, scope } = usePlatform();
  const { t, lang } = useI18n();
  return <SetBody label={t('roomNames')} value={global.roomNames} absentLabel={t('all')} onApply={v => setGlobal({ roomNames: v })} onDone={onDone}
    options={scope.grantedRooms.map(id => ({ id }))}
    note={lang === 'ko' ? 'room_name은 요청 Scope 안의 조회 범위를 좁힐 뿐 권한을 부여하지 않습니다.' : 'room_name narrows the requested scope; it never grants access.'} />;
}

export function SelectionBody({ onDone }: { onDone: () => void }) {
  const { global, setGlobal, scope, adapter } = usePlatform();
  const { t, lang } = useI18n();
  const input = { scopeId: global.scopeId, roomNames: global.roomNames, condition: global.condition, selection: global.selection };
  const evaluation = useAdapterRequest(signal => adapter.evaluateSelection(input, signal), [input, scope.status], scope.status === 'valid');
  const inCondition = evaluation.data?.inCondition ?? [];
  const outside = evaluation.data?.outOfCondition ?? [];
  const failed = evaluation.status === 'error';
  const options = [...inCondition.map(e => ({ id: e.equipmentId, hint: `${e.room} · ${e.model}` })), ...outside.map(id => ({ id, hint: undefined, outside: true }))];
  const count = failed ? (lang === 'ko' ? '확인 실패' : 'unavailable') : evaluation.status === 'done' ? String(inCondition.length) : '…';
  return <SetBody label={t('selection')} value={global.selection} search onDone={onDone}
    absentLabel={global.condition ? (lang === 'ko' ? `조건 결과 전체 (${count})` : `All condition results (${count})`) : t('all')}
    onApply={v => setGlobal({ selection: v })} options={options}
    loading={evaluation.status === 'loading' && <p role="status" className="px-3 py-1 text-(--dp-muted)">{lang === 'ko' ? '후보를 불러오는 중…' : 'Loading candidates…'}</p>}
    note={<>{lang === 'ko' ? 'Selection은 고정 EquipmentID 집합입니다.' : 'Selection is a fixed EquipmentID set.'}
      {failed && <span role="alert" className="mt-1 block text-(--dp-danger)">{lang === 'ko' ? '조건 결과를 확인하지 못했습니다.' : 'Could not evaluate the condition.'} <button type="button" className="text-(--dp-primary) underline" onClick={evaluation.retry}>{lang === 'ko' ? '다시 시도' : 'Retry'}</button></span>}
      {outside.length > 0 && <b className="mt-1 block font-[560] text-(--dp-warning)">{lang === 'ko' ? `현재 조건 결과 밖 ${outside.length}대 — 자동 제거하지 않습니다.` : `${outside.length} outside the current condition — not removed automatically.`}</b>}</>} />;
}

/* ---------- Condition: one axis ---------- */

export function ConditionBody({ onDone }: { onDone: () => void }) {
  const { global, setGlobal, adapter } = usePlatform();
  const { t, lang } = useI18n();
  const site = global.scopeId ?? '';
  const [axis, setAxis] = useState<ConditionAxis>(global.condition?.axis ?? 'stgroup');
  const [val, setVal] = useState<string>(global.condition ? conditionLabel(global.condition) : '');
  // Mounted only while the popover is open, so choices are fetched only then.
  const choices = useAdapterRequest(signal => adapter.contextOptions(site, signal), site, true);
  const all = choices.data;
  const options = !all ? [] : axis === 'stgroup' ? all.stgroup : axis === 'team' ? all.team : all.makerModel.map(m => `${m.maker} / ${m.model}`);
  const build = (): Condition | null => {
    if (!val) return null;
    if (axis === 'makerModel') { const [maker, model] = val.split(' / '); return { axis, maker, model }; }
    return { axis, id: val };
  };
  const axisLabel = AXIS_LABEL(lang);
  return <div className="text-[12px]">
    <Head title={t('condition')} />
    <Seg className="mx-3" label={lang === 'ko' ? '조건 축 (하나만)' : 'Condition axis (one)'} value={axis} onChange={a => { setAxis(a); setVal(''); }}
      options={(['stgroup', 'team', 'makerModel'] as const).map(a => ({ value: a, label: axisLabel[a] }))} />
    {choices.status !== 'done' && <p role="status" className="px-3 pt-2 text-(--dp-muted)">{choices.status === 'error'
      ? <>{lang === 'ko' ? '선택지를 불러오지 못했습니다.' : 'Could not load choices.'} <button type="button" className="text-(--dp-primary) underline" onClick={choices.retry}>{lang === 'ko' ? '다시 시도' : 'Retry'}</button></>
      : (lang === 'ko' ? '선택지를 불러오는 중…' : 'Loading choices…')}</p>}
    <div role="listbox" aria-label={axisLabel[axis]} className="dp-scroll mt-2 max-h-48 overflow-auto px-1.5">
      {options.map(o => <CheckRow key={o} role="option" checked={val === o} onClick={() => setVal(o)}><span className="dp-mono text-[11.5px]">{o}</span></CheckRow>)}
    </div>
    <Note>{lang === 'ko' ? 'live 조건: 재방문 시 현재 소속으로 다시 평가됩니다. 조건 변경은 고정 Selection을 바꾸지 않습니다.' : 'Live condition: membership is re-evaluated on revisit. Changing it never alters the fixed Selection.'}</Note>
    <div className="mt-3 flex items-center justify-between gap-1.5 border-t border-(--dp-border) px-3 py-2.5">
      <Btn kind="ghost" onClick={() => { setGlobal({ condition: null }); onDone(); }}>{t('clear')}</Btn>
      <span className="flex gap-1.5">
        <Btn onClick={onDone}>{t('cancel')}</Btn>
        <Btn kind="primary" disabled={!val} onClick={() => { setGlobal({ condition: build() }); onDone(); }}>{t('apply')}</Btn>
      </span>
    </div>
  </div>;
}

/* ---------- Unsupported (carried) values ---------- */

export function UnsupportedBody({ carried }: { carried: Carried[] }) {
  const { t, lang } = useI18n();
  return <div className="pb-2 text-[12px]">
    <Head title={lang === 'ko' ? '이 화면에서 미적용' : 'Not applied on this page'}
      hint={lang === 'ko' ? 'URL에 보존되며 지원 메뉴로 이동하면 재검증 후 적용됩니다.' : 'Kept in the URL; re-validated and applied on a supporting page.'} />
    <ul className="px-1.5">
      {carried.map(c => <li key={c.key} className="flex h-8 items-center gap-2 rounded-(--dp-radius-sm) px-2 hover:bg-(--dp-chip-soft)">
        <span className="text-(--dp-muted)">{c.label}</span>
        <span className="dp-num min-w-0 flex-1 truncate font-[560]">{c.value}</span>
        <button type="button" onClick={c.remove} aria-label={`${t('clear')} ${c.label}`} className="grid size-6 place-items-center rounded-(--dp-radius-sm) text-(--dp-muted) hover:bg-(--dp-border) hover:text-(--dp-text)"><X className="size-3.5" aria-hidden /></button>
      </li>)}
    </ul>
  </div>;
}
