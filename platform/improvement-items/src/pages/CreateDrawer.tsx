import { useEffect, useEffectEvent, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useMenuAction, usePlatform, useUnsavedGuard } from '@ap/kernel';
import { Button, Callout, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Textarea } from '@ap/ui';
import { itemCreate, type Origin, type Target } from '../endpoints';
import { createErrors, formatTarget } from '../model';
import { originContextTooLarge, originSubjectKeys, suggestedTargets } from '../origin';
import { OriginSummary } from './OriginSummary';
import { useCopy } from '../copy';
import { Field } from './parts';
import { QuestPicker, type PickedQuest } from './QuestReference';
export function CreateDrawer({ origin: initialOrigin, onClose }: { origin: Origin | null; onClose: () => void }) {
  const c = useCopy(), uid = useId();
  const { navigate, linkTo, toast, registry } = usePlatform();
  const create = useMenuAction(itemCreate);
  const [origin, setOrigin] = useState(() => initialOrigin ? structuredClone(initialOrigin) : null);
  const [suggestions] = useState(() => suggestedTargets(origin, originSubjectKeys(registry, origin)));
  // Match the existing API/editor limit; keep the full Selection in the origin snapshot.
  const [initialTargets] = useState(() => suggestions.slice(0, 50));
  const [targetOpen, setTargetOpen] = useState(!origin);
  const [problem, setProblem] = useState(''), [action, setAction] = useState('');
  const [targets, setTargets] = useState<Target[]>(initialTargets), [kind, setKind] = useState<Target['kind']>('equipment'), [key, setKey] = useState(''), [name, setName] = useState('');
  const [quest, setQuest] = useState<PickedQuest | null>(null), [error, setError] = useState(''), [targetError, setTargetError] = useState(false), [discard, setDiscard] = useState(false);
  const [serverOriginTooLarge, setServerOriginTooLarge] = useState(false);
  const originTooLarge = originContextTooLarge(origin) || serverOriginTooLarge;
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
  const dirty = (initialOrigin !== null && origin === null) || !!problem || !!action || !!quest || JSON.stringify(targets) !== JSON.stringify(initialTargets) || !!key || !!name;
  // Unsaved-edit guard (#1388): off once the item is saved, so the post-save move to the detail is not held.
  // A confirmed in-drawer discard turns the guard off first and closes after that commit, so the shell never asks a second time (UX-1).
  const [discarded, setDiscarded] = useState(false);
  useUnsavedGuard(dirty && createdId === null && !discarded, { leaves: 'address' });
  const closeAfterDiscard = useEffectEvent(() => onClose());
  useEffect(() => { if (discarded) closeAfterDiscard(); }, [discarded]);
  const openCreated = useEffectEvent((itemId: string) => navigate(linkTo('improvement-item', { params: { itemId } })));
  useEffect(() => { if (createdId) openCreated(createdId); }, [createdId]);
  const requestClose = () => { if (!create.pending) { if (dirty) setDiscard(true); else onClose(); } };
  function settle(result: Awaited<ReturnType<typeof create.run>>) {
    if (result.outcome === 'ok' && result.data) { toast(c.created, 'info'); setCreatedId(result.data.itemId); return; }
    if (result.fieldErrors.some(field => field.code === 'too_long' && field.path.length === 2 && field.path[0] === 'origin' && field.path[1] === 'context')) { setServerOriginTooLarge(true); setError(''); setRetry(null); return; }
    setError(result.outcome === 'unknown' ? c.unknown : result.outcome === 'forbidden' ? c.denied : c.failed);
    setRetry(result.retry ? () => () => { void result.retry!().then(settle).catch(() => setError(c.failed)); } : null);
  }
  function save() {
    setRetry(null);
    if (originTooLarge) return;
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
        {originTooLarge && <Callout tone="red" title={c.origin}><p role="alert">{c.originTooLarge}</p><Button type="button" variant="secondary" disabled={create.pending} onClick={() => { setOrigin(null); setServerOriginTooLarge(false); setTargetOpen(true); setError(''); setRetry(null); }}>{c.excludeOrigin}</Button></Callout>}
        {error && <Callout tone="red" title={c.failed}><p role="alert">{error}</p>{retry && <Button type="button" variant="secondary" disabled={create.pending} onClick={retry}>{c.retry}</Button>}</Callout>}
        <Field id={`${uid}-problem`} label={c.requiredProblem} error={fields.includes('problem') ? c.problemInvalid : undefined}><Textarea autoFocus rows={2} id={`${uid}-problem`} maxLength={500} placeholder={c.problemHint} value={problem} aria-invalid={fields.includes('problem') || undefined} aria-describedby={fields.includes('problem') ? `${uid}-problem-error` : undefined} onChange={e => setProblem(e.target.value)} /><p className="text-xs text-text-secondary">{[...problem].length}/500</p></Field>
        <Field id={`${uid}-action`} label={c.action}><Textarea rows={2} id={`${uid}-action`} maxLength={2000} value={action} onChange={e => setAction(e.target.value)} /></Field>
        <section aria-label={c.savedTargets} className="space-y-2"><h3 className="text-sm font-semibold">{c.savedTargets}</h3>
          {suggestions.length > 50 && <p className="text-xs text-text-secondary">{c.targetSuggestionLimit}</p>}
          <ul className="max-h-40 overflow-y-auto">{targets.map((t, i) => <li key={`${t.kind}:${t.externalKey}`} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 flex-1 break-all">{formatTarget(t, c)}</span><Button type="button" variant="ghost" size="sm" className="shrink-0" aria-label={`${formatTarget(t, c)} ${c.remove}`} onClick={() => setTargets(ts => ts.filter((_, n) => n !== i))}>{c.remove}</Button></li>)}</ul>
          {targets.length === 0 && <p className="text-sm text-text-secondary">{c.noTarget}</p>}
          <Button type="button" variant="ghost" size="sm" aria-expanded={targetOpen} aria-controls={`${uid}-targets`} onClick={() => setTargetOpen(!targetOpen)}>{c.target} · {targets.length || c.noTarget}<ChevronDown className={targetOpen ? 'size-4 rotate-180' : 'size-4'} aria-hidden /></Button>
          <div id={`${uid}-targets`} hidden={!targetOpen} className="space-y-3">
          <Field id={`${uid}-kind`} label={c.targetKind}><Select value={kind} onValueChange={v => setKind(v as Target['kind'])}><SelectTrigger id={`${uid}-kind`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="equipment">{c.equipment}</SelectItem><SelectItem value="process">{c.process}</SelectItem></SelectContent></Select></Field>
          <div className="grid grid-cols-2 gap-3"><Field id={`${uid}-key`} label={c.targetKey} error={fields.includes('origin') ? c.targetRequired : undefined}><Input id={`${uid}-key`} maxLength={200} value={key} aria-invalid={fields.includes('origin') || undefined} aria-describedby={[`${uid}-key-help`, ...(fields.includes('origin') ? [`${uid}-key-error`] : [])].join(' ')} onChange={e => setKey(e.target.value)} /><p id={`${uid}-key-help`} className="text-xs text-text-secondary">{kind === 'equipment' ? c.equipmentKeyHelp : c.processKeyHelp}</p></Field><Field id={`${uid}-name`} label={c.targetName}><Input id={`${uid}-name`} maxLength={200} value={name} onChange={e => setName(e.target.value)} /></Field></div>
          <Button type="button" variant="secondary" disabled={targets.length >= 50} onClick={() => { if (!key.trim() || !name.trim()) { setTargetError(true); return; } setTargets(ts => [...ts.filter(t => t.kind !== kind || t.externalKey !== key.trim()), { kind, externalKey: key.trim(), displayName: name.trim() }]); setKey(''); setName(''); setTargetError(false); }}>{c.addTarget}</Button>
          {targetError && <p role="alert">{c.invalidTarget}</p>}
          </div>
        </section>
        <QuestPicker selected={quest} onSelect={setQuest} />
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-border-subtle pt-3"><Button type="button" variant="secondary" disabled={create.pending} onClick={requestClose}>{c.cancel}</Button><Button type="submit" disabled={create.pending || !create.ready}>{create.pending ? c.saving : c.save}</Button></div>
    </form>
  </SheetContent></Sheet>
  <Dialog open={discard} onOpenChange={setDiscard}><DialogContent closeLabel={c.cancel}><DialogHeader><DialogTitle>{c.discard}</DialogTitle><DialogDescription>{c.createDescription}</DialogDescription></DialogHeader><DialogFooter><Button variant="secondary" onClick={() => setDiscard(false)}>{c.continueEditing}</Button><Button variant="destructive" onClick={() => setDiscarded(true)}>{c.discardConfirm}</Button></DialogFooter></DialogContent></Dialog></>;
}
