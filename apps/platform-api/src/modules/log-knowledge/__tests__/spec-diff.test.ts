import { describe, expect, it } from 'vitest';

import { type SpecRows, touchedTargetKeys } from '../domain/spec-diff.js';

const f = (name: string, extra: Record<string, unknown> = {}) => ({ name, type: 'int', description: name, ...extra });
const base = (): SpecRows => ({
  modules: [
    { key: 'spindle', name: 'Spindle', parentKey: null },
    { key: 'motor', name: 'Motor', parentKey: 'spindle' },
  ],
  events: [
    { moduleKey: 'spindle', key: 'start', name: 'Start', fields: [f('speed'), f('torque')], triggerRule: null, detailDocRef: null },
    { moduleKey: 'motor', key: 'run', name: 'Run', fields: [], triggerRule: 'on', detailDocRef: null },
  ],
  relations: [{ sourceModule: 'spindle', sourceEvent: 'start', predicate: 'precedes', targetModule: 'motor', targetEvent: 'run', ruleRef: null }],
});
const clone = (r: SpecRows): SpecRows => JSON.parse(JSON.stringify(r)) as SpecRows;
const keys = (a: SpecRows, b: SpecRows) => [...touchedTargetKeys(a, b)].sort();

describe('touchedTargetKeys (#1196 c)', () => {
  it('identical content touches nothing, whatever the row order', () => {
    const b = clone(base());
    b.modules.reverse();
    b.events.reverse();
    expect(keys(base(), b)).toEqual([]);
  });

  it('a changed event name touches the event only', () => {
    const b = clone(base());
    (b.events[1] as { name: string }).name = 'Run fast';
    expect(keys(base(), b)).toEqual(['motor/run']);
  });

  it('a changed field touches the field and its event', () => {
    const b = clone(base());
    (b.events[0] as { fields: unknown }).fields = [f('speed', { unit: 'rpm' }), f('torque')];
    expect(keys(base(), b)).toEqual(['spindle/start', 'spindle/start#speed']);
  });

  it('an added and a removed field are touched', () => {
    const b = clone(base());
    (b.events[0] as { fields: unknown }).fields = [f('speed'), f('angle')];
    expect(keys(base(), b)).toEqual(['spindle/start', 'spindle/start#angle', 'spindle/start#torque']);
  });

  it('a module rename or re-parent touches the module only', () => {
    const b = clone(base());
    (b.modules[1] as { parentKey: string | null }).parentKey = null;
    expect(keys(base(), b)).toEqual(['motor']);
  });

  it('a removed module touches its events, fields and relations', () => {
    const b: SpecRows = {
      modules: [{ key: 'spindle', name: 'Spindle', parentKey: null }],
      events: [base().events[0] as SpecRows['events'][number]],
      relations: [],
    };
    expect(keys(base(), b)).toEqual(['motor', 'motor/run', 'spindle/start#precedes#motor/run']);
  });

  it('an added event touches the event and its fields', () => {
    const b = clone(base());
    b.events.push({ moduleKey: 'motor', key: 'stop', name: 'Stop', fields: [f('rpm')], triggerRule: null, detailDocRef: null });
    expect(keys(base(), b)).toEqual(['motor/stop', 'motor/stop#rpm']);
  });

  it('a relation ruleRef change, addition and removal are touched', () => {
    const b = clone(base());
    (b.relations[0] as { ruleRef: string | null }).ruleRef = 'sec 4';
    expect(keys(base(), b)).toEqual(['spindle/start#precedes#motor/run']);
    expect(keys(b, { ...b, relations: [] })).toEqual(['spindle/start#precedes#motor/run']);
  });

  it('keys with separators are escaped', () => {
    const a: SpecRows = { modules: [{ key: 'a/b', name: 'A', parentKey: null }], events: [], relations: [] };
    expect(keys({ modules: [], events: [], relations: [] }, a)).toEqual(['a%2Fb']);
  });
});

describe('targetKeysOf (#1196 c)', () => {
  it('lists the keys of every kind', async () => {
    const { targetKeysOf } = await import('../domain/spec-diff.js');
    const k = targetKeysOf(base());
    expect([...k.module].sort()).toEqual(['motor', 'spindle']);
    expect([...k.event].sort()).toEqual(['motor/run', 'spindle/start']);
    expect([...k.field].sort()).toEqual(['spindle/start#speed', 'spindle/start#torque']);
    expect([...k.relation]).toEqual(['spindle/start#precedes#motor/run']);
  });
});
