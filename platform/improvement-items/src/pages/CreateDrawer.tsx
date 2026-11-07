import { useEffect, useEffectEvent, useId, useState } from 'react';
import { useMenuAction, usePlatform, useUnsavedGuard } from '@ap/kernel';
import { Button, Callout, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Textarea } from '@ap/ui';
import { itemCreate, type Origin, type Target } from '../endpoints';
import { createErrors } from '../model';
import { suggestedTargets } from '../origin';
import { OriginSummary } from './OriginSummary';
import { useCopy } from '../copy';
import { Field } from './parts';
import { QuestPicker, type PickedQuest } from './QuestReference';
export function CreateDrawer({ origin: initialOrigin, onClose }: { origin: Origin | null; onClose: () => void }) {
  const c = useCopy(), uid = useId();
  const { navigate, linkTo, toast } = usePlatform();
  const create = useMenuAction(itemCreate);
  const [origin] = useState(() => initialOrigin ? structuredClone(initialOrigin) : null);
  const [suggestions] = useState(() => suggestedTargets(origin));
  // Match the existing API/editor limit; keep the full Selection in the origin snapshot.
  const [initialTargets] = useState(() => suggestions.slice(0, 50));
  const [targetOpen, setTargetOpen] = useState(!origin);
  const [problem, setProblem] = useState(''), [action, setAction] = useState('');
  const [targets, setTargets] = useState<Target[]>(initialTargets), [kind, setKind] = useState<Target['kind']>('equipment'), [key, setKey] = useState(''), [name, setName] = useState('');
  const [quest, setQuest] = useState<PickedQuest | null>(null), [error, setError] = useState(''), [targetError, setTargetError] = useState(false), [discard, setDiscard] = useState(false);
  const [fields, setFields] = useState<string[]>([]);
  useEffect(() => {
    if (fields.length === 0) return;
    // Focus after the commit so a collapsed target editor is visible first.
    const first = document.getElementById(fields.includes('problem') ? `${uid}-problem` : `${uid}-key`);
    first?.focus();
    first?.scrollIntoView({ block: 'center' });
  }, [fields, uid]);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const dirty = !!problem || !!action || !!quest || JSON.stringify(targets) !== JSON.stringify(initialTargets) || !!key || !!name;
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
    if (missing.includes('origin')) setTargetOpen(true);
    if (missing.length > 0) {
      setError(c.createError);
      return;
    }
    setFields([]);
    setError('');
    void create.run({ problem: problem.trim(), action: action.trim() || null, origin, targets, ...(quest ? { questId: quest.id, questTitle: quest.title } : {}) }).then(settle).catch(() => setError(c.failed));
  }
  return <><Sheet open onOpenChange={open => { if (!open) requestClose(); }}><SheetContent closeLabel={c.cancel} className="flex w-full flex-col sm:max-w-xl"><SheetHeader><SheetTitle>{c.create}</SheetTitle><SheetDescription>{c.createDescription}</SheetDescription></SheetHeader>
    <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={e => { e.preventDefault(); if (!create.pending) save(); }}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-3">
        <section aria-label={c.inherited} className="space-y-2 rounded-md border border-border-subtle bg-surface-sunken p-3"><h3 className="text-sm font-semibold">{c.inherited}</h3>{origin ? <OriginSummary origin={origin} /> : <p className="text-sm text-text-secondary">{c.sourceMissing}</p>}</section>
        {error && <Callout tone="red" title={c.failed}><p role="alert">{error}</p>{retry && <Button type="button" variant="secondary" disabled={create.pending} onClick={retry}>{c.retry}</Button>}</Callout>}
        <Field id={`${uid}-problem`} label={c.requiredProblem} error={fields.includes('problem') ? c.problemInvalid : undefined}><Textarea autoFocus rows={2} id={`${uid}-problem`} maxLength={500} placeholder={c.problemHint} value={problem} aria-invalid={fields.includes('problem') || undefined} aria-describedby={fields.includes('problem') ? `${uid}-problem-error` : undefined} onChange={e => setProblem(e.target.value)} /><p className="text-xs text-text-secondary">{[...problem].length}/500</p></Field>
        <Field id={`${uid}-action`} label={c.action}><Textarea rows={2} id={`${uid}-action`} maxLength={2000} value={action} onChange={e => setAction(e.target.value)} /></Field>
        <QuestPicker selected={quest} onSelect={setQuest} />
        <section aria-label={c.target} className="space-y-3 border-t border-border-subtle pt-3">
          <Button type="button" variant="ghost" size="sm" aria-expanded={targetOpen} aria-controls={`${uid}-targets`} onClick={() => setTargetOpen(!targetOpen)}>{c.target} · {targets.length || c.noTarget}</Button>
          <div id={`${uid}-targets`} hidden={!targetOpen} className="space-y-3">
          <Field id={`${uid}-kind`} label={c.targetKind}><Select value={kind} onValueChange={v => setKind(v as Target['kind'])}><SelectTrigger id={`${uid}-kind`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="equipment">{c.equipment}</SelectItem><SelectItem value="process">{c.process}</SelectItem></SelectContent></Select></Field>
          <div className="grid grid-cols-2 gap-3"><Field id={`${uid}-key`} label={c.targetKey} error={fields.includes('origin') ? c.targetRequired : undefined}><Input id={`${uid}-key`} maxLength={200} value={key} aria-invalid={fields.includes('origin') || undefined} aria-describedby={[`${uid}-key-help`, ...(fields.includes('origin') ? [`${uid}-key-error`] : [])].join(' ')} onChange={e => setKey(e.target.value)} /><p id={`${uid}-key-help`} className="text-xs text-text-secondary">{kind === 'equipment' ? c.equipmentKeyHelp : c.processKeyHelp}</p></Field><Field id={`${uid}-name`} label={c.targetName}><Input id={`${uid}-name`} maxLength={200} value={name} onChange={e => setName(e.target.value)} /></Field></div>
          <Button type="button" variant="secondary" disabled={targets.length >= 50} onClick={() => { if (!key.trim() || !name.trim()) { setTargetError(true); return; } setTargets(ts => [...ts.filter(t => t.kind !== kind || t.externalKey !== key.trim()), { kind, externalKey: key.trim(), displayName: name.trim() }]); setKey(''); setName(''); setTargetError(false); }}>{c.addTarget}</Button>
          {targetError && <p role="alert">{c.invalidTarget}</p>}
          </div>
          {suggestions.length > 50 && <p className="text-xs text-text-secondary">{c.targetSuggestionLimit}</p>}
          <ul>{targets.map((t, i) => <li key={`${t.kind}:${t.externalKey}`} className="flex items-center justify-between gap-2 text-sm"><span>{t.displayName} · {t.externalKey}</span><Button type="button" variant="ghost" size="sm" aria-label={`${t.displayName} ${c.remove}`} onClick={() => setTargets(ts => ts.filter((_, n) => n !== i))}>{c.remove}</Button></li>)}</ul>
        </section>
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-border-subtle pt-3"><Button type="button" variant="secondary" disabled={create.pending} onClick={requestClose}>{c.cancel}</Button><Button type="submit" disabled={create.pending || !create.ready}>{create.pending ? c.saving : c.save}</Button></div>
    </form>
  </SheetContent></Sheet>
  <Dialog open={discard} onOpenChange={setDiscard}><DialogContent closeLabel={c.cancel}><DialogHeader><DialogTitle>{c.discard}</DialogTitle><DialogDescription>{c.createDescription}</DialogDescription></DialogHeader><DialogFooter><Button variant="secondary" onClick={() => setDiscard(false)}>{c.continueEditing}</Button><Button variant="destructive" onClick={onClose}>{c.discardConfirm}</Button></DialogFooter></DialogContent></Dialog></>;
}
