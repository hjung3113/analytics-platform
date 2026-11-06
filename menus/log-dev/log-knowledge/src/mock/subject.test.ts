import { beforeEach, describe, expect, it } from 'vitest';
import { MockActionInvalid } from '@ap/mock-server';
import { emptyGlobal } from '@ap/contracts';
import { logKnowledgeActionsMock, logKnowledgeMock, resetCatalog, resetItems } from './index';
import { resetConcepts } from './conceptStore';
import { resetSpecs, SPEC_MODEL, pairModelId } from './specStore';

const A = SPEC_MODEL, item = (n: number) => `00000005-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const read = (id: string, params: Record<string, unknown>) => {
  const e = logKnowledgeMock.find(x => x.spec.id === `logKnowledge.${id}`)!;
  const message = e.validate?.({ context: emptyGlobal, params } as never);
  if (message) throw new Error(`refused: ${message}`);
  return e.handle({ equipment: [], context: emptyGlobal, params, actor: 'admin' } as never) as any;
};
const refusal = (id: string, params: Record<string, unknown>) => logKnowledgeMock.find(x => x.spec.id === `logKnowledge.${id}`)!.validate?.({ context: emptyGlobal, params } as never) ?? null;
const action = (id: string) => logKnowledgeActionsMock.find(a => a.spec.id === `logKnowledge.${id}`)!;
const shape = (id: string, input: Record<string, unknown>) => (action(id).validate?.(input) ?? []).map((e: any) => `${e.path.join('.')}:${e.code}`);
const write = (id: string, input: Record<string, unknown>) => {
  expect(shape(id, input)).toEqual([]);
  try { return { result: action(id).handle({ input, actor: 'admin', scopeId: null }) as any }; }
  catch (e) { if (e instanceof MockActionInvalid) return { invalid: e.fieldErrors.map(x => `${x.path.join('.')}:${x.code}`) }; throw e; }
};
const content = { typeCode: 'anomaly', title: '대상 연결', observation: '관찰', expected: '기대' };
const subjectsOf = (n: number, revisionNo?: number) => read('itemDetail', { itemId: item(n), ...(revisionNo ? { revisionNo } : {}) }).subjects as any[];
beforeEach(() => { resetCatalog(); resetSpecs(); resetConcepts(); resetItems(); });

describe('itemDetail.subjects', () => {
  it('resolves every state against the current published spec', () => {
    expect(subjectsOf(1).map(s => [s.targetKey, s.subjectRelation, s.state, s.targetName])).toEqual([
      ['CHAMBER/START', 'about', 'resolved', 'Start'], ['ROBOT/GHOST', 'about', 'gone', null], ['ROBOT', 'context', 'resolved', 'Robot']]); // the server's order: model, kind, key
    expect(subjectsOf(2)).toMatchObject([{ state: 'no_spec', specRevNoAtLink: null, modelName: 'Alpha 200' }]);
    expect(subjectsOf(11).map(s => [s.targetKey, s.state, s.specRevNoAtLink])).toEqual([['CHAMBER/START', 'resolved', 2], ['ROBOT/CALIBRATE', 'gone', 1]]);
    expect(subjectsOf(5)).toMatchObject([{ targetKind: 'module', state: 'resolved', modelId: A }]); // SW-owned: the SW's model
    expect(subjectsOf(4)).toEqual([]);
  });
  it('reads the subjects of the shown revision', () => {
    expect(subjectsOf(1, 1)).toHaveLength(1);
    expect(subjectsOf(1, 3)).toHaveLength(3);
  });
});

describe('items filter subject', () => {
  const list = (key: string, extra: Record<string, unknown>[] = []) => read('items', { q: null, page: 0, pageSize: 50, sorting: [], filters: [{ id: 'subject', op: 'in', value: [key] }, ...extra] });
  it('finds the items whose latest revision names the key; the owner model scopes it', () => {
    expect(list('CHAMBER/START').rows.map((r: any) => r.itemNo).sort((a: number, b: number) => a - b)).toEqual([1, 2, 9, 11]); // item 3 (archived) is not listed
    expect(list('CHAMBER/START', [{ id: 'ownerModelId', op: 'in', value: [pairModelId()] }]).rows.map((r: any) => r.itemNo)).toEqual([11]);
    expect(list('NOPE/NOPE').total).toBe(0);
  });
  it.each([[{ id: 'subject', op: 'in', value: [] }], [{ id: 'subject', op: 'in', value: ['   '] }], [{ id: 'subject', op: 'in', value: ['a', 'b'] }], [{ id: 'subject', op: 'notIn', value: ['a'] }]])('refuses %j', filter =>
    expect(refusal('items', { q: null, page: 0, pageSize: 10, sorting: [], filters: [filter] })).toEqual(expect.any(String)));
});

describe('specSubjectItems', () => {
  it('lists published items about the target with the relation; an archived item is not listed', () => {
    const rows = read('specSubjectItems', { modelId: A, targetKey: 'CHAMBER/START' }).rows as any[];
    expect(rows.map(r => [r.itemNo, r.subjectRelation]).sort((x, y) => x[0] - y[0])).toEqual([[1, 'about'], [9, 'context']]);
    expect(read('specSubjectItems', { modelId: pairModelId(), targetKey: 'CHAMBER/START' }).rows.map((r: any) => r.itemNo)).toEqual([11]); // item 3 is archived
    expect(read('specSubjectItems', { modelId: A, targetKey: 'NOPE' })).toEqual({ rows: [], total: 0 });
  });
  it.each([[{ modelId: 'x', targetKey: 'a' }], [{ modelId: A, targetKey: ' ' }], [{ modelId: A, targetKey: 'x'.repeat(1201) }], [{ modelId: A, targetKey: 'a', pageSize: 0 }]])('refuses %j', p =>
    expect(refusal('specSubjectItems', p)).toEqual(expect.any(String)));
});

describe('itemCreate / itemRevise with subjects[]', () => {
  const owner = { ownerModelId: A };
  const event = (name: string, extra = {}) => ({ modelId: A, targetKind: 'event', target: { module: 'Chamber', event: name }, ...extra });
  it('create links resolved subjects with the current spec revision; relation defaults to about', () => {
    const created = write('itemCreate', { ...owner, ...content, subjects: [event('Start'), { modelId: A, targetKind: 'module', target: { module: 'robot' }, relation: 'context' }] });
    expect(subjectsOf(created.result.data.itemNo).map(s => [s.targetKey, s.subjectRelation, s.specRevNoAtLink])).toEqual([['CHAMBER/START', 'about', 1], ['ROBOT', 'context', 1]]);
  });
  it('a model without a published spec accepts any well-formed key and reads it back as no_spec', () => {
    const created = write('itemCreate', { ownerModelId: '00000003-0000-4000-8000-00000000000b', ...content, subjects: [{ modelId: '00000003-0000-4000-8000-00000000000b', targetKind: 'event', target: { module: 'x', event: 'y' } }] });
    expect(subjectsOf(created.result.data.itemNo)).toMatchObject([{ state: 'no_spec', specRevNoAtLink: null }]);
  });
  it('state refusals are per subject: model_mismatch and not_found; nothing is written', () => {
    const n = read('items', { q: null, page: 0, pageSize: 1, sorting: [], filters: [] }).total;
    expect(write('itemCreate', { ...owner, ...content, subjects: [event('Start'), event('Nope'), { ...event('Start'), modelId: pairModelId() }] })).toEqual({ invalid: ['subjects.1.targetKey:not_found', 'subjects.2.modelId:model_mismatch'] });
    expect(read('items', { q: null, page: 0, pageSize: 1, sorting: [], filters: [] }).total).toBe(n);
  });
  it('a SW-owned create uses the SW version\'s model', () => {
    const sw = read('itemDetail', { itemId: item(5) }).item.owner.softwareId;
    expect(write('itemCreate', { ownerSoftwareId: sw, ...content, subjects: [event('Start')] }).result.data.itemNo).toBeGreaterThan(30);
  });
  it.each([
    ['not a list', { subjects: 'x' }, ['subjects:malformed']],
    ['over 20', { subjects: Array.from({ length: 21 }, (_, i) => event(`E${i}`)) }, ['subjects:too_long']],
    ['duplicate', { subjects: [event('Start'), event('start')] }, ['subjects.1:duplicate']],
    ['entry not an object', { subjects: [3] }, ['subjects.0:malformed']],
    ['bad model', { subjects: [{ ...event('Start'), modelId: 'x' }] }, ['subjects.0.modelId:malformed']],
    ['missing kind', { subjects: [{ modelId: A, target: { module: 'x' } }] }, ['subjects.0.targetKind:required']],
    ['bad relation', { subjects: [event('Start', { relation: 'primary' })] }, ['subjects.0.relation:malformed']],
  ])('value error: %s', (_n, extra, expected) => expect(shape('itemCreate', { ...owner, ...content, ...extra })).toEqual(expected));
  it('20 subjects are accepted', () => {
    const modules = Array.from({ length: 20 }, (_, i) => ({ modelId: '00000003-0000-4000-8000-00000000000b', targetKind: 'module', target: { module: `M${i}` } }));
    expect(write('itemCreate', { ownerModelId: '00000003-0000-4000-8000-00000000000b', ...content, subjects: modules }).result).toBeTruthy();
  });
  it('revise without subjects carries the previous links (link-time revision included); a list replaces them; an empty list clears', () => {
    const revise = (extra: Record<string, unknown>) => write('itemRevise', { id: item(11), ...content, title: '보완', changeNote: '보완', ...extra });
    revise({});
    expect(subjectsOf(11).map(s => [s.targetKey, s.state, s.specRevNoAtLink])).toEqual([['CHAMBER/START', 'resolved', 2], ['ROBOT/CALIBRATE', 'gone', 1]]);
    expect(subjectsOf(11, 1)).toHaveLength(2);
    revise({ subjects: [{ modelId: pairModelId(), targetKind: 'event', target: { module: 'Robot', event: 'Move' }, relation: 'context' }] });
    expect(subjectsOf(11).map(s => [s.targetKey, s.subjectRelation])).toEqual([['ROBOT/MOVE', 'context']]);
    expect(subjectsOf(11, 2)).toHaveLength(2); // earlier revisions keep theirs
    revise({ subjects: [] });
    expect(subjectsOf(11)).toEqual([]);
  });
  it('revise judges the list against the item\'s owner model, and a gone key is refused', () => {
    const out = write('itemRevise', { id: item(11), ...content, changeNote: 'x', subjects: [event('Start'), { modelId: pairModelId(), targetKind: 'event', target: { module: 'Robot', event: 'Calibrate' } }] });
    expect(out).toEqual({ invalid: ['subjects.0.modelId:model_mismatch', 'subjects.1.targetKey:not_found'] });
    expect(subjectsOf(11)).toHaveLength(2);
  });
});
