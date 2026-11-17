import { useEffect, useId, useRef, useState } from 'react';
import type { MatrixColumn, MatrixEmphasisRule, MatrixNode } from '@ap/contracts';
import { useMessages } from '@ap/kernel';
import { Button, Checkbox, Input, Label, Popover, PopoverContent, PopoverTrigger, useImeEnterGuard } from '@ap/ui';
import { MoreHorizontal } from 'lucide-react';
import { distinctRowValues, type MatrixValueOf } from './emphasis';
import { MATRIX_MESSAGES } from './messages';

type EditorProps<N extends MatrixNode> = {
  node: N;
  columns: readonly MatrixColumn[];
  valueOf: MatrixValueOf<N>;
  rule?: MatrixEmphasisRule;
  onApply: (rule: MatrixEmphasisRule | null) => void;
};
function EmphasisEditor<N extends MatrixNode>({ node, columns, valueOf, rule, onApply }: EditorProps<N>) {
  const m = useMessages(MATRIX_MESSAGES);
  const prefix = useId();
  const ime = useImeEnterGuard();
  const root = useRef<HTMLFormElement>(null);
  useEffect(() => { root.current?.querySelector<HTMLElement>('input, [role="checkbox"], button:not(:disabled)')?.focus(); }, []);
  const values = distinctRowValues(node, columns, valueOf);
  const numeric = values.length > 0 && values.every(entry => typeof entry.value === 'number' && Number.isFinite(entry.value));
  const range = rule?.match.kind === 'range' ? rule.match : undefined;
  const [min, setMin] = useState(range?.min === undefined ? '' : String(range.min));
  const [max, setMax] = useState(range?.max === undefined ? '' : String(range.max));
  const [picked, setPicked] = useState<(string | number)[]>(rule?.match.kind === 'values' ? rule.match.values : []);
  const lower = min.trim() === '' ? undefined : Number(min);
  const upper = max.trim() === '' ? undefined : Number(max);
  const reversed = lower !== undefined && upper !== undefined && lower > upper;
  const rangeValid = (lower !== undefined || upper !== undefined) && (lower === undefined || Number.isFinite(lower)) && (upper === undefined || Number.isFinite(upper)) && !reversed;
  const valid = numeric ? rangeValid : picked.length > 0;
  const apply = () => {
    if (!valid) return;
    const match: MatrixEmphasisRule['match'] = numeric
      ? { kind: 'range', ...(lower === undefined ? {} : { min: lower }), ...(upper === undefined ? {} : { max: upper }) }
      : { kind: 'values', values: picked };
    onApply({ row: node.id, match });
  };
  return <form ref={root} className="space-y-3" onSubmit={event => { event.preventDefault(); apply(); }} onKeyDown={ime.onKeyDown} onCompositionStart={ime.onCompositionStart} onCompositionEnd={ime.onCompositionEnd}>
    <p className="t-card-title">{node.label}</p>
    {numeric ? <div className="flex gap-2">
      <div className="min-w-0 flex-1 space-y-1"><Label htmlFor={`${prefix}-min`}>{m('min')}</Label><Input id={`${prefix}-min`} type="number" step="any" value={min} onChange={event => setMin(event.target.value)} /></div>
      <div className="min-w-0 flex-1 space-y-1"><Label htmlFor={`${prefix}-max`}>{m('max')}</Label><Input id={`${prefix}-max`} type="number" step="any" value={max} onChange={event => setMax(event.target.value)} /></div>
    </div> : <ul className="max-h-64 space-y-2 overflow-auto">{values.map(({ value, count }, index) => <li key={`${typeof value}:${value}`} className="flex items-center gap-2">
      <Checkbox id={`${prefix}-${index}`} checked={picked.includes(value)} onCheckedChange={checked => setPicked(current => checked === true ? [...current, value] : current.filter(item => item !== value))} />
      <Label htmlFor={`${prefix}-${index}`}>{String(value)} ({count})</Label>
    </li>)}</ul>}
    {reversed && <p role="alert" className="text-xs text-text-danger-label">{m('invalidRange')}</p>}
    <div className="flex justify-end gap-2 border-t border-border-subtle pt-3">
      <Button type="button" variant="secondary" size="toolbar" onClick={() => onApply(null)}>{m('clear')}</Button>
      <Button type="submit" size="toolbar" disabled={!valid}>{m('apply')}</Button>
    </div>
  </form>;
}

export type MatrixRowMenuProps<N extends MatrixNode> = Omit<EditorProps<N>, 'rule' | 'onApply'> & {
  emphasis: readonly MatrixEmphasisRule[];
  onChange: (rules: MatrixEmphasisRule[]) => void;
  label?: string;
};

export function MatrixRowMenu<N extends MatrixNode>({ node, columns, valueOf, emphasis, onChange, label }: MatrixRowMenuProps<N>) {
  const m = useMessages(MATRIX_MESSAGES);
  const [view, setView] = useState<'closed' | 'menu' | 'editor'>('closed');
  const actionLabel = label ?? m('emphasize');
  return <Popover open={view !== 'closed'} onOpenChange={open => setView(open ? 'menu' : 'closed')}>
    <span className={view === 'closed' ? 'ml-auto shrink-0 opacity-0 group-hover/matrix-row:opacity-100 group-focus-within/matrix-row:opacity-100' : 'ml-auto shrink-0'}>
      <PopoverTrigger asChild><Button type="button" variant="ghost" size="icon-xs" aria-label={m('menu', { name: node.label })}><MoreHorizontal className="size-3.5" aria-hidden /></Button></PopoverTrigger>
    </span>
    {view !== 'closed' && <PopoverContent align="start" aria-label={actionLabel} className="w-72 break-keep">
      {view === 'menu' ? <div role="menu" aria-label={m('menu', { name: node.label })}>
        <Button type="button" role="menuitem" variant="ghost" size="toolbar" className="w-full justify-start" onClick={() => setView('editor')}>{actionLabel}</Button>
      </div> : <EmphasisEditor node={node} columns={columns} valueOf={valueOf} rule={emphasis.find(rule => rule.row === node.id)} onApply={rule => {
        onChange([...emphasis.filter(current => current.row !== node.id), ...(rule ? [rule] : [])]);
        setView('closed');
      }} />}
    </PopoverContent>}
  </Popover>;
}
