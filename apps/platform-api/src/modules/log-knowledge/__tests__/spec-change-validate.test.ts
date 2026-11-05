import { describe, expect, it } from 'vitest';

import type { CheckService } from '../../permissions/check-service.js';
import { parseSpecChangeAdd, parseSpecChangeRetire, validateSpecChange } from '../domain/spec-change-input.js';
import { specChangeActions } from '../spec-change-actions.js';

const ID = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
const ID2 = '1f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e11';
const fe = (errors: readonly { path: readonly string[]; code: string }[]) => errors.map((e) => `${e.path.join('.')}:${e.code}`);
const fld = { name: 'speed', type: 'int', description: 'rpm' };
const add = (over: Record<string, unknown> = {}) => ({
  modelId: ID, softwareId: ID2, targetKind: 'event', target: { module: 'Spindle', event: 'Start' }, changeKind: 'changed',
  change: { before: { name: 'Start' }, after: { name: 'Start', triggerRule: 'on press' } }, ...over,
});

describe('spec change input validation (#1196 c)', () => {
  it('normalises a valid add: keys from names, closed change shape with nulls', () => {
    const r = parseSpecChangeAdd(add());
    expect(r.ok && r.value).toMatchObject({
      targetKey: 'SPINDLE/START', targetKind: 'event', endsBeforeSoftwareId: null, note: null,
      change: { before: { name: 'Start', triggerRule: null, detailDocRef: null }, after: { name: 'Start', triggerRule: 'on press', detailDocRef: null } },
    });
  });

  it.each([
    ['added module', { targetKind: 'module', target: { module: 'Axis' }, changeKind: 'added', change: { after: { name: 'Axis' } } }],
    ['removed field', { targetKind: 'field', target: { module: 'a', event: 'b', field: 'speed' }, changeKind: 'removed', change: { before: fld } }],
    ['relation changed', { targetKind: 'relation', target: { sourceModule: 'a', sourceEvent: 'b', predicate: 'precedes', targetModule: 'c', targetEvent: 'd' }, changeKind: 'changed', change: { before: { ruleRef: null }, after: { ruleRef: 'x' } } }],
    ['behavior with a note', { targetKind: 'event', target: { module: 'a', event: 'b' }, changeKind: 'behavior', change: {}, note: 'fires twice' }],
    ['behavior without a change', { targetKind: 'event', target: { module: 'a', event: 'b' }, changeKind: 'behavior', change: undefined, note: 'fires twice' }],
  ])('accepts %s', (_n, over) => {
    expect(validateSpecChange('specChangeAdd', add(over))).toEqual([]);
  });

  it.each([
    ['bad model id', { modelId: 'x' }, ['modelId:malformed']],
    ['missing software', { softwareId: undefined }, ['softwareId:required']],
    ['unknown target kind', { targetKind: 'zone' }, ['targetKind:malformed']],
    ['unknown change kind', { changeKind: 'moved' }, ['changeKind:malformed']],
    ['target with a stray key', { target: { module: 'a', event: 'b', x: 1 } }, ['target:malformed']],
    ['added without after', { changeKind: 'added', change: {} }, ['change.after:required']],
    ['removed with after', { changeKind: 'removed', change: { before: { name: 'Start' }, after: { name: 'Start' } } }, ['change.after:malformed']],
    ['behavior with before', { changeKind: 'behavior', change: { before: {} }, note: 'n' }, ['change.before:malformed']],
    ['behavior without a note', { changeKind: 'behavior', change: {} }, ['note:required']],
    ['renamed to another key', { changeKind: 'added', change: { after: { name: 'Stop' } } }, ['change.after.name:target_mismatch']],
    ['field after with another name', { targetKind: 'field', target: { module: 'a', event: 'b', field: 'speed' }, changeKind: 'added', change: { after: { ...fld, name: 'torque' } } }, ['change.after.name:target_mismatch']],
    ['field of a bad type', { targetKind: 'field', target: { module: 'a', event: 'b', field: 'speed' }, changeKind: 'added', change: { after: { ...fld, type: 'blob' } } }, ['change.after.type:malformed']],
    ['note too long', { note: 'x'.repeat(1001) }, ['note:too_long']],
    ['unsafe note', { note: 'a\u0000b' }, ['note:malformed']],
  ])('refuses %s', (_n, over, expected) => {
    expect(fe(validateSpecChange('specChangeAdd', add(over)))).toEqual(expected);
  });

  it('caps change_json at 16 KiB serialized', () => {
    const after = { name: 'speed', type: 'enum', description: 'd', allowedValues: Array.from({ length: 200 }, (_x, i) => `${i}-${'v'.repeat(150)}`) };
    const errors = validateSpecChange('specChangeAdd', add({ targetKind: 'field', target: { module: 'a', event: 'b', field: 'speed' }, changeKind: 'added', change: { after } }));
    expect(fe(errors)).toEqual(['change:too_large']);
  });

  it('retire: a plain retire needs the change id; a replacement is validated under its own path', () => {
    expect(validateSpecChange('specChangeRetire', { changeId: ID })).toEqual([]);
    expect(fe(validateSpecChange('specChangeRetire', {}))).toEqual(['changeId:required']);
    const replacement = { softwareId: ID2, targetKind: 'event', target: { module: 'a', event: 'b' }, changeKind: 'behavior', change: {} };
    expect(fe(validateSpecChange('specChangeRetire', { changeId: ID, replacement }))).toEqual(['replacement.note:required']);
    const ok = parseSpecChangeRetire({ changeId: ID, replacement: { ...replacement, note: 'n' } });
    expect(ok.ok && ok.value.replacement).toMatchObject({ targetKey: 'A/B', softwareId: ID2 });
  });

  it('confirm needs the change id', () => {
    expect(validateSpecChange('specChangeConfirm', { changeId: ID })).toEqual([]);
    expect(fe(validateSpecChange('specChangeConfirm', { changeId: 'x' }))).toEqual(['changeId:malformed']);
  });

  it('declares the three actions on the models menu with the spec right', () => {
    const decls = specChangeActions({ checkService: {} as CheckService });
    expect(decls.map((d) => [d.spec.id, d.spec.concurrency, d.spec.permission])).toEqual([
      ['logKnowledge.specChangeAdd', 'none', 'knowledge:spec-publish'],
      ['logKnowledge.specChangeRetire', 'version', 'knowledge:spec-publish'],
      ['logKnowledge.specChangeConfirm', 'version', 'knowledge:spec-publish'],
    ]);
  });
});
