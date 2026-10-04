// THROWAWAY #54: shared row vs category popover; callbacks stay consumer-owned.
import type { ReactNode } from 'react';
import { useI18n } from '@ap/kernel';
import { Search } from 'lucide-react';
import { Button, cn, Input, Popover, PopoverContent, PopoverTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, usePrototype } from '@ap/ui';
export type ProtoFilterField = { key: string; label: string; value: string; onChange: (value: string) => void; options?: { value: string; label: string }[]; placeholder?: string; testId?: string };
export function PrototypePageFilterBar({ fields, reset, children, actions, label, allLabel, filterLabel }: { fields: ProtoFilterField[]; reset?: ReactNode; children: ReactNode; actions?: ReactNode; label: string; allLabel: string; filterLabel: string }) {
  const { lang } = useI18n();
  const { filters } = usePrototype();
  if (filters === 'A') return children;
  const render = (f: ProtoFilterField) => <label key={f.key} className="grid gap-1 text-xs text-text-secondary">{f.label}{f.options ?
    <Select value={f.value || '__proto_all__'} onValueChange={v => f.onChange(v === '__proto_all__' ? '' : v)}><SelectTrigger aria-label={f.label} data-testid={f.testId} className="h-8 min-w-36 border-border-control bg-surface-card text-text-primary"><SelectValue /></SelectTrigger><SelectContent className="text-text-secondary"><SelectItem value="__proto_all__">{allLabel}</SelectItem>{[...f.options, ...(f.value && !f.options.some(o => o.value === f.value) ? [{ value: f.value, label: f.value }] : [])].map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>
    : <span className="relative">{f.key === 'q' && <Search aria-hidden className="pointer-events-none absolute left-2 top-2 size-4 text-text-secondary" />}<Input aria-label={f.label} data-testid={f.testId} placeholder={f.placeholder} value={f.value} onChange={e => f.onChange(e.target.value)} className={cn('h-8 w-56 max-w-full border-border-control bg-surface-card text-xs text-text-primary placeholder:text-text-secondary', f.key === 'q' && 'pl-8')} /></span>}</label>;
  const inline = fields.filter(f => !f.options);
  const categories = fields.filter(f => f.options);
  return <fieldset className="mb-3 rounded-md border border-border-subtle bg-surface-card p-3"><legend className="px-1 text-xs text-text-secondary">{label}</legend>
    {filters === 'B' ? <div className="flex flex-wrap items-end gap-3">{fields.map(render)}{actions}{reset}</div> : <>
      <div className="flex flex-wrap items-end gap-3">{inline.map(render)}<Popover><PopoverTrigger asChild><Button type="button" size="sm" variant="secondary">{filterLabel} · {categories.filter(f => f.value).length}</Button></PopoverTrigger><PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] border-border-control text-text-secondary"><div className="grid gap-3">{categories.map(render)}</div></PopoverContent></Popover>{actions}{reset}</div>
      <div className="mt-2 flex flex-wrap gap-2">{categories.filter(f => f.value).map(f => <Button type="button" key={f.key} size="sm" variant="secondary" className="h-auto min-h-8 max-w-full whitespace-normal text-left text-text-secondary" aria-label={`${f.label}: ${f.options?.find(o => o.value === f.value)?.label ?? f.value} — ${lang === 'ko' ? '필터 제거' : 'Remove filter'}`} onClick={() => f.onChange('')}>{f.label}: {f.options?.find(o => o.value === f.value)?.label ?? f.value} ×</Button>)}</div>
    </>}
  </fieldset>;
}
