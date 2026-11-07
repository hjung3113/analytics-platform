import { useEffect, useEffectEvent, useId, useState } from 'react';
import { useMenuAction, usePlatform, useUnsavedGuard } from '@ap/kernel';
import { Button, Callout, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Textarea } from '@ap/ui';
import { itemCreate, type Origin, type Target } from '../endpoints';
import { createErrors, originPeriod } from '../model';
import { useCopy } from '../copy';
import { Field } from './parts';
import { QuestPicker, type PickedQuest } from './QuestReference';
export function CreateDrawer({ origin, onClose }: { origin: Origin | null; onClose: () => void }) {
  const c = useCopy(), uid = useId();
  const { navigate, linkTo, toast } = usePlatform();
  const create = useMenuAction(itemCreate);
  const [problem, setProblem] = useState(''), [action, setAction] = useState('');
  const [targets, setTargets] = useState<Target[]>([]), [kind, setKind] = useState<Target['kind']>('equipment'), [key, setKey] = useState(''), [name, setName] = useState('');
  const [quest, setQuest] = useState<PickedQuest | null>(null), [error, setError] = useState(''), [targetError, setTargetError] = useState(false), [discard, setDiscard] = useState(false);
  const [fields, setFields] = useState<string[]>([]);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const dirty = !!problem || !!action || !!quest || targets.length > 0 || !!key || !!name;
  // Unsaved-edit guard (#1388): off once the item is saved, so the post-save move to the detail is not held.
  useUnsavedGuard(dirty && createdId === null);
  const openCreated = useEffectEvent((itemId: string) => navigate(linkTo('improvement-item', { params: { itemId } })));
  useEffect(() => { if (createdId) openCreated(createdId); }, [createdId]);
  const requestClose = () => { if (!create.pending) { if (dirty) setDiscard(true); else onClose(); } };
  function settle(result: Awaited<ReturnType<typeof create.run>>) {
    if (result.outcome === 'ok' && result.data) { toast(c.created, 'info'); setCreatedId(result.data.itemId); return; }
    setError(result.outcome === 'unknown' ? c.unknown : result.outcome === 'forbidden' ? c.denied : c.failed);
    setRetry(result.retry ? () => () => { void result.retry!().then(settle).catch(() => setError(c.failed)); } : null);
  }
  function save() {
    setRetry(null);
    const missing = createErrors({ problem, origin, targets });
    setFields(missing);
    if (missing.length > 0) {
      setError(c.createError);
      // Event-handler DOM access: the first invalid control takes focus and scrolls into view.
      const first = document.getElementById(missing.includes('problem') ? `${uid}-problem` : `${uid}-key`);
      first?.focus();
      first?.scrollIntoView({ block: 'center' });
      return;
    }
    setFields([]);
    setError('');
    void create.run({ problem: problem.trim(), action: action.trim() || null, origin, targets, ...(quest ? { questId: quest.id, questTitle: quest.title } : {}) }).then(settle).catch(() => setError(c.failed));
  }
  return <><Sheet open onOpenChange={open => { if (!open) requestClose(); }}><SheetContent closeLabel={c.cancel} className="flex w-full flex-col sm:max-w-xl"><SheetHeader><SheetTitle>{c.create}</SheetTitle><SheetDescription>{c.createDescription}</SheetDescription></SheetHeader>
    <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={e => { e.preventDefault(); if (!create.pending) save(); }}>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-1 py-4">
        <section className="space-y-2 rounded-md border border-border-subtle bg-surface-sunken p-3 text-sm text-text-secondary"><h3 className="font-semibold">{c.inherited}</h3>{origin ? <dl className="space-y-2"><div><dt>{c.sourceMenu}</dt><dd>{origin.menuId}</dd></div><div><dt>{c.period}</dt><dd>{originPeriod(origin.context, c.lang)}</dd></div><div><dt>{c.metric}</dt><dd>{typeof origin.context.metricId === 'string' ? origin.context.metricId : c.unset}</dd></div><div><dt>{c.target}</dt><dd>{Array.isArray(origin.context.selection) && origin.context.selection.length ? origin.context.selection.join(' · ') : c.unset}</dd></div></dl> : <p>{c.sourceMissing}</p>}</section>
        {error && <Callout tone="red" title={c.failed}><p role="alert">{error}</p>{retry && <Button type="button" variant="secondary" disabled={create.pending} onClick={retry}>{c.retry}</Button>}</Callout>}
        <Field id={`${uid}-problem`} label={c.requiredProblem} error={fields.includes('problem') ? c.problemInvalid : undefined}><Textarea autoFocus id={`${uid}-problem`} maxLength={500} placeholder={c.problemHint} value={problem} aria-invalid={fields.includes('problem') || undefined} aria-describedby={fields.includes('problem') ? `${uid}-problem-error` : undefined} onChange={e => setProblem(e.target.value)} /><p className="text-xs text-text-secondary">{[...problem].length}/500</p></Field>
        <Field id={`${uid}-action`} label={c.action}><Textarea id={`${uid}-action`} maxLength={2000} value={action} onChange={e => setAction(e.target.value)} /></Field>
        <section className="space-y-3 border-t border-border-subtle pt-4"><h3 className="text-sm font-semibold">{c.target}</h3>
          <Field id={`${uid}-kind`} label={c.targetKind}><Select value={kind} onValueChange={v => setKind(v as Target['kind'])}><SelectTrigger id={`${uid}-kind`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="equipment">{c.equipment}</SelectItem><SelectItem value="process">{c.process}</SelectItem></SelectContent></Select></Field>
          <div className="grid grid-cols-2 gap-3"><Field id={`${uid}-key`} label={c.targetKey} error={fields.includes('origin') ? c.targetRequired : undefined}><Input id={`${uid}-key`} maxLength={200} value={key} aria-invalid={fields.includes('origin') || undefined} aria-describedby={fields.includes('origin') ? `${uid}-key-error` : undefined} onChange={e => setKey(e.target.value)} /></Field><Field id={`${uid}-name`} label={c.targetName}><Input id={`${uid}-name`} maxLength={200} value={name} onChange={e => setName(e.target.value)} /></Field></div>
          <Button type="button" variant="secondary" disabled={targets.length >= 50} onClick={() => { if (!key.trim() || !name.trim()) { setTargetError(true); return; } setTargets(ts => [...ts.filter(t => t.kind !== kind || t.externalKey !== key.trim()), { kind, externalKey: key.trim(), displayName: name.trim() }]); setKey(''); setName(''); setTargetError(false); }}>{c.addTarget}</Button>
          {targetError && <p role="alert">{c.invalidTarget}</p>}
          <ul>{targets.map((t, i) => <li key={`${t.kind}:${t.externalKey}`} className="flex items-center justify-between gap-2 text-sm"><span>{t.displayName} · {t.externalKey}</span><Button type="button" variant="ghost" size="sm" aria-label={`${t.displayName} ${c.remove}`} onClick={() => setTargets(ts => ts.filter((_, n) => n !== i))}>{c.remove}</Button></li>)}</ul>
        </section>
        <QuestPicker selected={quest} onSelect={setQuest} />
      </div>
      <div className="flex justify-end gap-2 border-t border-border-subtle pt-4"><Button type="button" variant="secondary" disabled={create.pending} onClick={requestClose}>{c.cancel}</Button><Button type="submit" disabled={create.pending || !create.ready}>{create.pending ? c.saving : c.save}</Button></div>
    </form>
  </SheetContent></Sheet>
  <Dialog open={discard} onOpenChange={setDiscard}><DialogContent closeLabel={c.cancel}><DialogHeader><DialogTitle>{c.discard}</DialogTitle><DialogDescription>{c.createDescription}</DialogDescription></DialogHeader><DialogFooter><Button variant="secondary" onClick={() => setDiscard(false)}>{c.continueEditing}</Button><Button variant="destructive" onClick={onClose}>{c.discardConfirm}</Button></DialogFooter></DialogContent></Dialog></>;
}
