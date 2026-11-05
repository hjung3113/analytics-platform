import { defineMockAction, MockActionInvalid, type AnyMockAction } from '@ap/mock-server';
import type { FieldError } from '@ap/contracts';
import { specDraftCreate, specDraftSave, specPublish, specReject, specChangeAdd, specChangeRetire, specChangeConfirm, SPEC_CHANGE_LIMITS, SPEC_FIELD_TYPES, type SpecChangeAddInput, type SpecDraftSaveInput, type SpecSourceDocRef } from '../endpoints';
import { byId, releaseOrderOf, toCodeKey } from './store';
import { changeById, escapeKey, eventKey, key, latestSpec, revisionById, specChanges, specId, specRevisions, type Change, type Revision } from './specStore';
import { entries } from './specProjection';
import { specCanonical, specJson, specHash } from './specHash';
import { cleanName, draftRows, fieldError, nameError, optionalStoredText, savePlan, specUnsafe, SPEC_NAME_MAX, SPEC_TEXT_MAX } from './specInput';

type Input = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidError = (input: Input, name: string): FieldError[] => typeof input[name] === 'string' && UUID.test(input[name]) ? [] : [fieldError(name, 'malformed')];
const under = (prefix: string, errors: FieldError[]): FieldError[] => errors.map(e => ({ path: [prefix, ...e.path], code: e.code }));
/** The server's closed `sourceDocRef` schema (`sourceDocRefSchema`): names bounded and normalised, optional link. */
const sourceRefErrors = (ref: unknown): FieldError[] => {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return [fieldError('sourceDocRef', 'required')];
  const value = ref as Record<string, unknown>;
  const errors: FieldError[] = [];
  for (const key of Object.keys(value)) if (!['docLabel', 'docVersion', 'link'].includes(key)) errors.push(fieldError(`sourceDocRef.${key}`, 'malformed'));
  const label = nameError(value['docLabel'], SPEC_NAME_MAX, 'sourceDocRef.docLabel');
  if (label.error) errors.push(label.error);
  const version = nameError(value['docVersion'], SPEC_NAME_MAX, 'sourceDocRef.docVersion');
  if (version.error) errors.push(version.error);
  const link = optionalStoredText(value['link'], 2000);
  if (link.error) errors.push({ ...link.error, path: ['sourceDocRef', 'link'] });
  return errors;
};
const storedSource = (ref: SpecSourceDocRef): SpecSourceDocRef => {
  const link = optionalStoredText(ref['link'], 2000).text;
  return { docLabel: cleanName(String(ref.docLabel)), docVersion: cleanName(String(ref.docVersion)), ...(link ? { link } : {}) };
};
const revisionVersion = ({ input }: { input: Input }) => { const r = revisionById(String(input.revisionId)); return r ? r.revision.state === 'draft' ? String(r.revision.version) : `${r.revision.state}:${crypto.randomUUID()}` : null; };
const changeVersion = ({ input }: { input: Input }) => { const c = changeById(String(input.changeId)); return c ? String(c.version) : null; };
const draftErrors = (i: Input): FieldError[] => uuidError(i, 'revisionId');
const done = (revision: Revision, extra: Input = {}) => ({ data: { revisionId: revision.revision.id, version: String(revision.revision.version), ...extra }, version: String(revision.revision.version) });
function createDraft(modelId: string, source: SpecSourceDocRef): Revision {
  const revision: Revision = { revision: { id: specId(), modelId: modelId.toLowerCase(), revisionNo: Math.max(0, ...specRevisions().filter(r => r.revision.modelId === modelId.toLowerCase()).map(r => r.revision.revisionNo)) + 1, state: 'draft', schemaVersion: 1, sourceDocRef: structuredClone(source), version: 1, createdAt: new Date().toISOString(), createdBy: 'admin', contentSha256: null, publishedAt: null, publishedBy: null }, modules: [], events: [], relations: [] };
  specRevisions().push(revision); return revision;
}
/** The stored key of a change target (`spec-target-key.ts`): module/event segments are code keys, field and predicate
 *  segments are normalised names, every segment escaped. Padding or case in the typed target never changes the key. */
function targetKey(i: SpecChangeAddInput): string {
  const t = i.target as Record<string, string>, name = (v: string | undefined) => escapeKey(cleanName(String(v)));
  if (i.targetKind === 'module') return key(cleanName(t.module!));
  if (i.targetKind === 'event') return eventKey(cleanName(t.module!), cleanName(t.event!));
  if (i.targetKind === 'field') return `${eventKey(cleanName(t.module!), cleanName(t.event!))}#${name(t.field)}`;
  return `${eventKey(cleanName(t.sourceModule!), cleanName(t.sourceEvent!))}#${name(t.predicate)}#${eventKey(cleanName(t.targetModule!), cleanName(t.targetEvent!))}`;
}

// ---- change input (what a schema can judge, before any state) -----------------------------------------------------
// Mirror of `domain/spec-change-input.ts`: closed target/value keys, per-kind required values, name-matches-target,
// bounded notes and a bounded change body. State (publication, software, parents, overlap, caps) is the handler's.
const TARGET_KEYS: Record<string, string[]> = { module: ['module'], event: ['module', 'event'], field: ['module', 'event', 'field'], relation: ['sourceModule', 'sourceEvent', 'predicate', 'targetModule', 'targetEvent'] };
const VALUE_KEYS: Record<string, string[]> = { module: ['name', 'parentModule'], event: ['name', 'triggerRule', 'detailDocRef'], field: ['name', 'type', 'unit', 'allowedValues', 'description'], relation: ['ruleRef'] };

function valueErrors(targetKind: string, side: 'before' | 'after', value: unknown): FieldError[] {
  const path = `change.${side}`;
  if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) return [fieldError(path, 'required')];
  const raw = value as Record<string, unknown>;
  const errors: FieldError[] = [];
  for (const key of Object.keys(raw)) if (!VALUE_KEYS[targetKind].includes(key)) errors.push(fieldError(`${path}.${key}`, 'malformed'));
  if (['module', 'event', 'field'].includes(targetKind)) {
    const name = nameError(raw['name'], SPEC_NAME_MAX, `${path}.name`);
    if (name.error) errors.push(name.error);
  }
  if (targetKind === 'field') {
    const type = raw['type'];
    if (type === undefined) errors.push(fieldError(`${path}.type`, 'required'));
    else if (typeof type !== 'string' || !SPEC_FIELD_TYPES.includes(type as (typeof SPEC_FIELD_TYPES)[number])) errors.push(fieldError(`${path}.type`, 'malformed'));
    const description = raw['description'];
    if (typeof description !== 'string') errors.push(fieldError(`${path}.description`, 'required'));
    else if (specUnsafe(description)) errors.push(fieldError(`${path}.description`, 'malformed'));
    else if ([...description].length > SPEC_TEXT_MAX) errors.push(fieldError(`${path}.description`, 'too_long'));
    const unit = optionalStoredText(raw['unit'], 100);
    if (unit.error) errors.push({ ...unit.error, path: [path, 'unit'] });
    const allowed = raw['allowedValues'];
    if (allowed !== undefined && allowed !== null) {
      if (!Array.isArray(allowed)) errors.push(fieldError(`${path}.allowedValues`, 'required'));
      else if (allowed.length > 200) errors.push(fieldError(`${path}.allowedValues`, 'too_long'));
      else allowed.forEach((entry, index) => { const name = nameError(entry, SPEC_NAME_MAX, `${path}.allowedValues.${index}`); if (name.error) errors.push(name.error); });
    }
  }
  const ref = raw['parentModule'];
  if (ref !== undefined && ref !== null) {
    const checked = nameError(ref, SPEC_NAME_MAX, `${path}.parentModule`);
    if (checked.error) errors.push(checked.error);
  }
  for (const key of ['triggerRule', 'detailDocRef', 'ruleRef'] as const) {
    if (!(key in raw)) continue;
    const text = optionalStoredText(raw[key], SPEC_TEXT_MAX);
    if (text.error) errors.push({ ...text.error, path: [path, key] });
  }
  return errors;
}

function changeInputErrors(input: Input, withModel = true): FieldError[] {
  const i = input as Partial<SpecChangeAddInput>;
  const errors = withModel ? [...uuidError(input, 'modelId'), ...uuidError(input, 'softwareId')] : [];
  if (i.endsBeforeSoftwareId) errors.push(...uuidError(input, 'endsBeforeSoftwareId'));
  if (i.targetKind === undefined) errors.push(fieldError('targetKind', 'required'));
  else if (!['module', 'event', 'field', 'relation'].includes(i.targetKind)) errors.push(fieldError('targetKind', 'malformed'));
  if (i.changeKind === undefined) errors.push(fieldError('changeKind', 'required'));
  else if (!['added', 'removed', 'changed', 'behavior'].includes(i.changeKind)) errors.push(fieldError('changeKind', 'malformed'));
  const textErrors = (): FieldError[] => {
    const out: FieldError[] = [];
    if (i.changeKind === 'behavior' && !i.note?.trim()) out.push(fieldError('note', 'required'));
    for (const [name, max] of [['note', SPEC_CHANGE_LIMITS.note], ['evidenceRef', SPEC_CHANGE_LIMITS.evidenceRef]] as const) {
      const value = i[name];
      if (value === undefined || value === null) continue;
      if (typeof value !== 'string') out.push(fieldError(name, 'required'));
      else if ([...value].length > max) out.push(fieldError(name, 'too_long'));
    }
    return out;
  };
  // An envelope that fails (an unknown kind) is answered alone, like the server: nothing kind-specific can be judged.
  if (errors.some(e => e.path[0] === 'targetKind' || e.path[0] === 'changeKind')) return [...errors, ...textErrors()];
  const target = i.target;
  if (!target || typeof target !== 'object' || Array.isArray(target)) errors.push(fieldError('target', 'required'));
  else {
    const keys = TARGET_KEYS[String(i.targetKind)];
    if (keys) {
      const record = target as Record<string, unknown>;
      for (const key of Object.keys(record)) if (!keys.includes(key)) errors.push(fieldError(`target.${key}`, 'malformed'));
      for (const key of keys) {
        const checked = key === 'predicate' ? nameError(record[key], 100, `target.${key}`) : nameError(record[key], SPEC_NAME_MAX, `target.${key}`);
        if (checked.error) errors.push(checked.error);
      }
    }
  }
  const sides = i.changeKind === 'behavior' ? [] : i.changeKind === 'added' ? ['after' as const] : i.changeKind === 'removed' ? ['before' as const] : ['before' as const, 'after' as const];
  const change = (i.change ?? {}) as Record<string, unknown>;
  if (i.change !== undefined && (typeof i.change !== 'object' || Array.isArray(i.change))) errors.push(fieldError('change', 'malformed'));
  else for (const key of Object.keys(change)) if (!sides.includes(key as 'before' | 'after')) errors.push(fieldError(`change.${key}`, 'malformed'));
  for (const side of sides) errors.push(...valueErrors(String(i.targetKind), side, change[side]));
  // The name a value spells must be the target's key (a rename changes the display name, never the key).
  if (sides.includes('after') && target && typeof target === 'object' && !Array.isArray(target)) {
    const t = target as Record<string, unknown>;
    // Both sides are the normalised names the server compares (`nameText`), never the raw typed text.
    const expect = i.targetKind === 'module' ? toCodeKey(cleanName(String(t['module'] ?? ''))) : i.targetKind === 'event' ? toCodeKey(cleanName(String(t['event'] ?? ''))) : cleanName(String(t['field'] ?? ''));
    const after = change['after'] as Record<string, unknown> | undefined;
    const actual = i.targetKind === 'field' ? cleanName(String(after?.['name'] ?? '')) : toCodeKey(cleanName(String(after?.['name'] ?? '')));
    if (expect !== '' && actual !== expect) errors.push(fieldError('change.after.name', 'target_mismatch'));
  }
  errors.push(...textErrors());
  if (new TextEncoder().encode(JSON.stringify(i.change ?? {})).length > SPEC_CHANGE_LIMITS.changeJsonBytes) errors.push(fieldError('change', 'too_large'));
  return errors;
}

/** What only the state can judge (`spec-change-actions.ts writeChange`): the caller holds the model lock. */
function changeStateErrors(input: Input, except?: Change): FieldError[] {
  const i = input as SpecChangeAddInput;
  const errors: FieldError[] = [];
  const base = latestSpec(i.modelId), sw = byId(i.softwareId), end = i.endsBeforeSoftwareId ? byId(i.endsBeforeSoftwareId) : null;
  if (!base) return [fieldError('revision', 'none_published')];
  if (!sw || sw.kind !== 'software' || sw.parentId !== i.modelId.toLowerCase()) return [fieldError('softwareId', 'not_found')];
  if (i.endsBeforeSoftwareId && (!end || end.parentId !== sw.parentId)) return [fieldError('endsBeforeSoftwareId', 'not_found')];
  if (end && releaseOrderOf(end) <= releaseOrderOf(sw)) return [fieldError('endsBeforeSoftwareId', 'not_after_start')];
  const k = targetKey(i), all = entries(base), entry = all.get(k);
  if (i.changeKind === 'added' ? !!entry : !entry) errors.push(fieldError('targetKey', i.changeKind === 'added' ? 'already_exists' : 'not_found'));
  if (i.changeKind === 'added' && i.targetKind !== 'module') {
    // A new child needs its parent in the published revision (an added relation: both endpoint Events).
    const t = i.target as Record<string, string>;
    const parentOk = i.targetKind === 'relation'
      ? all.has(eventKey(t['sourceModule'] ?? '', t['sourceEvent'] ?? '')) && all.has(eventKey(t['targetModule'] ?? '', t['targetEvent'] ?? ''))
      : all.has(i.targetKind === 'field' ? eventKey(t['module'] ?? '', t['event'] ?? '') : key(t['module'] ?? ''));
    if (!parentOk) errors.push(fieldError('targetKey', 'not_found'));
  }
  const startOrder = releaseOrderOf(sw), endOrder = end ? releaseOrderOf(end) : Infinity;
  if (specChanges().some(c => c.id !== except?.id && c.modelId === i.modelId.toLowerCase() && !c.retiredAt && c.targetKey === k && releaseOrderOf(byId(c.softwareId)!) < endOrder && (!c.endsBeforeSoftwareId || releaseOrderOf(byId(c.endsBeforeSoftwareId)!) > startOrder))) errors.push(fieldError('range', 'overlap'));
  if (specChanges().filter(c => !c.retiredAt && c.modelId === i.modelId.toLowerCase() && c.id !== except?.id).length >= SPEC_CHANGE_LIMITS.openPerModel) errors.push(fieldError('changes', 'too_many'));
  return errors;
}

/** Canonical stored change values (`VALUE_SCHEMAS` + `storedField`): names normalised, blank texts null, null units dropped. */
function canonicalSide(targetKind: Change['targetKind'], value: unknown): Record<string, unknown> {
  const raw = (value ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof raw['name'] === 'string') out['name'] = cleanName(raw['name']);
  if (targetKind === 'field') {
    if ('type' in raw) out['type'] = raw['type'];
    if (typeof raw['description'] === 'string') out['description'] = raw['description'].trim();
    const unit = optionalStoredText(raw['unit'], 100);
    if (unit.text) out['unit'] = unit.text;
    if (Array.isArray(raw['allowedValues'])) out['allowedValues'] = raw['allowedValues'].map(a => cleanName(String(a)));
  }
  if (raw['parentModule'] !== undefined && raw['parentModule'] !== null) {
    const ref = nameError(raw['parentModule'], SPEC_NAME_MAX, 'parentModule');
    out['parentModule'] = ref.error ? null : toCodeKey(ref.name);
  }
  for (const key of ['triggerRule', 'detailDocRef', 'ruleRef'] as const) {
    if (!(key in raw)) continue;
    out[key] = optionalStoredText(raw[key], SPEC_TEXT_MAX).text;
  }
  return out;
}
const canonicalChange = (targetKind: Change['targetKind'], change?: Change['change']) => ({
  ...(change?.before !== undefined ? { before: canonicalSide(targetKind, change.before) } : {}),
  ...(change?.after !== undefined ? { after: canonicalSide(targetKind, change.after) } : {}),
});

function addChange(i: SpecChangeAddInput, actor: string): Change {
  const sw = byId(i.softwareId)!, end = i.endsBeforeSoftwareId ? byId(i.endsBeforeSoftwareId)! : null;
  const note = optionalStoredText(i.note, SPEC_CHANGE_LIMITS.note).text;
  const evidenceRef = optionalStoredText(i.evidenceRef, SPEC_CHANGE_LIMITS.evidenceRef).text;
  const change: Change = { id: specId(), modelId: i.modelId.toLowerCase(), softwareId: sw.id, softwareLabel: sw.code, endsBeforeSoftwareId: end?.id ?? null, endsBeforeLabel: end?.code ?? null, targetKind: i.targetKind, targetKey: targetKey(i), changeKind: i.changeKind, change: canonicalChange(i.targetKind, i.change), note, evidenceRef, basedOnRevNo: latestSpec(i.modelId)!.revision.revisionNo, needsRevalidation: false, revalidationRevNo: null, retiredAt: null, retiredBy: null, retiredByChangeId: null, createdAt: new Date().toISOString(), createdBy: actor, version: 1 };
  specChanges().push(change); return change;
}
const diffEntries = (r: Revision) => {
  const result = entries(r);
  for (const e of r.events) { const k = eventKey(r.modules.find(m => m.id === e.moduleId)!.moduleKey, e.eventKey); const entry = result.get(k)!; result.set(k, { ...entry, value: { ...entry.value, fields: e.fields } }); }
  return result;
};
export const specWritesMock: readonly AnyMockAction[] = [
  defineMockAction(specDraftCreate, { validate: i => {
    const errors = [...uuidError(i, 'modelId'), ...sourceRefErrors(i.sourceDocRef)];
    if (byId(i.modelId)?.kind !== 'model') errors.push(fieldError('modelId', 'not_found'));
    if (typeof i.modelId === 'string' && specRevisions().some(r => r.revision.modelId === i.modelId.toLowerCase() && r.revision.state === 'draft')) errors.push(fieldError('modelId', 'draft_exists'));
    return errors;
  }, handle: ({ input }) => done(createDraft(String(input.modelId), storedSource(input.sourceDocRef))) }),
  defineMockAction(specDraftSave, { version: revisionVersion, validate: i => {
    const errors = draftErrors(i);
    if (i.mode === undefined) errors.push(fieldError('mode', 'required'));
    else if (!['append', 'replace'].includes(i.mode)) errors.push(fieldError('mode', 'malformed'));
    if (i.sourceDocRef) errors.push(...sourceRefErrors(i.sourceDocRef));
    // Envelope/caps/closed-keys gate the parse; reference planning against the draft is the handler's (after CAS).
    return errors.length ? errors : draftRows(i as SpecDraftSaveInput).errors;
  }, handle: ({ input }) => {
    const old = revisionById(String(input.revisionId));
    if (!old || old.revision.state !== 'draft') throw new MockActionInvalid([{ path: ['revisionId'], code: 'conflict' }]);
    const plan = savePlan(input as SpecDraftSaveInput, structuredClone(old));
    if (plan.errors.length) throw new MockActionInvalid(plan.errors);
    const r = input.mode === 'replace' ? (old.revision.state = 'rejected', createDraft(old.revision.modelId, input.sourceDocRef ? storedSource(input.sourceDocRef) : old.revision.sourceDocRef)) : old;
    r.modules = plan.modules; r.events = plan.events; r.relations = plan.relations;
    if (input.sourceDocRef) r.revision.sourceDocRef = structuredClone(storedSource(input.sourceDocRef));
    r.revision.version++;
    return done(r, { counts: { modules: r.modules.length, events: r.events.length, relations: r.relations.length } });
  } }),
  defineMockAction(specPublish, { version: revisionVersion, validate: i => uuidError(i, 'revisionId'), handle: ({ input, actor }) => {
    const r = revisionById(String(input.revisionId));
    if (!r || r.revision.state !== 'draft') throw new MockActionInvalid([{ path: ['revisionId'], code: 'conflict' }]);
    if (!r.modules.length && !r.events.length && !r.relations.length) throw new MockActionInvalid([{ path: ['revisionId'], code: 'empty' }]);
    const previous = latestSpec(r.revision.modelId);
    const json = specCanonical(r);
    if (previous && specCanonical(previous) === json) {
      // Same content as the latest published revision: the draft is rejected, a new version is still answered.
      r.revision.state = 'rejected'; r.revision.version++;
      return { data: { outcome: 'unchanged' as const, revisionId: previous.revision.id }, version: String(r.revision.version) };
    }
    r.revision.version++;
    const hash = specHash(json);
    r.revision.state = 'published'; r.revision.publishedBy = actor; r.revision.publishedAt = new Date().toISOString(); r.revision.contentSha256 = hash;
    const before = previous ? diffEntries(previous) : new Map(), after = diffEntries(r);
    for (const c of specChanges()) if (previous && c.modelId === r.revision.modelId && !c.retiredAt && specJson(before.get(c.targetKey)) !== specJson(after.get(c.targetKey))) { c.needsRevalidation = true; c.revalidationRevNo = r.revision.revisionNo; c.version++; }
    return { data: { outcome: 'published' as const, revisionId: r.revision.id, contentSha256: hash }, version: String(r.revision.version) };
  } }),
  defineMockAction(specReject, { version: revisionVersion, validate: i => [...draftErrors(i), ...(typeof i.reason !== 'string' || !i.reason.trim() ? [fieldError('reason', 'required')] : [...i.reason].length > 500 ? [fieldError('reason', 'too_long')] : [])], handle: ({ input }) => {
    const r = revisionById(String(input.revisionId));
    if (!r || r.revision.state !== 'draft') throw new MockActionInvalid([{ path: ['revisionId'], code: 'conflict' }]);
    r.revision.state = 'rejected'; r.revision.version++;
    return done(r);
  } }),
  defineMockAction(specChangeAdd, { validate: i => { const errors = changeInputErrors(i); return errors.length ? errors : changeStateErrors(i); }, handle: ({ input, actor }) => { const c = addChange(input as SpecChangeAddInput, actor); return { data: { changeId: c.id }, version: String(c.version) }; } }),
  defineMockAction(specChangeRetire, { version: changeVersion, validate: i => {
    const errors = uuidError(i, 'changeId');
    const replacement = i.replacement;
    if (replacement !== undefined && replacement !== null) {
      if (!replacement || typeof replacement !== 'object' || Array.isArray(replacement)) errors.push(fieldError('replacement', 'malformed'));
      else errors.push(...under('replacement', changeInputErrors(replacement as Input, false)));
    }
    return errors;
  }, handle: ({ input, actor }) => {
    const c = changeById(String(input.changeId));
    if (!c) throw new MockActionInvalid([{ path: ['changeId'], code: 'not_found' }]);
    if (c.retiredAt) throw new MockActionInvalid([{ path: ['change'], code: 'already_retired' }]);
    let replacement: Change | null = null;
    if (input.replacement) {
      const body = input.replacement as SpecChangeAddInput;
      // The replacement must address the row it retires before anything is judged against the state.
      if (body.targetKind !== c.targetKind || targetKey(body) !== c.targetKey) throw new MockActionInvalid([{ path: ['replacement'], code: 'target_mismatch' }]);
      const stateErrors = changeStateErrors({ ...body, modelId: c.modelId }, c);
      if (stateErrors.length) throw new MockActionInvalid(under('replacement', stateErrors));
      replacement = addChange({ ...body, modelId: c.modelId }, actor);
    }
    c.retiredAt = new Date().toISOString(); c.retiredBy = actor; c.retiredByChangeId = replacement?.id ?? null; c.needsRevalidation = false; c.version++;
    return { data: { changeId: c.id, ...(replacement ? { replacementChangeId: replacement.id } : {}) }, version: String(c.version) };
  } }),
  defineMockAction(specChangeConfirm, { version: changeVersion, validate: i => uuidError(i, 'changeId'), handle: ({ input }) => {
    const c = changeById(String(input.changeId));
    if (!c) throw new MockActionInvalid([{ path: ['changeId'], code: 'not_found' }]);
    if (c.retiredAt) throw new MockActionInvalid([{ path: ['change'], code: 'already_retired' }]);
    if (!c.needsRevalidation) throw new MockActionInvalid([{ path: ['needsRevalidation'], code: 'not_set' }]);
    c.needsRevalidation = false; c.version++;
    return { data: { changeId: c.id }, version: String(c.version) };
  } }),
];
