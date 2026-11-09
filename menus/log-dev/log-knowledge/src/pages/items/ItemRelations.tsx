import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import { useMenuQuery } from '@ap/kernel';
import { Button, RadioGroup, RadioGroupItem, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, StatusBadge } from '@ap/ui';
import { ITEM_RELATION_LIMITS, modelSpecEndpoint } from '../../endpoints';
import { eventsOf, eventIdentity } from '../spec/specModel';
import { useSpecWords } from '../spec/SpecControls';
import { Field } from './ItemFormParts';
import { EventKeyPicker } from './EventKeyPicker';
import { emptyRelation, type RelationRow } from './itemRelationModel';

export function RelationEditor({ rows, onChange, options, errors, specReady, disabled = false }: {
  rows: RelationRow[]; onChange: (rows: RelationRow[]) => void; options: string[]; errors: Record<string, string>; specReady: boolean; disabled?: boolean;
}) {
  const uid = useId(), w = useSpecWords(), [expanded, setExpanded] = useState<number | null>(null);
  const root = useRef<HTMLElement>(null), addButton = useRef<HTMLButtonElement>(null);
  const focusRequest = useRef<{ index: number; editor: boolean } | 'add' | null>(null);
  useLayoutEffect(() => {
    const request = focusRequest.current;
    if (request === 'add') addButton.current?.focus();
    else if (request) root.current?.querySelector<HTMLButtonElement>(`[data-relation-index="${request.index}"] [${request.editor ? 'data-relation-input' : 'data-relation-edit'}]`)?.focus();
    focusRequest.current = null;
  }, [expanded, rows.length]);
  const patch = (index: number, change: Partial<RelationRow>) => onChange(rows.map((row, at) => at === index ? { ...row, ...change } : row));
  const remove = (index: number) => {
    focusRequest.current = rows.length === 1 ? 'add' : { index: Math.min(index, rows.length - 2), editor: false };
    onChange(rows.filter((_, at) => at !== index));
    setExpanded(current => current === null || current === index ? null : current > index ? current - 1 : current);
  };
  return <section ref={root} aria-label={w('Event 관계 기록', 'Event relation records')} className="grid gap-3">
    <h3 className="text-sm font-medium">{w('Event 관계 기록', 'Event relation records')}</h3>
    <p className="text-xs text-text-muted">{w('기록하지 않아도 저장됩니다.', 'You can save without recording relations.')}</p>
    {rows.map((row, index) => {
      const name = w(`관계 ${index + 1}`, `Relation ${index + 1}`), error = errors[`relations.${index}`];
      const editing = expanded === index || !!error, unknown = specReady ? [...new Set([row.source, row.target].filter(key => key && !options.includes(key)))] : [];
      return <fieldset key={index} data-relation-index={index} aria-label={name} className="min-w-0 rounded-md border border-border-subtle p-3">
        <legend className="px-1 text-xs font-medium">{name}<Button type="button" size="icon-sm" variant="ghost" disabled={disabled} aria-label={`${name} ${w('빼기', 'Remove')}`} onClick={() => remove(index)}><X aria-hidden /></Button></legend>
        {editing ? <div className="grid gap-2">
          <div className="grid grid-cols-2 items-end gap-2"><Field id={`${uid}-${index}-kind`} label={w('종류', 'Kind')}><Select value={row.kind} disabled={disabled} onValueChange={next => patch(index, { kind: next === 'expected' ? 'expected' : 'observed' })}>
            <SelectTrigger id={`${uid}-${index}-kind`} data-relation-input><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="observed">{w('관찰', 'Observed')}</SelectItem><SelectItem value="expected">{w('기대', 'Expected')}</SelectItem></SelectGroup></SelectContent>
          </Select></Field><Field id={`${uid}-${index}-order`} label={w('순서', 'Order')}><RadioGroup id={`${uid}-${index}-order`} appearance="segmented" aria-label={w('순서', 'Order')} value={row.predicate} disabled={disabled} onValueChange={next => patch(index, { predicate: next === 'after' ? 'after' : 'before' })}>
            <RadioGroupItem appearance="segmented" value="before">{w('먼저', 'Before')}</RadioGroupItem><RadioGroupItem appearance="segmented" value="after">{w('나중', 'After')}</RadioGroupItem>
          </RadioGroup></Field></div>
          {(['source', 'target'] as const).map((side, at) => <Field key={side} id={`${uid}-${index}-${side}`} label={`Event ${at === 0 ? 'A' : 'B'}`}>
            <EventKeyPicker id={`${uid}-${index}-${side}`} value={row[side]} onChange={key => patch(index, { [side]: key })} options={options} disabled={disabled} invalid={!!error} describedBy={error ? `${uid}-${index}-error` : undefined} />
          </Field>)}
          <div className="flex justify-end"><Button type="button" size="sm" variant="secondary" onClick={() => { focusRequest.current = { index, editor: false }; setExpanded(null); }}>{w('입력 접기', 'Collapse input')}</Button></div>
        </div> : <div className="flex min-w-0 items-center gap-2"><div className="grid min-w-0 flex-1 gap-1">
          <div><StatusBadge tone={row.kind === 'expected' ? 'warning' : 'neutral'}>{row.kind === 'expected' ? w('기대', 'Expected') : w('관찰', 'Observed')}</StatusBadge></div>
          <p className="break-words text-xs text-text-secondary"><span className="t-mono break-all">{row.source || 'Event A'}</span>{w('가 ', row.predicate === 'before' ? ' happens before ' : ' happens after ')}
            <span className="inline-block max-w-full break-all"><span className="t-mono">{row.target || 'Event B'}</span>{w('보다', '')}</span>{row.predicate === 'before' ? w(' 먼저 일어남', '') : w(' 나중에 일어남', '')}
          </p>
        </div><Button type="button" data-relation-edit size="icon-sm" variant="ghost" disabled={disabled} aria-label={`${name} ${w('수정', 'Edit')}`} aria-expanded={false} onClick={() => { focusRequest.current = { index, editor: true }; setExpanded(index); }}><Pencil aria-hidden /></Button></div>}
        {unknown.length > 0 && <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-secondary"><StatusBadge tone="warning">{w('명세에 없는 Event', 'Event not in specification')}</StatusBadge>{unknown.map(key => <span key={key} className="t-mono break-all">{key}</span>)}</p>}
        {error && <p id={`${uid}-${index}-error`} role="alert" className="mt-2 text-xs text-text-danger-label">{error}</p>}
      </fieldset>;
    })}
    <div className="flex items-center gap-2"><Button ref={addButton} type="button" variant="secondary" size="sm" disabled={disabled || rows.length >= ITEM_RELATION_LIMITS.relations} onClick={() => { focusRequest.current = { index: rows.length, editor: true }; onChange([...rows, emptyRelation()]); setExpanded(rows.length); }}><Plus aria-hidden />{w('관계 추가', 'Add relation')}</Button><span className="text-xs text-text-muted">{rows.length}/{ITEM_RELATION_LIMITS.relations}</span></div>
    {errors['relations'] && <p role="alert" className="text-xs text-text-danger-label">{errors['relations']}</p>}
  </section>;
}

export function ItemRelations({ modelId, softwareId, ...props }: Omit<Parameters<typeof RelationEditor>[0], 'options' | 'specReady'> & { modelId: string; softwareId?: string }) {
  const w = useSpecWords(), query = useMenuQuery(modelSpecEndpoint, { modelId, ...(softwareId ? { softwareId } : {}) }, !!modelId);
  const response = query.response, malformed = !!response?.data && (!Array.isArray(response.data.events) || !Array.isArray(response.data.modules));
  const ready = !!response && ['ok', 'empty'].includes(response.outcome) && !malformed;
  const data = ready ? response?.data : null;
  const options = data ? eventsOf(data).map(eventIdentity) : [];
  return <><RelationEditor {...props} options={options} specReady={ready} />
    {!!modelId && !response && <p role="status" className="text-xs text-text-secondary">{w('명세의 Event 키를 불러오는 중…', 'Loading specification Event keys…')}</p>}
    {response && !ready && <div className="flex items-center gap-2 text-xs text-text-secondary"><span>{w('명세를 불러오지 못했습니다. Event 키를 직접 입력할 수 있습니다.', 'Could not load the specification. You can enter Event keys directly.')}</span><Button type="button" size="sm" variant="ghost" onClick={query.refetch}>{w('다시 시도', 'Retry')}</Button></div>}
  </>;
}
