import { useId } from 'react';
import { ArrowDown, ArrowUp, ListTree } from 'lucide-react';
import { useMessages } from '@ap/kernel';
import { Button, Checkbox, Label, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import { MATRIX_MESSAGES } from './messages';

export type MatrixLevelOrderProps = {
  levels: readonly { id: string; label: string }[];
  value: string[];
  defaultValue: string[];
  onChange: (value: string[]) => void;
  label?: string;
};

/** Controlled subset/order; the consumer persists a page key and the server regroups. Same list parts as the table's Columns. */
export function MatrixLevelOrder({ levels, value, defaultValue, onChange, label }: MatrixLevelOrderProps) {
  const m = useMessages(MATRIX_MESSAGES);
  const prefix = useId();
  const ids = new Set(levels.map(level => level.id));
  const valid = (order: string[]) => order.length > 0 && new Set(order).size === order.length && order.every(id => ids.has(id));
  if (ids.size !== levels.length || !valid(value) || !valid(defaultValue)) throw new Error('MatrixLevelOrder: declare unique levels and a nonempty valid order and default');
  const ordered = [...value.map(id => levels.find(level => level.id === id)!), ...levels.filter(level => !value.includes(level.id))];
  const move = (index: number, next: number) => {
    const order = value.slice();
    [order[index], order[next]] = [order[next], order[index]];
    onChange(order);
  };
  return <Popover>
    <PopoverTrigger asChild><Button variant="secondary" size="toolbar"><ListTree className="size-3.5" aria-hidden />{label ?? m('levels')}</Button></PopoverTrigger>
    <PopoverContent align="end" aria-label={label ?? m('levels')} className="max-h-[var(--radix-popover-content-available-height)] w-72 overflow-y-auto break-keep">
      <p className="t-card-title mb-2">{label ?? m('levels')}</p>
      <ul className="space-y-2">{ordered.map(level => {
        const at = value.indexOf(level.id);
        const included = at >= 0;
        const id = `${prefix}-${level.id}`;
        return <li key={level.id} className="flex min-h-6 items-center gap-2">
          <Checkbox id={id} checked={included} disabled={included && value.length === 1} className="size-3.5 border-border-control"
            onCheckedChange={checked => onChange(checked === true ? [...value, level.id] : value.filter(key => key !== level.id))} />
          <div className="min-w-0 flex-1"><Label htmlFor={id}><span className="block truncate">{level.label}</span></Label></div>
          <Button type="button" variant="ghost" size="icon-xs" className="shrink-0" disabled={!included || at === 0} aria-label={m('up', { name: level.label })} onClick={() => move(at, at - 1)}><ArrowUp className="size-3.5" aria-hidden /></Button>
          <Button type="button" variant="ghost" size="icon-xs" className="shrink-0" disabled={!included || at === value.length - 1} aria-label={m('down', { name: level.label })} onClick={() => move(at, at + 1)}><ArrowDown className="size-3.5" aria-hidden /></Button>
        </li>;
      })}</ul>
      <Button type="button" variant="secondary" size="toolbar" className="mt-3" onClick={() => onChange(defaultValue.slice())}>{m('reset')}</Button>
    </PopoverContent>
  </Popover>;
}
