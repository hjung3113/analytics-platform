import { beforeEach, describe, expect, it } from 'vitest';
import { createMockAdapter, MockActionInvalid, setRole } from '@ap/mock-server';
import { emptyGlobal, groupId, KERNEL_PERMISSIONS, type MenuMeta, type PlatformAdapter } from '@ap/contracts';
import { SPEC_PUBLISH_PERMISSION } from '../endpoints';
import { logKnowledgeActionsMock, logKnowledgeMock, resetCatalog } from './index';
import { resetSpecs, SPEC_AT, SPEC_MODEL, specRevisions, specChanges, type Change, type Revision } from './specStore';
import { all } from './store';
import { specHash } from './specHash';
import { project } from './specProjection';

const action = (name: string) => logKnowledgeActionsMock.find(a => a.spec.id === `logKnowledge.${name}`)!;
const inputContext = (input: Record<string, unknown>) => ({ input, actor: 'admin' as const, scopeId: null });
const run = async (name: string, input: Record<string, unknown>) => {
  expect(action(name).validate?.(input) ?? []).toEqual([]);
  return await action(name).handle(inputContext(input));
};
const read = (name: string, params: Record<string, unknown>) => logKnowledgeMock.find(e => e.spec.id === `logKnowledge.${name}`)!.handle({ params, equipment: [], context: emptyGlobal, actor: 'admin' });
const software = () => all('software').filter(s => s.parentId === SPEC_MODEL);
beforeEach(() => { resetCatalog(); resetSpecs(); });

describe('model spec mock registrations', () => {
  it('registers every spec read and write, with three ordered releases and mixed change fixtures', () => {
    for (const id of ['modelSpec', 'modelSpecRevisions', 'specDraft', 'specChanges']) expect(logKnowledgeMock.some(e => e.spec.id === `logKnowledge.${id}`)).toBe(true);
    for (const id of ['specDraftCreate', 'specDraftSave', 'specPublish', 'specReject', 'specChangeAdd', 'specChangeRetire', 'specChangeConfirm']) expect(action(id)).toBeTruthy();
    expect(software()).toHaveLength(3);
    expect(new Set(specChanges().map(c => c.changeKind))).toEqual(new Set(['added', 'changed', 'removed', 'behavior']));
    expect(specChanges().some(c => c.retiredByChangeId)).toBe(true);
  });
  it('projects the effective spec and leaves ghost targets unapplied', async () => {
    const data = await read('modelSpec', { modelId: SPEC_MODEL, softwareId: software()[1]!.id }) as { effective: boolean; stale: unknown[]; removed: unknown[]; events: { changed: unknown[] }[] };
    expect(data.effective).toBe(true);
    expect(data.stale.length).toBeGreaterThan(0);
    expect(data.removed.length).toBeGreaterThan(0);
    expect(data.events.some(e => e.changed.length > 0)).toBe(true);
    expect(await read('modelSpec', { modelId: SPEC_MODEL, softwareId: 'ffffffff-0000-4000-8000-000000000000' })).toBeNull();
  });
  it('filters changes by flag/status and exclusive release end', async () => {
    const data = await read('specChanges', { modelId: SPEC_MODEL, needsRevalidation: true, status: 'all' }) as { rows: { needsRevalidation: boolean }[] };
    expect(data.rows.length).toBeGreaterThan(0);
    expect(data.rows.every(c => c.needsRevalidation)).toBe(true);
    const last = await read('specChanges', { modelId: SPEC_MODEL, softwareId: software()[2]!.id }) as { rows: { endsBeforeSoftwareId: string | null }[] };
    expect(last.rows.every(c => c.endsBeforeSoftwareId !== software()[2]!.id)).toBe(true);
  });
  it('creates, saves, reads and seals a draft; publication flags touched changes', async () => {
    const created = await run('specDraftCreate', { modelId: SPEC_MODEL.toUpperCase(), sourceDocRef: { docLabel: 'Spec', docVersion: '2' } });
    const id = (created.data as { revisionId: string }).revisionId;
    await run('specDraftSave', { revisionId: id, mode: 'append', text: 'kind\tmodule\tevent\nmodule\tChamber\nmodule\tRobot\nevent\tChamber\tStart\nevent\tRobot\tMove', format: 'paste' });
    expect((await read('specDraft', { revisionId: id }) as { events: unknown[] }).events).toHaveLength(2);
    const result = await run('specPublish', { revisionId: id });
    expect(result.data).toMatchObject({ outcome: 'published', contentSha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(String(await action('specDraftSave').version!(inputContext({ revisionId: id })))).toContain('published:');
    expect(specChanges().filter(c => !c.retiredAt).some(c => c.needsRevalidation)).toBe(true);
  });
  it('rejects oversized change input and a same-target overlapping range', () => {
    const base = { modelId: SPEC_MODEL, softwareId: software()[1]!.id, targetKind: 'event', target: { module: 'Chamber', event: 'Start' }, changeKind: 'behavior', note: 'review' };
    expect(action('specChangeAdd').validate?.({ ...base, change: { after: { name: 'x'.repeat(17000) } } })?.map(e => e.code)).toContain('too_large');
    expect(action('specChangeAdd').validate?.(base)?.map(e => e.code)).toContain('overlap');
  });
  it('retires with a replacement and confirms without changing the body', async () => {
    const original = specChanges().find(c => c.needsRevalidation && !c.retiredAt)!;
    const before = structuredClone(original.change);
    await run('specChangeConfirm', { changeId: original.id });
    expect(original.change).toEqual(before);
    expect(original.needsRevalidation).toBe(false);
    const result = await run('specChangeRetire', { changeId: original.id, replacement: { softwareId: original.softwareId, targetKind: 'event', target: { module: 'Chamber', event: 'Start' }, changeKind: 'behavior', note: 'replacement' } });
    expect(original.retiredByChangeId).toBe((result.data as { replacementChangeId: string }).replacementChangeId);
    expect(specRevisions().filter(r => r.revision.state === 'published')).toHaveLength(1);
  });
  it('refuses publication of an empty draft from the handler', async () => {
    const result = await run('specDraftCreate', { modelId: SPEC_MODEL, sourceDocRef: { docLabel: 'Spec', docVersion: '2' } });
    const id = (result.data as { revisionId: string }).revisionId;
    expect(action('specPublish').validate?.({ revisionId: id })).toEqual([]);
    expect(() => action('specPublish').handle(inputContext({ revisionId: id }))).toThrow(MockActionInvalid);
  });
  it('flags an event change when publication changes its fields', async () => {
    specChanges().forEach(c => { c.needsRevalidation = false; });
    const created = await run('specDraftCreate', { modelId: SPEC_MODEL, sourceDocRef: { docLabel: 'Spec', docVersion: '2' } });
    const revisionId = (created.data as { revisionId: string }).revisionId;
    await run('specDraftSave', { revisionId, mode: 'append', modules: [{ name: 'Chamber' }, { name: 'Robot' }, { name: 'Arm', parentModule: 'Robot' }], events: [{ module: 'Chamber', name: 'Start', triggerRule: 'on start', detailDocRef: '§1', fields: [] }, { module: 'Robot', name: 'Move', triggerRule: 'on move', detailDocRef: '§2' }, { module: 'Arm', name: 'Stop' }] });
    await run('specPublish', { revisionId });
    expect(specChanges().find(c => c.targetKey === 'CHAMBER/START')?.needsRevalidation).toBe(true);
    expect(specChanges().find(c => c.targetKey === 'ROBOT/MOVE' && !c.retiredAt)?.needsRevalidation).toBe(false);
  });
  it('uses SHA-256 for a deterministic content seal', () => {
    expect(specHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('rejects TSV cells that belong to another kind without modifying the draft', async () => {
    const created = await run('specDraftCreate', { modelId: SPEC_MODEL, sourceDocRef: { docLabel: 'Spec', docVersion: '2' } });
    const revisionId = (created.data as { revisionId: string }).revisionId;
    const errors = action('specDraftSave').validate?.({ revisionId, mode: 'append', format: 'paste', text: 'kind\tmodule\tevent\nmodule\tChamber\tUnexpected' });
    expect(errors?.map(e => [...e.path, e.code].join(':'))).toEqual(['text:line 2:column event:unexpected_value']);
    expect(specRevisions().find(r => r.revision.id === revisionId)?.modules).toHaveLength(0);
  });
  it('enforces permission and stale CAS through the adapter', async () => {
    const menu = { id: 'log-knowledge-models', group: groupId('logKnowledge'), permission: 'platform:view', requiresScope: false } as MenuMeta;
    const adapter = createMockAdapter({ endpoints: logKnowledgeMock.filter(e => e.spec.menuId === menu.id), actions: logKnowledgeActionsMock.filter(a => a.spec.menuId === menu.id), registry: { menus: [menu] }, permissions: [...KERNEL_PERMISSIONS, SPEC_PUBLISH_PERMISSION] });
    const change = specChanges().find(c => c.needsRevalidation)!;
    const req = { action: 'logKnowledge.specChangeConfirm', input: { changeId: change.id }, expectedVersion: '0', idempotencyKey: crypto.randomUUID(), context: {} };
    setRole('admin');
    expect((await adapter.menuAction(req)).outcome).toBe('conflict');
    setRole('viewer');
    expect((await adapter.menuAction({ ...req, idempotencyKey: crypto.randomUUID() })).outcome).toBe('forbidden');
    setRole('engineer');
  });
});

/** Adapter wired exactly like the existing stale-CAS test, for the fix-round cases. */
const writeAdapter = (): PlatformAdapter => {
  const menu = { id: 'log-knowledge-models', group: groupId('logKnowledge'), permission: 'platform:view', requiresScope: false } as MenuMeta;
  return createMockAdapter({ endpoints: logKnowledgeMock.filter(e => e.spec.menuId === menu.id), actions: logKnowledgeActionsMock.filter(a => a.spec.menuId === menu.id), registry: { menus: [menu] }, permissions: [...KERNEL_PERMISSIONS, SPEC_PUBLISH_PERMISSION] });
};
const callWrite = (adapter: PlatformAdapter, name: string, input: Record<string, unknown>, expectedVersion?: string) =>
  adapter.menuAction({ action: `logKnowledge.${name}`, input, idempotencyKey: crypto.randomUUID(), context: {}, ...(expectedVersion === undefined ? {} : { expectedVersion }) });

describe('mock mirrors the server (fix round 1)', () => {
  beforeEach(() => { resetCatalog(); resetSpecs(); setRole('admin'); });

  // C2: the engine judges CAS after `validate`, so state-dependent refusals must live in the handler — a stale
  // caller gets `conflict` (with the fresh version) exactly like the real server, never `invalid`.
  it('answers conflict, not a state refusal, for confirm-after-confirm and retire-after-retire', async () => {
    const adapter = writeAdapter();
    const flagged = specChanges().find(c => c.needsRevalidation && !c.retiredAt)!;
    const stale = String(flagged.version);
    expect((await callWrite(adapter, 'specChangeConfirm', { changeId: flagged.id }, stale)).outcome).toBe('ok');
    const again = await callWrite(adapter, 'specChangeConfirm', { changeId: flagged.id }, stale);
    expect(again.outcome).toBe('conflict');
    expect(again.version).toBe(String(flagged.version));
    const retired = specChanges().find(c => !c.retiredAt && c.id !== flagged.id)!;
    const retireStale = String(retired.version);
    expect((await callWrite(adapter, 'specChangeRetire', { changeId: retired.id }, retireStale)).outcome).toBe('ok');
    const reRetire = await callWrite(adapter, 'specChangeRetire', { changeId: retired.id }, retireStale);
    expect(reRetire.outcome).toBe('conflict');
  });

  it('answers conflict, not a planning refusal, for a stale draft save whose rows would fail', async () => {
    const adapter = writeAdapter();
    const created = await callWrite(adapter, 'specDraftCreate', { modelId: SPEC_MODEL, sourceDocRef: { docLabel: 'C', docVersion: '2' } });
    expect(created.outcome).toBe('ok');
    const id = (created.data as { revisionId: string }).revisionId;
    expect((await callWrite(adapter, 'specDraftSave', { revisionId: id, mode: 'append', modules: [{ name: 'Chamber' }] }, '1')).outcome).toBe('ok');
    const stale = await callWrite(adapter, 'specDraftSave', { revisionId: id, mode: 'append', modules: [{ name: 'Chamber' }] }, '1');
    expect(stale.outcome).toBe('conflict');
  });

  // C3: the mock refuses what the server schema refuses, and stores the server's canonical values.
  it('validates closed change schemas, unknown keys, name matches and relation parents', () => {
    const add = action('specChangeAdd');
    const sw = software()[1]!.id;
    const paths = (input: Record<string, unknown>) => add.validate?.(input)?.map(e => e.path.join('.'));
    const codes = (input: Record<string, unknown>) => add.validate?.(input)?.map(e => e.code);
    expect(paths({ modelId: SPEC_MODEL, softwareId: sw, targetKind: 'module', target: { module: 'New', extra: 1 }, changeKind: 'added', change: { after: {} } })).toContain('target.extra');
    expect(codes({ modelId: SPEC_MODEL, softwareId: sw, targetKind: 'module', target: { module: 'New' }, changeKind: 'added', change: { after: {} } })).toContain('required');
    expect(paths({ modelId: SPEC_MODEL, softwareId: sw, targetKind: 'module', target: { module: 'New' }, changeKind: 'added', change: { after: { name: 'New', bogus: 1 } } })).toContain('change.after.bogus');
    expect(codes({ modelId: SPEC_MODEL, softwareId: sw, targetKind: 'event', target: { module: 'Chamber', event: 'Start' }, changeKind: 'added', change: { after: { name: 'Elsewhere' } } })).toContain('target_mismatch');
    expect(paths({ modelId: SPEC_MODEL, softwareId: sw, targetKind: 'module', target: { module: 'Chamber' }, changeKind: 'behavior', note: 'x', change: { before: {} } })).toContain('change.before');
    expect(codes({ modelId: SPEC_MODEL, softwareId: sw, targetKind: 'relation', target: { sourceModule: 'Chamber', sourceEvent: 'Missing', predicate: 'uses', targetModule: 'Robot', targetEvent: 'Move' }, changeKind: 'added', change: { after: {} } })).toContain('not_found');
  });

  it('stores canonical change values the server would store', async () => {
    const sw = software()[1]!.id;
    await run('specChangeAdd', { modelId: SPEC_MODEL, softwareId: sw, targetKind: 'event', target: { module: 'Chamber', event: 'Second' }, changeKind: 'added', change: { after: { name: '  Second  ', triggerRule: ' on start ', detailDocRef: ' ' } } });
    const event = specChanges().find(c => c.targetKey === 'CHAMBER/SECOND')!;
    expect(event.change.after).toEqual({ name: 'Second', triggerRule: 'on start', detailDocRef: null });
    await run('specChangeAdd', { modelId: SPEC_MODEL, softwareId: sw, targetKind: 'field', target: { module: 'Chamber', event: 'Start', field: 'pressure' }, changeKind: 'added', change: { after: { name: 'pressure', type: 'float', unit: null, description: ' Pressure ' } } });
    const field = specChanges().find(c => c.targetKind === 'field')!;
    expect(field.change.after).toEqual({ name: 'pressure', type: 'float', description: 'Pressure' });
    await run('specChangeAdd', { modelId: SPEC_MODEL, softwareId: sw, targetKind: 'module', target: { module: 'Annex' }, changeKind: 'added', change: { after: { name: 'Annex', parentModule: ' Robot ' } } });
    expect(specChanges().find(c => c.targetKey === 'ANNEX')!.change.after).toEqual({ name: 'Annex', parentModule: 'ROBOT' });
  });

  it('enforces the server draft caps and closed row keys before any draft lookup', () => {
    const save = action('specDraftSave');
    const unused = '00000007-0000-4000-8000-0000000000ff';
    const paths = (input: Record<string, unknown>) => save.validate?.(input)?.map(e => e.path.join('.'));
    const codes = (input: Record<string, unknown>) => save.validate?.(input)?.map(e => e.code);
    expect(paths({ revisionId: unused, mode: 'append', modules: [{ name: 'X', bogus: 1 }] })).toContain('modules.0.bogus');
    expect(codes({ revisionId: unused, mode: 'append', events: [{ module: 'M', name: 'E', fields: Array.from({ length: 201 }, (_, i) => ({ name: `f${i}`, type: 'string', description: 'x' })) }] })).toContain('too_long');
    expect(codes({ revisionId: unused, mode: 'append', events: [{ module: 'M', name: 'E', fields: [{ name: 'f', type: 'nope', description: 'x' }] }] })).toContain('malformed');
    expect(codes({ revisionId: unused, mode: 'append', events: [{ module: 'M', name: 'E', fields: [{ name: 'f', type: 'string', description: 'x', allowedValues: Array.from({ length: 201 }, (_, i) => `v${i}`) }] }] })).toContain('too_long');
    expect(codes({ revisionId: unused, mode: 'append', text: 'kind\tmodule\nmodule\tA' })).toContain('required');
  });

  it('normalizes draft saves and seals identical content once', async () => {
    const first = await run('specDraftCreate', { modelId: SPEC_MODEL, sourceDocRef: { docLabel: ' Spec ', docVersion: '2' } });
    const a = (first.data as { revisionId: string }).revisionId;
    await run('specDraftSave', { revisionId: a, mode: 'append', modules: [{ name: 'Chamber' }], events: [{ module: 'Chamber', name: 'Start', triggerRule: ' on start ', detailDocRef: ' ' }] });
    const draft = await read('specDraft', { revisionId: a }) as { revision: { sourceDocRef: { docLabel: string } }; events: { name: string; triggerRule: string | null; detailDocRef: string | null }[] };
    expect(draft.revision.sourceDocRef.docLabel).toBe('Spec');
    expect(draft.events[0]).toMatchObject({ name: 'Start', triggerRule: 'on start', detailDocRef: null });
    expect(typeof (await run('specPublish', { revisionId: a })).version).toBe('string');
    const second = await run('specDraftCreate', { modelId: SPEC_MODEL, sourceDocRef: { docLabel: 'Spec', docVersion: '2' } });
    const b = (second.data as { revisionId: string }).revisionId;
    await run('specDraftSave', { revisionId: b, mode: 'append', modules: [{ name: 'Chamber ' }], events: [{ module: 'CHAMBER', name: 'Start', triggerRule: 'on start' }] });
    const again = await run('specPublish', { revisionId: b });
    expect(again.data).toMatchObject({ outcome: 'unchanged', revisionId: a });
    expect(typeof again.version).toBe('string');
  });

  // C7: both publication outcomes answer the version they produced, like the server dispatcher requires.
  it('returns and increments the revision version on both publication outcomes', async () => {
    const created = await run('specDraftCreate', { modelId: SPEC_MODEL, sourceDocRef: { docLabel: 'C', docVersion: '2' } });
    const id = (created.data as { revisionId: string }).revisionId;
    await run('specDraftSave', { revisionId: id, mode: 'append', modules: [{ name: 'Chamber' }] });
    const before = specRevisions().find(r => r.revision.id === id)!.revision.version;
    const result = await run('specPublish', { revisionId: id });
    const sealed = specRevisions().find(r => r.revision.id === id)!.revision;
    expect(sealed.state).toBe('published');
    expect(result.version).toBe(String(sealed.version));
    expect(sealed.version).toBeGreaterThan(before);
    const next = await run('specDraftCreate', { modelId: SPEC_MODEL, sourceDocRef: { docLabel: 'C', docVersion: '3' } });
    const nextId = (next.data as { revisionId: string }).revisionId;
    await run('specDraftSave', { revisionId: nextId, mode: 'append', modules: [{ name: 'Chamber' }] });
    const same = await run('specPublish', { revisionId: nextId });
    expect(same.data).toMatchObject({ outcome: 'unchanged' });
    expect(typeof same.version).toBe('string');
    expect(specRevisions().find(r => r.revision.id === nextId)!.revision.version).toBeGreaterThan(1);
  });

  // C4: the effective projection mirrors the server's composition exactly — field removals mark their Event,
  // relation rows keep their identities, and missing parents or malformed values go to `stale`.
  it('projects field-removal marks, relation identities and parent checks exactly', () => {
    const base: Revision = {
      revision: { id: '00000007-0000-4000-8000-0000000000aa', modelId: SPEC_MODEL, revisionNo: 1, state: 'published', schemaVersion: 1, sourceDocRef: { docLabel: 'D', docVersion: '1' }, version: 1, createdAt: SPEC_AT, createdBy: 'admin', contentSha256: null, publishedAt: null, publishedBy: null },
      modules: [{ id: 'm1', moduleKey: 'M', name: 'M', parentModuleId: null }],
      events: [
        { id: 'e1', moduleId: 'm1', eventKey: 'E1', name: 'E1', fields: [{ name: 'temp', type: 'float', description: 'T' }], triggerRule: null, detailDocRef: null },
        { id: 'e2', moduleId: 'm1', eventKey: 'E2', name: 'E2', fields: [], triggerRule: null, detailDocRef: null },
      ],
      relations: [{ id: 'r1', sourceEventId: 'e1', targetEventId: 'e2', predicate: 'uses', ruleRef: null }],
    };
    const change = (n: number, kind: Change['changeKind'], targetKind: Change['targetKind'], targetKey: string, body: Change['change'], needsRevalidation = false): Change =>
      ({ id: `c${n}`, modelId: SPEC_MODEL, softwareId: 'sw1', softwareLabel: '1', endsBeforeSoftwareId: null, endsBeforeLabel: null, targetKind, targetKey, changeKind: kind, change: body, note: null, basedOnRevNo: 1, evidenceRef: null, needsRevalidation, revalidationRevNo: null, retiredAt: null, retiredBy: null, retiredByChangeId: null, createdAt: SPEC_AT, createdBy: 'admin', version: 1 });
    const out = project(base, [
      change(1, 'removed', 'field', 'M/E1#temp', { before: { name: 'temp', type: 'float', description: 'T' } }, true),
      change(2, 'added', 'relation', 'M/E2#uses#M/E1', { after: { ruleRef: '§9' } }),
      change(3, 'added', 'relation', 'M/E1#uses#ZZ/NOPE', { after: {} }),
      change(4, 'added', 'event', 'ZZ/NOPE', { after: {} }),
    ]);
    const e1 = out.events.find(e => e.eventKey === 'E1')!;
    expect(e1.changed).toEqual([{ changeId: 'c1', changeKind: 'removed', targetKind: 'field', targetKey: 'M/E1#temp' }]);
    expect(e1.needsRevalidation).toBe(true);
    expect(e1.fields).toEqual([]);
    expect(out.removed).toEqual([{ changeId: 'c1', changeKind: 'removed', targetKind: 'field', targetKey: 'M/E1#temp', needsRevalidation: true }]);
    const kept = out.relations.find(r => r.predicate === 'uses' && r.sourceEventKey === 'E1')!;
    expect(kept).toMatchObject({ id: 'r1', sourceEventId: 'e1', targetEventId: 'e2', origin: 'revision', changed: [] });
    const added = out.relations.find(r => r.sourceEventKey === 'E2')!;
    expect(added).toMatchObject({ id: null, sourceEventId: 'e2', targetEventId: 'e1', ruleRef: '§9', origin: 'change' });
    expect(out.stale).toEqual(expect.arrayContaining([
      expect.objectContaining({ changeId: 'c3', reason: 'parent_missing', needsRevalidation: false }),
      expect.objectContaining({ changeId: 'c4', reason: 'malformed' }),
    ]));
  });
});
