import { describe, expect, it } from 'vitest';

import { type EffectiveChange, type SpecBaseContent, applySpecChanges, maskChangeMarks } from '../domain/spec-effective.js';

const fld = (name: string, extra: Record<string, unknown> = {}) => ({ name, type: 'int', description: name, ...extra });
const BASE: SpecBaseContent = {
  modules: [
    { id: 'm1', moduleKey: 'spindle', name: 'Spindle', parentModuleId: null },
    { id: 'm2', moduleKey: 'motor', name: 'Motor', parentModuleId: 'm1' },
  ],
  events: [
    { id: 'e1', moduleId: 'm1', eventKey: 'start', name: 'Start', fields: [fld('speed'), fld('torque')], triggerRule: 'on start', detailDocRef: null },
    { id: 'e2', moduleId: 'm2', eventKey: 'run', name: 'Run', fields: [], triggerRule: null, detailDocRef: null },
  ],
  relations: [{ id: 'r1', sourceEventId: 'e1', predicate: 'precedes', targetEventId: 'e2', ruleRef: null }],
};
let n = 0;
const ch = (targetKind: EffectiveChange['targetKind'], targetKey: string, changeKind: EffectiveChange['changeKind'], change: Record<string, unknown>, needsRevalidation = false): EffectiveChange => ({
  id: `c${++n}`, targetKind, targetKey, changeKind, change, needsRevalidation,
});

describe('applySpecChanges (#1196 c)', () => {
  it('no change is the revision content, every entry unmarked', () => {
    const out = applySpecChanges(BASE, []);
    expect(out.modules.map((m) => [m.id, m.origin, m.changed.length])).toEqual([['m1', 'revision', 0], ['m2', 'revision', 0]]);
    expect(out.events.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(out.relations.map((r) => r.id)).toEqual(['r1']);
    expect(out.stale).toEqual([]);
    expect(out.removed).toEqual([]);
  });

  it('added module / event / field / relation create entries with origin change and no id', () => {
    const out = applySpecChanges(BASE, [
      ch('module', 'axis', 'added', { after: { name: 'Axis', parentModule: 'spindle' } }),
      ch('event', 'axis/home', 'added', { after: { name: 'Home', triggerRule: null, detailDocRef: null } }),
      ch('field', 'axis/home#pos', 'added', { after: fld('pos') }),
      ch('relation', 'spindle/start#then#axis/home', 'added', { after: { ruleRef: 'sec 2' } }),
    ]);
    expect(out.modules.find((m) => m.moduleKey === 'axis')).toMatchObject({ id: null, origin: 'change', parentModuleKey: 'spindle', name: 'Axis' });
    expect(out.events.find((e) => e.eventKey === 'home')).toMatchObject({ id: null, origin: 'change', fields: [fld('pos')] });
    expect(out.relations.find((r) => r.predicate === 'then')).toMatchObject({ id: null, origin: 'change', ruleRef: 'sec 2', sourceEventId: 'e1' });
    expect(out.stale).toEqual([]);
  });

  it('composes two added changes of one field key by field identity, marks preserved', () => {
    // Two `added` ranges for an absent field can overlap after a reorder; both apply, one keyed field wins.
    const first = ch('field', 'spindle/start#temp', 'added', { after: fld('temp', { unit: 'a' }) });
    const second = ch('field', 'spindle/start#temp', 'added', { after: fld('temp', { unit: 'b' }) });
    const out = applySpecChanges(BASE, [first, second]);
    const start = out.events.find((e) => e.eventKey === 'start');
    expect(start?.fields).toEqual([fld('speed'), fld('torque'), fld('temp', { unit: 'b' })]);
    expect(start?.changed.map((m) => m.changeId)).toEqual([first.id, second.id]);
    expect(out.stale).toEqual([]);
  });

  it('removed entries disappear and are listed; a removed field leaves its event marked', () => {
    const out = applySpecChanges(BASE, [
      ch('relation', 'spindle/start#precedes#motor/run', 'removed', { before: { ruleRef: null } }),
      ch('field', 'spindle/start#torque', 'removed', { before: fld('torque') }),
      ch('event', 'motor/run', 'removed', { before: { name: 'Run', triggerRule: null, detailDocRef: null } }),
    ]);
    expect(out.relations).toEqual([]);
    expect(out.events.map((e) => e.eventKey)).toEqual(['start']);
    expect(out.events[0]?.fields).toEqual([fld('speed')]);
    expect(out.events[0]?.changed).toHaveLength(1);
    expect(out.removed.map((r) => r.targetKind)).toEqual(['relation', 'field', 'event']);
  });

  it('changed applies after when before matches, per target kind', () => {
    const out = applySpecChanges(BASE, [
      ch('module', 'motor', 'changed', { before: { name: 'Motor', parentModule: 'spindle' }, after: { name: 'Main motor', parentModule: null } }, true),
      ch('event', 'spindle/start', 'changed', { before: { name: 'Start', triggerRule: 'on start', detailDocRef: null }, after: { name: 'Start', triggerRule: 'on press', detailDocRef: 'sec 3' } }),
      ch('field', 'spindle/start#speed', 'changed', { before: fld('speed'), after: fld('speed', { unit: 'rpm' }) }),
      ch('relation', 'spindle/start#precedes#motor/run', 'changed', { before: { ruleRef: null }, after: { ruleRef: 'sec 9' } }),
    ]);
    expect(out.modules[1]).toMatchObject({ name: 'Main motor', parentModuleKey: null, needsRevalidation: true });
    expect(out.events[0]).toMatchObject({ triggerRule: 'on press', detailDocRef: 'sec 3' });
    expect((out.events[0]?.fields as unknown[])[0]).toEqual(fld('speed', { unit: 'rpm' }));
    expect(out.relations[0]?.ruleRef).toBe('sec 9');
    expect(out.stale).toEqual([]);
  });

  it('behavior marks the entry and leaves its content', () => {
    const out = applySpecChanges(BASE, [ch('event', 'motor/run', 'behavior', {})]);
    expect(out.events[1]).toMatchObject({ name: 'Run', changed: [{ changeKind: 'behavior', targetKey: 'motor/run' }] });
  });

  it.each([
    ['changed whose before differs', ch('event', 'spindle/start', 'changed', { before: { name: 'Other', triggerRule: null, detailDocRef: null }, after: { name: 'X', triggerRule: null, detailDocRef: null } }), 'before_mismatch'],
    ['changed field whose before differs', ch('field', 'spindle/start#speed', 'changed', { before: fld('speed', { unit: 'x' }), after: fld('speed') }), 'before_mismatch'],
    ['changed whose key is gone', ch('module', 'nope', 'changed', { before: { name: 'a', parentModule: null }, after: { name: 'b', parentModule: null } }), 'gone'],
    ['removed whose key is gone', ch('event', 'motor/stop', 'removed', { before: { name: 'Stop', triggerRule: null, detailDocRef: null } }), 'gone'],
    ['behavior whose key is gone', ch('field', 'spindle/start#angle', 'behavior', {}), 'gone'],
    ['added whose key exists', ch('module', 'spindle', 'added', { after: { name: 'Spindle', parentModule: null } }), 'exists'],
    ['added field that exists', ch('field', 'spindle/start#speed', 'added', { after: fld('speed') }), 'exists'],
    ['added event without its module', ch('event', 'ghost/go', 'added', { after: { name: 'Go', triggerRule: null, detailDocRef: null } }), 'parent_missing'],
    ['added relation without an event', ch('relation', 'spindle/start#x#motor/stop', 'added', { after: { ruleRef: null } }), 'parent_missing'],
    ['a key that does not parse for its kind', ch('event', 'just-a-module', 'behavior', {}), 'malformed'],
  ] as const)('%s is reported stale and not applied', (_n, change, reason) => {
    const out = applySpecChanges(BASE, [change]);
    expect(out.stale).toEqual([expect.objectContaining({ changeId: change.id, reason })]);
    expect(out.modules).toHaveLength(2);
    expect(out.events.every((e) => e.changed.length === 0)).toBe(true);
  });

  it('applies in the given order: a later change on another key still applies after a stale one', () => {
    const out = applySpecChanges(BASE, [ch('module', 'spindle', 'added', { after: { name: 'S', parentModule: null } }), ch('event', 'motor/run', 'behavior', {})]);
    expect(out.stale).toHaveLength(1);
    expect(out.events[1]?.changed).toHaveLength(1);
  });

  it('carries needsRevalidation to the touched entry and the stale report', () => {
    const out = applySpecChanges(BASE, [
      ch('event', 'motor/run', 'behavior', {}, true),
      ch('event', 'motor/gone', 'behavior', {}, true),
    ]);
    expect(out.events[1]?.needsRevalidation).toBe(true);
    expect(out.events[0]?.needsRevalidation).toBe(false);
    expect(out.stale[0]?.needsRevalidation).toBe(true);
  });
});

describe('maskChangeMarks (#1880)', () => {
  it('drops the marks, stale and removed reports of hidden changes, keeps their values and recomputes needsRevalidation', () => {
    const hiddenChange = ch('event', 'spindle/start', 'changed', { before: { name: 'Start', triggerRule: 'on start', detailDocRef: null }, after: { name: 'Start', triggerRule: 'on stop', detailDocRef: null } }, true);
    const hiddenStale = ch('event', 'motor/gone', 'behavior', {}, true);
    const hiddenRemoved = ch('relation', 'spindle/start#precedes#motor/run', 'removed', { before: { ruleRef: null } });
    const visible = ch('event', 'spindle/start', 'behavior', {});
    const changes = [hiddenChange, hiddenStale, hiddenRemoved, visible];
    const full = applySpecChanges(BASE, changes);
    const out = maskChangeMarks(full, changes, new Set([hiddenChange.id, hiddenStale.id, hiddenRemoved.id]));
    expect(JSON.stringify(out)).not.toMatch(new RegExp(`"(${hiddenChange.id}|${hiddenStale.id}|${hiddenRemoved.id})"`));
    expect(out.events[0]).toMatchObject({ triggerRule: 'on stop', changed: [expect.objectContaining({ changeId: visible.id })], needsRevalidation: false });
    expect(out.relations).toEqual([]);
    expect(out.stale).toEqual([]);
    expect(out.removed).toEqual([]);
    expect(maskChangeMarks(full, changes, new Set())).toBe(full);
  });
});
