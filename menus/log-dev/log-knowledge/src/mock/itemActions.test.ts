import { beforeEach, describe, expect, it } from 'vitest';
import { KERNEL_PERMISSIONS, groupId, type FieldError, type MenuMeta } from '@ap/contracts';
import { createMockAdapter, setRole, type AnyMockAction } from '@ap/mock-server';
import { CATALOG_MANAGE_PERMISSION, EVIDENCE_SOURCE_KINDS, ITEM_PUBLISH_PERMISSION, itemActionSpecs, itemDetailEndpoint, itemsEndpoint } from '../endpoints';
import { logKnowledgeActionsMock, logKnowledgeMock, resetCatalog, resetItems } from './index';
import { allItems, allLinks, itemById, latestRevision } from './items';
import { all } from './store';

type Row = Record<string, unknown>;
const action = (id: string): AnyMockAction => logKnowledgeActionsMock.find(a => a.spec.id === `logKnowledge.${id}`)!;
const errors = (id: string, input: Row): string[] => (action(id).validate?.(input) ?? []).map((e: FieldError) => `${e.path.join('.')}:${e.code}`);
const run = (id: string, input: Row) => {
  expect(errors(id, input)).toEqual([]);
  return action(id).handle({ input, actor: 'admin', scopeId: null }) as { data: Row; version: string };
};
const version = (id: string, input: Row) => action(id).version?.({ input, actor: 'admin', scopeId: null });

const itemId = (n: number) => `00000005-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const idOfModel = (code: string) => all('model').find(m => m.code === code)!.id;
const idOfSoftware = (code: string, model: string) => all('software').find(s => s.code === code && s.parentId === idOfModel(model))!.id;

const A100 = () => idOfModel('A-100');
const content = { typeCode: 'anomaly', title: '  새 항목  ', observation: '관찰 내용', expected: null };
const created = (over: Row = {}) => run('itemCreate', { ownerModelId: A100(), ...content, ...over });

beforeEach(() => { resetCatalog(); resetItems(); });

describe('itemCreate', () => {
  it('creates a published, not_checked, open item with revision 1, the next number and version "1"', () => {
    const before = allItems().length;
    const result = created({ evidence: [{ sourceKind: 'log_file', sourceOwner: ' MARS ', sourceRef: 'logs/a.log', sourceVersion: '  ', note: ' 메모 ' }] });
    expect(result).toMatchObject({ data: { itemNo: 31 }, version: '1' });
    const rec = itemById(result.data.id)!;
    expect(allItems()).toHaveLength(before + 1);
    expect(rec).toMatchObject({ itemNo: 31, verificationState: 'not_checked', processingState: 'open', publicationState: 'published', rowVersion: 1, ownerModelId: A100(), ownerSoftwareId: null });
    expect(rec.revisions).toHaveLength(1);
    expect(rec.revisions[0]).toMatchObject({ revisionNo: 1, title: '새 항목', observation: '관찰 내용', expected: null, analysisOpinion: null, improvement: null, changeNote: null });
    expect(rec.revisions[0]!.evidence).toEqual([{ ordinal: 1, sourceKind: 'log_file', sourceOwner: 'MARS', sourceRef: 'logs/a.log', sourceVersion: null, contentHash: null, locator: null, note: '메모' }]);
    expect(created().data.itemNo).toBe(32);
  });

  it('creates a SW-owned item', () => {
    const sw = idOfSoftware('v1.0', 'A-100');
    expect(itemById(run('itemCreate', { ownerSoftwareId: sw, ...content }).data.id)).toMatchObject({ ownerModelId: null, ownerSoftwareId: sw });
  });

  it.each<[string, Row, string[]]>([
    ['both owners', { ownerSoftwareId: '00000004-0000-4000-8000-00000000000e' }, ['owner:required_one']],
    ['no owner', { ownerModelId: undefined }, ['owner:required_one']],
    ['owner not a uuid', { ownerModelId: 'nope' }, ['ownerModelId:malformed']],
    ['unknown owner model', { ownerModelId: '00000003-0000-4000-8000-0000000000ff' }, ['ownerModelId:not_found']],
    ['a vendor id as the owner model', { ownerModelId: '00000001-0000-4000-8000-000000000001' }, ['ownerModelId:not_found']],
    ['inactive owner model', { ownerModelId: idOfModel('B-30') }, ['ownerModelId:inactive']],
    ['blank title', { title: '   ' }, ['title:required']],
    ['missing title', { title: undefined }, ['title:required']],
    ['title over 200', { title: 'a'.repeat(201) }, ['title:too_long']],
    ['title at 200', { title: 'a'.repeat(200) }, []],
    ['body over 20000', { observation: 'a'.repeat(20001) }, ['observation:too_long']],
    ['unknown type', { typeCode: 'other' }, ['typeCode:malformed']],
    ['missing type', { typeCode: undefined }, ['typeCode:required']],
    ['NUL in a body', { analysisOpinion: 'a\u0000b' }, ['analysisOpinion:malformed']],
    ['no observation and no expected', { observation: '  ', expected: null }, ['observation:required_one']],
    ['expected alone', { observation: null, expected: '기대' }, []],
    ['evidence over 20', { evidence: Array.from({ length: 21 }, () => ({ sourceKind: 'spec', sourceOwner: 'a', sourceRef: 'b' })) }, ['evidence:too_long']],
    ['evidence missing fields', { evidence: [{ sourceKind: 'bad', sourceOwner: ' ', sourceRef: undefined }] }, ['evidence.0.sourceKind:malformed', 'evidence.0.sourceOwner:required', 'evidence.0.sourceRef:required']],
    ['evidence note over 500', { evidence: [{ sourceKind: 'spec', sourceOwner: 'a', sourceRef: 'b', note: 'n'.repeat(501) }] }, ['evidence.0.note:too_long']],
  ])('%s', (_name, over, expected) => {
    expect(errors('itemCreate', { ownerModelId: A100(), ...content, ...over })).toEqual(expected);
  });

  it('an SW whose model is inactive is inactive (SW-owned)', () => {
    const b10v31 = idOfSoftware('v3.1', 'B-10'); // inactive SW of an active model
    expect(errors('itemCreate', { ownerSoftwareId: b10v31, ...content })).toEqual(['ownerSoftwareId:inactive']);
    // Make the SW active but its model inactive: the model check still refuses.
    const sw = all('software').find(s => s.id === b10v31)!;
    sw.active = true;
    all('model').find(m => m.id === sw.parentId)!.active = false;
    expect(errors('itemCreate', { ownerSoftwareId: b10v31, ...content })).toEqual(['ownerSoftwareId:inactive']);
  });
  it('an unknown SW owner is not_found', () => {
    expect(errors('itemCreate', { ownerSoftwareId: '00000004-0000-4000-8000-0000000000ff', ...content })).toEqual(['ownerSoftwareId:not_found']);
  });
});

const body = { typeCode: 'guideline', title: '고친 제목', observation: '새 관찰', expected: '새 기대', changeNote: '  보완  ' };
describe('seeded items round-trip through revise', () => {
  it('every seeded evidence kind is a declared kind', () => {
    const kinds = allItems().flatMap(rec => rec.revisions.flatMap(r => r.evidence.map(e => e.sourceKind)));
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) expect(EVIDENCE_SOURCE_KINDS as readonly string[]).toContain(kind);
  });

  it('revising each live seeded item with its latest content and evidence unchanged is valid', () => {
    const live = allItems().filter(rec => rec.publicationState === 'published');
    expect(live.length).toBeGreaterThan(0);
    for (const rec of live) {
      const r = latestRevision(rec);
      const evidence = r.evidence.map(({ ordinal: _ordinal, ...e }) => e);
      const input = { id: rec.id, typeCode: r.typeCode, title: r.title, observation: r.observation, expected: r.expected, analysisOpinion: r.analysisOpinion, improvement: r.improvement, evidence, changeNote: '그대로 다시 저장' };
      expect(errors('itemRevise', input), `KI-${rec.itemNo}`).toEqual([]);
    }
  });
});

describe('itemRevise', () => {
  it('appends revision latest + 1 with its own evidence, bumps the version, leaves the earlier revisions', () => {
    const rec = itemById(itemId(1))!;
    const beforeRevisions = JSON.stringify(rec.revisions);
    const result = run('itemRevise', { id: itemId(1), ...body, evidence: [{ sourceKind: 'spec', sourceOwner: 'Wiki', sourceRef: 'x' }] });
    expect(result).toMatchObject({ data: { id: itemId(1), itemNo: 1, revisionNo: 4 }, version: '2' });
    expect(rec.revisions).toHaveLength(4);
    expect(JSON.stringify(rec.revisions.slice(0, 3))).toBe(beforeRevisions);
    expect(latestRevision(rec)).toMatchObject({ revisionNo: 4, title: '고친 제목', changeNote: '보완', typeCode: 'guideline' });
    expect(latestRevision(rec).evidence).toHaveLength(1);
    expect(run('itemRevise', { id: itemId(1), ...body }).data).toMatchObject({ revisionNo: 5 });
    expect(latestRevision(rec).evidence).toEqual([]);
  });

  it.each<[string, Row, string[]]>([
    ['no changeNote', { changeNote: ' ' }, ['changeNote:required']],
    ['changeNote over 500', { changeNote: 'a'.repeat(501) }, ['changeNote:too_long']],
    ['id not a uuid', { id: 'x' }, ['id:malformed']],
    ['no observation and no expected', { observation: null, expected: null }, ['observation:required_one']],
    ['archived item', { id: itemId(3) }, ['id:archived']],
  ])('%s', (_name, over, expected) => {
    expect(errors('itemRevise', { id: itemId(1), ...body, ...over })).toEqual(expected);
  });

  it('a missing item has no version (not_found is the engine\'s answer) and no state error', () => {
    const missing = '00000005-0000-4000-8000-0000000000ff';
    expect(version('itemRevise', { id: missing })).toBeNull();
    expect(errors('itemRevise', { id: missing, ...body })).toEqual([]);
  });
});

describe('itemAssess', () => {
  const input = { id: itemId(2), dimension: 'verification', newState: 'verified', rationale: '  두 곳에서 재현  ' };
  it('sets the projection, appends one event (prior = current, based on the latest revision) and bumps the version', () => {
    const rec = itemById(itemId(2))!;
    const prior = rec.verificationState;
    const events = rec.assessments.length;
    expect(run('itemAssess', input)).toMatchObject({ data: { id: itemId(2), itemNo: 2 }, version: '2' });
    expect(rec.verificationState).toBe('verified');
    expect(rec.assessments).toHaveLength(events + 1);
    expect(rec.assessments.at(-1)).toMatchObject({ dimension: 'verification', priorState: prior, newState: 'verified', rationale: '두 곳에서 재현', basedOnRevisionNo: latestRevision(rec).revisionNo });
  });
  it('assesses the processing dimension', () => {
    run('itemAssess', { id: itemId(2), dimension: 'processing', newState: 'resolved', rationale: '끝' });
    expect(itemById(itemId(2))!.processingState).toBe('resolved');
  });

  it.each<[string, Row, string[]]>([
    ['a processing state for verification', { newState: 'resolved' }, ['newState:invalid_state']],
    ['a verification state for processing', { dimension: 'processing', newState: 'verified' }, ['newState:invalid_state']],
    ['unknown dimension', { dimension: 'publication' }, ['dimension:malformed']],
    ['missing newState', { newState: undefined }, ['newState:required']],
    ['no rationale', { rationale: ' ' }, ['rationale:required']],
    ['rationale over 2000', { rationale: 'a'.repeat(2001) }, ['rationale:too_long']],
    ['the state it already has', { newState: 'observed' }, ['newState:unchanged']],
    ['an archived item', { id: itemId(3) }, ['id:archived']],
  ])('%s', (_name, over, expected) => {
    expect(errors('itemAssess', { ...input, ...over })).toEqual(expected);
  });
  it('nothing changes after a refusal', () => {
    const rec = itemById(itemId(2))!;
    expect(errors('itemAssess', { ...input, newState: 'observed' })).toEqual(['newState:unchanged']);
    expect(rec.rowVersion).toBe(1);
  });
});

describe('itemDerive', () => {
  const input = () => ({ sourceItemId: itemId(1), sourceRevisionNo: 2, ownerSoftwareId: idOfSoftware('v1.0', 'A-100'), typeCode: 'needs_check', title: '파생 항목', observation: '관찰' });
  it('creates a not_checked, open item at version "1" with no evidence and a derived_from link pinned to the source revision', () => {
    const links = allLinks().length;
    const result = run('itemDerive', input());
    expect(result).toMatchObject({ data: { itemNo: 31 }, version: '1' });
    const rec = itemById(result.data.id)!;
    expect(rec).toMatchObject({ verificationState: 'not_checked', processingState: 'open', ownerSoftwareId: idOfSoftware('v1.0', 'A-100') });
    expect(rec.revisions[0]!.evidence).toEqual([]);
    expect(allLinks()).toHaveLength(links + 1);
    expect(allLinks().at(-1)).toEqual({ kind: 'derived_from', sourceItemId: rec.id, targetItemId: itemId(1), sourceRevisionNo: 2 });
    expect(run('itemDerive', input()).data.itemNo).toBe(32);
  });
  it.each<[string, Row, string[]]>([
    ['unknown source item', { sourceItemId: '00000005-0000-4000-8000-0000000000ff' }, ['sourceItemId:not_found']],
    ['unknown source revision', { sourceRevisionNo: 9 }, ['sourceRevisionNo:not_found']],
    ['revision 0', { sourceRevisionNo: 0 }, ['sourceRevisionNo:malformed']],
    ['revision 1.5', { sourceRevisionNo: 1.5 }, ['sourceRevisionNo:malformed']],
    ['revision as text', { sourceRevisionNo: '2' }, ['sourceRevisionNo:required']],
    ['both owners', { ownerModelId: A100() }, ['owner:required_one']],
    ['inactive SW owner', { ownerSoftwareId: idOfSoftware('v3.1', 'B-10') }, ['ownerSoftwareId:inactive']],
    ['unknown source and inactive owner together', { sourceItemId: '00000005-0000-4000-8000-0000000000ff', ownerSoftwareId: idOfSoftware('v3.1', 'B-10') }, ['sourceItemId:not_found', 'ownerSoftwareId:inactive']],
    ['no body text', { observation: '', expected: undefined }, ['observation:required_one']],
  ])('%s', (_name, over, expected) => {
    expect(errors('itemDerive', { ...input(), ...over })).toEqual(expected);
  });
});

describe('itemSetArchived', () => {
  it('archives and restores, bumping the version each time', () => {
    const rec = itemById(itemId(2))!;
    expect(run('itemSetArchived', { id: itemId(2), archived: true })).toMatchObject({ data: { id: itemId(2), itemNo: 2 }, version: '2' });
    expect(rec.publicationState).toBe('archived');
    expect(run('itemSetArchived', { id: itemId(2), archived: false }).version).toBe('3');
    expect(rec.publicationState).toBe('published');
  });
  it('to the value it already has changes nothing and answers the current version', () => {
    const rec = itemById(itemId(3))!; // archived in the seed
    const updatedAt = rec.updatedAt;
    expect(run('itemSetArchived', { id: itemId(3), archived: true }).version).toBe('1');
    expect(rec).toMatchObject({ rowVersion: 1, updatedAt });
  });
  it.each<[string, Row, string[]]>([
    ['archived not a boolean', { archived: 'yes' }, ['archived:required']],
    ['id not a uuid', { id: 'x' }, ['id:malformed']],
  ])('%s', (_name, over, expected) => {
    expect(errors('itemSetArchived', { id: itemId(2), archived: true, ...over })).toEqual(expected);
  });
});

describe('registration with the mock adapter', () => {
  const menu = (id: string, permission: string) =>
    ({
      id, group: groupId('logKnowledge'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path: `/${id}`, permission, requiresScope: false,
      context: {}, pageType: 'management', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [],
    }) as unknown as MenuMeta;
  const adapter = () => createMockAdapter({
    endpoints: logKnowledgeMock, actions: logKnowledgeActionsMock,
    registry: { menus: [menu('log-knowledge-catalog', CATALOG_MANAGE_PERMISSION), menu('log-knowledge-models', 'platform:view'), menu('log-knowledge-items', 'platform:view'), menu('home', 'platform:view')] },
    permissions: [...KERNEL_PERMISSIONS, CATALOG_MANAGE_PERMISSION, ITEM_PUBLISH_PERMISSION],
  });
  let keySeq = 0;
  const key = () => `3f2b8a40-6c1e-4d5a-9b7e-${(++keySeq).toString(16).padStart(12, '0')}`;
  const send = (a: ReturnType<typeof adapter>, name: string, input: Row, expectedVersion?: string) =>
    a.menuAction({ action: `logKnowledge.${name}`, context: {}, input, idempotencyKey: key(), ...(expectedVersion === undefined ? {} : { expectedVersion }) });

  it('registers the five item writes with the publish permission, invalidating the items menu reads', () => {
    expect(() => adapter()).not.toThrow();
    const specs = logKnowledgeActionsMock.filter(a => a.spec.id.startsWith('logKnowledge.item')).map(a => a.spec);
    expect(specs).toEqual([...itemActionSpecs]);
    expect(specs.map(s => s.id)).toEqual(['itemCreate', 'itemRevise', 'itemAssess', 'itemDerive', 'itemSetArchived'].map(n => `logKnowledge.${n}`));
    for (const spec of specs) {
      expect(spec).toMatchObject({ menuId: 'log-knowledge-items', permission: 'knowledge:item-publish', requiresScope: false });
      expect(spec.invalidates).toEqual([itemsEndpoint, itemDetailEndpoint]);
    }
    expect(specs.map(s => s.concurrency)).toEqual(['none', 'version', 'version', 'none', 'version']);
  });

  it('an admin publishes; an engineer and a viewer are forbidden and nothing is written', async () => {
    const a = adapter();
    const before = allItems().length;
    const input = { ownerModelId: A100(), ...content };
    setRole('viewer');
    expect((await send(a, 'itemCreate', input)).outcome).toBe('forbidden');
    setRole('engineer');
    expect((await send(a, 'itemCreate', input)).outcome).toBe('forbidden');
    expect(allItems()).toHaveLength(before);
    setRole('admin');
    expect(await send(a, 'itemCreate', input)).toMatchObject({ outcome: 'ok', version: '1', data: { itemNo: 31 } });
    expect(allItems()).toHaveLength(before + 1);
    setRole('engineer');
  });

  it('a stale version answers conflict, a missing item not_found, a matching version applies', async () => {
    const a = adapter();
    setRole('admin');
    const input = { id: itemId(2), dimension: 'verification', newState: 'verified', rationale: '근거' };
    expect((await send(a, 'itemAssess', input, '7')).outcome).toBe('conflict');
    expect((await send(a, 'itemAssess', { ...input, id: '00000005-0000-4000-8000-0000000000ff' }, '1')).outcome).toBe('not_found');
    expect(await send(a, 'itemAssess', input, '1')).toMatchObject({ outcome: 'ok', version: '2' });
    setRole('engineer');
  });

  it('accepted difference from the server: a stale version on an archived item answers invalid (the server: conflict)', async () => {
    const a = adapter();
    setRole('admin');
    const result = await send(a, 'itemRevise', { id: itemId(3), ...body }, '9');
    expect(result.outcome).toBe('invalid');
    expect(result.fieldErrors).toEqual([{ path: ['id'], code: 'archived' }]);
    // The same stale version on a live item is a conflict: only the state-dependent refusals move ahead of it.
    expect((await send(a, 'itemRevise', { id: itemId(2), ...body }, '9')).outcome).toBe('conflict');
    setRole('engineer');
  });
});
