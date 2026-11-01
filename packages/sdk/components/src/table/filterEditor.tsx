/**
 * The one filter editor of PlatformDataTable (ADR-0105, 06 §15). A dialog for ONE field: operator select (only ops the field allows),
 * a value control per kind, 지우기 / 적용. The draft lives here; 적용/Enter applies one condition, Esc/outside discards (the popover
 * unmounts the editor). `+ 필터`, a chip body, a pinned button and a header funnel all open this same component.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { FILTER_OPS_BY_KIND, type ColumnFilter, type ColumnFilterOp, type ColumnFilterSpec } from '@ap/contracts';
import { Button, Checkbox, Input, Label, PopoverContent, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ap/ui';
import { useImeEnterGuard } from '../filters/useImeEnterGuard';
import { addDays, inclusiveDay, type FilterLimit } from './columnFilters';
import { FILTER_OP_LABELS } from './filterOps';
import type { ResolvedFilterField } from './filterFields';

type Lang = 'ko' | 'en';
/** `keep`: the instant bounds the draft opened with (full ISO), used while the user has not edited that bound's text. */
type Draft = { op: ColumnFilterOp; a: string; b: string; picked: string[]; keep?: { a?: [string, string]; b?: [string, string] } };

/** Operators the user may pick for a spec: its `ops` (the server-supported subset) or every op of its kind. */
export function allowedOps(spec: ColumnFilterSpec): readonly ColumnFilterOp[] {
  return spec.ops ?? FILTER_OPS_BY_KIND[spec.kind];
}

const NO_VALUE: ReadonlySet<string> = new Set(['isEmpty', 'isNotEmpty']);
const DEFAULT_OP: Record<ColumnFilterSpec['kind'], ColumnFilterOp> = { text: 'contains', number: 'eq', date: 'between', instant: 'between', enum: 'in' };

/** `datetime-local` text of an ISO instant, in the viewer's zone (06 §6.3). */
function toLocalInput(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const fromLocalInput = (text: string, kept?: [string, string]): string | undefined => {
  if (!text) return undefined;
  if (kept && kept[0] === text) return kept[1];
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

function initialDraft(spec: ColumnFilterSpec, active: ColumnFilter | undefined): Draft {
  const ops = allowedOps(spec);
  const preferred = DEFAULT_OP[spec.kind];
  const empty: Draft = { op: ops.includes(preferred) ? preferred : ops[0], a: '', b: '', picked: [] };
  if (!active) return empty;
  const base = { ...empty, op: active.op };
  if (active.op === 'isEmpty' || active.op === 'isNotEmpty') return base;
  if (active.op === 'in' || active.op === 'notIn') return { ...base, picked: active.value };
  if (active.op === 'between') {
    if (Array.isArray(active.value)) return { ...base, a: String(active.value[0]), b: String(active.value[1]) };
    if (spec.kind === 'instant') {
      const { from, to } = active.value;
      const a = toLocalInput(from);
      const b = toLocalInput(to);
      return { ...base, a, b, keep: { ...(from && a ? { a: [a, from] as [string, string] } : {}), ...(to && b ? { b: [b, to] as [string, string] } : {}) } };
    }
    return { ...base, a: active.value.from ?? '', b: active.value.to ? inclusiveDay(active.value.to) : '' };
  }
  return 'value' in active ? { ...base, a: String(active.value) } : base;
}

/** The condition a draft means, or `null` while it is incomplete (적용 stays disabled). */
function toFilter(id: string, spec: ColumnFilterSpec, d: Draft): ColumnFilter | null {
  const { op } = d;
  if (op === 'isEmpty' || op === 'isNotEmpty') return { id, op };
  if (op === 'in' || op === 'notIn') return d.picked.length > 0 ? { id, op, value: d.picked } : null;
  switch (spec.kind) {
    case 'text': { const v = d.a.trim(); return v ? { id, op: op as 'contains', value: v } : null; }
    case 'number': {
      const a = d.a.trim() === '' ? NaN : Number(d.a);
      const b = d.b.trim() === '' ? NaN : Number(d.b);
      if (op === 'between') return Number.isFinite(a) && Number.isFinite(b) ? { id, op, value: [Math.min(a, b), Math.max(a, b)] } : null;
      return Number.isFinite(a) ? { id, op: op as 'eq', value: a } : null;
    }
    case 'date': {
      if (op === 'before' || op === 'after') return d.a ? { id, op, value: d.a } : null;
      if (!d.a && !d.b) return null;
      return { id, op: 'between', value: { ...(d.a ? { from: d.a } : {}), ...(d.b ? { to: addDays(d.b, 1) } : {}) } };
    }
    case 'instant': {
      const from = fromLocalInput(d.a, d.keep?.a);
      const to = fromLocalInput(d.b, d.keep?.b);
      return from || to ? { id, op: 'between', value: { ...(from ? { from } : {}), ...(to ? { to } : {}) } } : null;
    }
    default: return null;
  }
}

const LIMIT_TEXT: Record<FilterLimit, { ko: string; en: string }> = {
  'too-many-conditions': { ko: '조건이 너무 많아 적용할 수 없습니다. 다른 조건을 지운 뒤 다시 적용하세요.', en: 'Too many conditions to apply. Clear another condition and apply again.' },
  'too-many-values': { ko: '값을 너무 많이 골랐습니다. 값을 줄인 뒤 다시 적용하세요.', en: 'Too many values selected. Select fewer and apply again.' },
  'too-long': { ko: '조건이 너무 길어 적용할 수 없습니다. 값을 줄인 뒤 다시 적용하세요.', en: 'The condition is too long to apply. Shorten the value and apply again.' },
};
const SEARCH_FROM = 6;

/** The form for one field's editor (labelled by `titleId`, the caller's dialog name): `onApply(null)` clears the condition. The caller closes its popover after `onApply`. */
export function FilterEditorForm({ field, active, lang, onApply, titleId, limit }: {
  field: ResolvedFilterField; active: ColumnFilter | undefined; lang: Lang; onApply: (next: ColumnFilter | null) => void; titleId: string;
  /** The codec cap the complete list would break if this condition were applied (`null` = fine); 적용 is refused with an explanation, 지우기 never is. */
  limit?: (next: ColumnFilter) => FilterLimit | null;
}) {
  const ko = lang === 'ko';
  const { spec } = field;
  const [draft, setDraft] = useState<Draft>(() => initialDraft(spec, active));
  const [query, setQuery] = useState('');
  const [refused, setRefused] = useState<FilterLimit | null>(null);
  const ime = useImeEnterGuard();
  const patch = (next: Partial<Draft>) => { setRefused(null); setDraft(d => ({ ...d, ...next })); };
  const baseId = useId();
  const root = useRef<HTMLFormElement>(null);
  useEffect(() => { (root.current?.querySelector<HTMLElement>('[data-editor-focus]') ?? root.current?.querySelector<HTMLElement>('[role="combobox"]'))?.focus(); }, []);
  const filter = toFilter(field.id, spec, draft);
  const ops = allowedOps(spec);
  const hasValue = !NO_VALUE.has(draft.op);
  const single = spec.kind === 'enum' && spec.multiple === false;
  const word = (op: ColumnFilterOp) => FILTER_OP_LABELS[op][lang];

  let value: ReactNode = null;
  if (hasValue) {
    if (spec.kind === 'text') value = <Input data-editor-focus aria-label={ko ? '값' : 'Value'} value={draft.a} onChange={e => patch({ a: e.target.value })} />;
    else if (spec.kind === 'number') {
      const between = draft.op === 'between';
      value = <div className="flex items-center gap-1">
        <Input data-editor-focus type="number" aria-label={between ? (ko ? '최솟값' : 'Minimum') : (ko ? '값' : 'Value')} value={draft.a} onChange={e => patch({ a: e.target.value })} />
        {between && <><span aria-hidden>~</span><Input type="number" aria-label={ko ? '최댓값' : 'Maximum'} value={draft.b} onChange={e => patch({ b: e.target.value })} /></>}
      </div>;
    } else if (spec.kind === 'date' && (draft.op === 'before' || draft.op === 'after')) {
      value = <Input data-editor-focus type="date" aria-label={ko ? '날짜' : 'Date'} value={draft.a} onChange={e => patch({ a: e.target.value })} />;
    } else if (spec.kind === 'date') {
      value = <div className="space-y-1">
        <Label htmlFor={`${baseId}-a`}>{ko ? '~부터' : 'From'}</Label>
        <Input data-editor-focus id={`${baseId}-a`} type="date" value={draft.a} onChange={e => patch({ a: e.target.value })} />
        <Label htmlFor={`${baseId}-b`}>{ko ? '~까지 (포함)' : 'To (inclusive)'}</Label>
        <Input id={`${baseId}-b`} type="date" value={draft.b} onChange={e => patch({ b: e.target.value })} />
      </div>;
    } else if (spec.kind === 'instant') {
      value = <div className="space-y-1">
        <Label htmlFor={`${baseId}-a`}>{ko ? '시작 (이상)' : 'From'}</Label>
        <Input data-editor-focus id={`${baseId}-a`} type="datetime-local" value={draft.a} onChange={e => patch({ a: e.target.value })} />
        <Label htmlFor={`${baseId}-b`}>{ko ? '끝 (미만)' : 'To (exclusive)'}</Label>
        <Input id={`${baseId}-b`} type="datetime-local" value={draft.b} onChange={e => patch({ b: e.target.value })} />
      </div>;
    } else {
      const needle = query.trim().toLowerCase();
      const options = spec.options.filter(o => o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle));
      value = <div role="group" aria-label={ko ? '값 목록' : 'Values'} className="space-y-2">
        {spec.options.length >= SEARCH_FROM && <Input data-editor-focus type="search" aria-label={ko ? '값 검색' : 'Search values'} placeholder={ko ? '값 검색' : 'Search values'} value={query}
          onChange={e => setQuery(e.target.value)} />}
        <ul className="max-h-48 space-y-1 overflow-auto">
          {options.map(o => {
            const checked = draft.picked.includes(o.value);
            const id = `${baseId}-v-${o.value}`;
            return <li key={o.value} className="flex min-h-7 items-center gap-2">
              {single
                ? <input id={id} type="radio" name={`${baseId}-one`} className="size-3.5 accent-accent-primary" checked={checked} onChange={() => patch({ picked: [o.value] })} />
                : <Checkbox id={id} className="size-3.5 border-border-control" checked={checked}
                    onCheckedChange={v => patch({ picked: v === true ? [...draft.picked, o.value] : draft.picked.filter(x => x !== o.value) })} />}
              <Label htmlFor={id}>{o.label}</Label>
            </li>;
          })}
          {options.length === 0 && <li className="text-xs text-text-muted">{ko ? '일치하는 값이 없습니다' : 'No matching values'}</li>}
        </ul>
      </div>;
    }
  }

  const submit = () => {
    if (!filter) return;
    const over = limit?.(filter) ?? null;
    if (over) { setRefused(over); return; }
    onApply(filter);
  };
  return <form ref={root} data-filter-editor={field.id} className="space-y-3" onSubmit={event => { event.preventDefault(); submit(); }}
    onKeyDown={ime.onKeyDown} onCompositionStart={ime.onCompositionStart} onCompositionEnd={ime.onCompositionEnd}>
      <div className="flex items-center justify-between gap-2">
        <p id={titleId} className="t-card-title min-w-0 truncate">{field.label}</p>
        <Select value={draft.op} onValueChange={next => patch({ op: next as ColumnFilterOp, ...(single && draft.picked.length > 1 ? { picked: draft.picked.slice(0, 1) } : {}) })}>
          <SelectTrigger density="compact" aria-label={ko ? '연산자' : 'Operator'} className="w-auto min-w-32 shrink-0 border-border-control">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>{ops.map(op => <SelectItem key={op} value={op}>{word(op)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {value}
      {refused && <p role="alert" className="text-xs text-text-danger-label">{LIMIT_TEXT[refused][lang]}</p>}
      <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
        <Button type="button" variant="ghost" size="toolbar" onClick={() => onApply(null)}>{ko ? '지우기' : 'Clear'}</Button>
        <Button type="submit" size="toolbar" disabled={!filter}>{ko ? '적용' : 'Apply'}</Button>
      </div>
  </form>;
}

/** The popover surface of an editor opened directly (chip, pinned button, header funnel). */
export function FilterEditorContent({ field, active, lang, onApply, limit, align = 'start' }: {
  field: ResolvedFilterField; active: ColumnFilter | undefined; lang: Lang; onApply: (next: ColumnFilter | null) => void; limit?: (next: ColumnFilter) => FilterLimit | null; align?: 'start' | 'end';
}) {
  const titleId = useId();
  return <PopoverContent align={align} className="w-80" aria-labelledby={titleId}>
    <FilterEditorForm field={field} active={active} lang={lang} onApply={onApply} titleId={titleId} limit={limit} />
  </PopoverContent>;
}
