import { describe, expect, it } from 'vitest';
import type { ItemSubject } from '../../endpoints';
import type { Spec } from '../spec/specModel';
import {
  SUBJECT_LIMIT, SUBJECT_RELATION_LABEL, SUBJECT_STATE_LABEL, addPick, buildPickerTree, picksOf, removePick, searchPickerTree, setPickRelation, subjectChips, subjectFilter,
  subjectLink, subjectsPayload, targetBodyOf, toSubjectInputs,
} from './subjectModel';

const spec = { revision: { id: 'r', modelId: 'm', revisionNo: 1, state: 'published', schemaVersion: 1, sourceDocRef: { docLabel: 'd', docVersion: '1' }, contentSha256: null, publishedAt: null, publishedBy: null },
  modules: [{ id: 'm1', moduleKey: 'ROBOT', name: 'Robot', parentModuleId: null }, { id: 'm2', moduleKey: 'ARM', name: 'Arm', parentModuleId: 'm1' }, { id: 'm3', moduleKey: 'CHAMBER', name: 'Chamber', parentModuleId: null }],
  events: [{ id: 'e1', moduleId: 'm2', eventKey: 'STOP', name: 'Stop', fields: [], triggerRule: null, detailDocRef: null }, { id: 'e2', moduleId: 'm3', eventKey: 'START', name: 'Start', fields: [], triggerRule: null, detailDocRef: null }, { id: 'e3', moduleId: 'm3', eventKey: 'A/B', name: 'Slash', fields: [], triggerRule: null, detailDocRef: null }],
  relations: [] } as unknown as Spec;
const subject = (patch: Partial<ItemSubject> = {}): ItemSubject => ({ modelId: 'm', modelName: 'Alpha', targetKind: 'event', targetKey: 'CHAMBER/START', subjectRelation: 'about', specRevNoAtLink: 1, state: 'resolved', targetName: 'Start', ...patch });

describe('words and chips', () => {
  it('uses the agreed Korean labels', () => {
    expect(SUBJECT_RELATION_LABEL.about.ko).toBe('직접 다루는 대상');
    expect(SUBJECT_RELATION_LABEL.context.ko).toBe('배경');
    expect([SUBJECT_STATE_LABEL.resolved.ko, SUBJECT_STATE_LABEL.gone.ko, SUBJECT_STATE_LABEL.no_spec.ko]).toEqual(['연결됨', '대상 사라짐', '명세 없음']);
  });
  it('links only a resolved subject to the spec detail: tab=spec&event=<key> (a module: module=<key>)', () => {
    expect(subjectLink(subject())).toEqual({ menuId: 'log-knowledge-spec', params: { modelId: 'm' }, page: { tab: 'spec', event: 'CHAMBER/START' } });
    expect(subjectLink(subject({ targetKind: 'module', targetKey: 'ROBOT' }))!.page).toEqual({ tab: 'spec', module: 'ROBOT' });
    expect(subjectLink(subject({ state: 'gone' }))).toBeNull();
    expect(subjectLink(subject({ state: 'no_spec' }))).toBeNull();
  });
  it('builds chips: name or key, tone per state, about before background', () => {
    const chips = subjectChips([subject({ subjectRelation: 'context', targetKey: 'Z' }), subject({ state: 'gone', targetName: null, targetKey: 'GONE' }), subject({ state: 'no_spec', targetName: null, targetKey: 'NOSPEC' })]);
    expect(chips.map(c => [c.label, c.tone, c.stateKey])).toEqual([['GONE', 'warning', 'gone'], ['NOSPEC', 'neutral', 'no_spec'], ['Start', 'success', 'resolved']]);
    expect(subjectChips(undefined)).toEqual([]);
  });
  it('the list filter is one escaped key', () => expect(subjectFilter('A%2FB/C')).toEqual({ id: 'subject', op: 'in', value: ['A%2FB/C'] }));
});

describe('picker', () => {
  it('builds the module tree with events under their module and keys the server accepts', () => {
    const tree = buildPickerTree(spec);
    expect(tree.map(n => n.key)).toEqual(['ROBOT', 'CHAMBER']);
    expect(tree[0]!.children.map(n => [n.kind, n.key, n.path])).toEqual([['module', 'ARM', ['Robot', 'Arm']]]);
    expect(tree[0]!.children[0]!.children.map(n => n.key)).toEqual(['ARM/STOP']);
    expect(tree[1]!.children.map(n => n.key)).toEqual(['CHAMBER/START', 'CHAMBER/A%2FB']);
    expect(buildPickerTree(null)).toEqual([]);
  });
  it('searches by name or key and keeps ancestors, unmatched', () => {
    const found = searchPickerTree(buildPickerTree(spec), 'stop');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ key: 'ROBOT', matched: false });
    expect(found[0]!.children[0]!.children[0]).toMatchObject({ key: 'ARM/STOP', matched: true });
    expect(searchPickerTree(buildPickerTree(spec), 'chamber/st')[0]!.children.map(n => n.key)).toEqual(['CHAMBER/START']);
    expect(searchPickerTree(buildPickerTree(spec), 'zzz')).toEqual([]);
    expect(searchPickerTree(buildPickerTree(spec), '  ')).toHaveLength(2);
  });
  it('caps the picks at 20 and refuses a duplicate', () => {
    let picks: ReturnType<typeof picksOf> = [];
    for (let i = 0; i < SUBJECT_LIMIT; i++) picks = addPick(picks, { kind: 'module', key: `M${i}`, relation: 'about' }).picks;
    expect(picks).toHaveLength(20);
    expect(addPick(picks, { kind: 'module', key: 'M99', relation: 'about' })).toMatchObject({ error: 'too_many', picks });
    expect(addPick(picks, { kind: 'module', key: 'M3', relation: 'about' }).error).toBe('duplicate');
    const fewer = removePick(picks, 'module|M0');
    expect(fewer).toHaveLength(19);
    expect(addPick(fewer, buildPickerTree(spec)[0]!).picks).toHaveLength(20);
  });
  it('changes a relation and builds write inputs from escaped keys', () => {
    const picks = setPickRelation(addPick(addPick([], { kind: 'event', key: 'CHAMBER/A%2FB', relation: 'about' }).picks, { kind: 'module', key: 'ROBOT', relation: 'about' }).picks, 'module|ROBOT', 'context');
    expect(toSubjectInputs('m', picks)).toEqual([
      { modelId: 'm', targetKind: 'event', target: { module: 'CHAMBER', event: 'A/B' }, relation: 'about' },
      { modelId: 'm', targetKind: 'module', target: { module: 'ROBOT' }, relation: 'context' }]);
    expect(targetBodyOf('module', 'A%25B')).toEqual({ module: 'A%B' });
  });
});

describe('revise payload', () => {
  const initial = [subject(), subject({ state: 'gone', targetKey: 'GONE', targetName: null })];
  it('does not send unchanged subjects (the server carries them, gone ones included)', () => {
    expect(subjectsPayload('m', initial, picksOf(initial))).toEqual({ send: false });
    expect(subjectsPayload('m', undefined, [])).toEqual({ send: false });
  });
  it('sends a changed list and flags a kept gone subject, which the server would refuse', () => {
    const picks = addPick(picksOf(initial), { kind: 'module', key: 'ROBOT', relation: 'about' }).picks;
    const out = subjectsPayload('m', initial, picks);
    expect(out).toMatchObject({ send: true, blocked: [{ targetKey: 'GONE' }] });
    const cleaned = subjectsPayload('m', initial, removePick(picks, 'event|GONE'));
    expect(cleaned).toMatchObject({ send: true, blocked: [] });
    expect(subjectsPayload('m', initial, picksOf(initial).map(p => ({ ...p, relation: 'context' as const })))).toMatchObject({ send: true });
    expect(subjectsPayload('m', initial, [])).toMatchObject({ send: true, subjects: [], blocked: [] });
  });
});
