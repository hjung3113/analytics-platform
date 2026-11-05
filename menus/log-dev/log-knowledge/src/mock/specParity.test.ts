// Adapter vectors of #1196 node d fix round 2 (C4): the mock answers what the server answers. The TSV vectors mirror
// `apps/platform-api/src/modules/log-knowledge/__tests__/spec-tsv.test.ts` (same text, same `path:code` strings); the
// change vectors mirror `spec-change-validate.test.ts`. A server disagreement found here is reported, never patched.
import { beforeEach, describe, expect, it } from 'vitest';
import { createMockAdapter, setRole } from '@ap/mock-server';
import { groupId, KERNEL_PERMISSIONS, type FieldError, type MenuMeta, type PlatformAdapter } from '@ap/contracts';
import { SPEC_PUBLISH_PERMISSION } from '../endpoints';
import { logKnowledgeActionsMock, logKnowledgeMock, resetCatalog } from './index';
import { resetSpecs, SPEC_MODEL, specChanges } from './specStore';
import { all } from './store';

const action = (name: string) => logKnowledgeActionsMock.find(a => a.spec.id === `logKnowledge.${name}`)!;
const fe = (errors: readonly FieldError[] | undefined) => (errors ?? []).map(e => [...e.path, e.code].join(':'));
const row = (...cells: string[]) => cells.join('\t');
const HEADER = row('kind', 'module', 'parent_module', 'event', 'trigger_rule', 'detail_doc_ref', 'fields_json', 'source_module', 'source_event', 'predicate', 'target_module', 'target_event', 'rule_ref');
const unused = '00000007-0000-4000-8000-0000000000ff';
const tsv = (text: string) => fe(action('specDraftSave').validate?.({ revisionId: unused, mode: 'append', format: 'paste', text }));
const adapter = (): PlatformAdapter => {
  const menu = { id: 'log-knowledge-models', group: groupId('logKnowledge'), permission: 'platform:view', requiresScope: false } as MenuMeta;
  return createMockAdapter({ endpoints: logKnowledgeMock.filter(e => e.spec.menuId === menu.id), actions: logKnowledgeActionsMock.filter(a => a.spec.menuId === menu.id), registry: { menus: [menu] }, permissions: [...KERNEL_PERMISSIONS, SPEC_PUBLISH_PERMISSION] });
};
const call = (a: PlatformAdapter, name: string, input: Record<string, unknown>, expectedVersion?: string) => a.menuAction({ action: `logKnowledge.${name}`, input, idempotencyKey: crypto.randomUUID(), context: {}, ...(expectedVersion === undefined ? {} : { expectedVersion }) });
const software = () => all('software').filter(s => s.parentId === SPEC_MODEL);
beforeEach(() => { resetCatalog(); resetSpecs(); setRole('admin'); });

describe('TSV text input mirrors the server parser', () => {
  it.each<[string, string, string[]]>([
    ['empty text', '', ['text:required']],
    ['blank-only text', ' \r\n\t\n', ['text:required']],
    ['no kind column', row('module', 'parent_module'), ['text:line 1:column kind:required']],
    ['unknown column', row('kind', 'module', 'name'), ['text:line 1:column name:unknown_column']],
    ['duplicate column', row('kind', 'module', 'module'), ['text:line 1:column module:duplicate_column']],
    ['a blank header cell is unknown', row('kind', 'module', ' '), ['text:line 1:column :unknown_column']],
    ['header errors numbered after leading blank lines', `\n\n${row('module')}\n${row('module', 'A')}`, ['text:line 3:column kind:required']],
    ['a line wider than the header', [row('kind', 'module'), row('module', 'A', 'X')].join('\n'), ['text:line 2:too_many_cells']],
    ['a bad kind', [HEADER, row('thing', 'A')].join('\n'), ['text:line 2:column kind:unknown_value']],
    ['an empty kind', [HEADER, row('', 'A')].join('\n'), ['text:line 2:column kind:required']],
    ['a cell of another kind', [HEADER, row('module', 'A', '', '', '', '', '', 'X')].join('\n'), ['text:line 2:column source_module:unexpected_value']],
    ['a missing required cell', [HEADER, row('module', ' ', 'B')].join('\n'), ['text:line 2:column module:required']],
    ['a missing relation end', [HEADER, row('relation', '', '', '', '', '', '', 'A', 'E', 'p', '', 'T')].join('\n'), ['text:line 2:column target_module:required']],
    ['invalid fields_json', [HEADER, row('event', 'A', '', 'E', '', '', '{"name":"x"')].join('\n'), ['text:line 2:column fields_json:malformed']],
    ['fields_json of the wrong shape', [HEADER, row('event', 'A', '', 'E', '', '', '"text"')].join('\n'), ['text:line 2:column fields_json:malformed']],
    ['a fields field of an unknown key', [HEADER, row('event', 'A', '', 'E', '', '', '[{"name":"x","type":"int","description":"d","extra":1}]')].join('\n'), ['text:line 2:column fields_json:malformed']],
    ['a fields type outside the closed list', [HEADER, row('event', 'A', '', 'E', '', '', '[{"name":"x","type":"date","description":"d"}]')].join('\n'), ['text:line 2:column fields_json:malformed']],
    ['an overlong cell', [HEADER, row('module', 'A'.repeat(201))].join('\n'), ['text:line 2:column module:too_long']],
    ['every bad row numbered by its line', [HEADER, row('module', 'A'), row('thing', 'B'), '', row('module', ' '), row('module', 'C')].join('\n'), ['text:line 3:column kind:unknown_value', 'text:line 5:column module:required']],
    ...['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'].map(kind => [`an inherited kind key ${kind}`, [HEADER, row(kind, 'A')].join('\n'), ['text:line 2:column kind:unknown_value']] as [string, string, string[]]),
  ])('refuses %s', (_label, text, expected) => {
    expect(tsv(text)).toEqual(expected);
  });
  it('accepts a free column order, a subset, CRLF/CR line endings, BOM and blank lines', () => {
    expect(tsv(`﻿${row('module', 'kind')}\r${row('A', 'module')}\r\n\n${row('B', 'module')}\n`)).toEqual([]);
  });
  const many = (n: number) => [row('kind', 'module'), ...Array.from({ length: n }, (_, i) => row('module', `M${i}`))].join('\n');
  it('accepts exactly 2,000 rows and refuses 2,001 before any row is judged', () => {
    expect(tsv(many(2000))).toEqual([]);
    expect(tsv(many(2001))).toEqual(['input:too_large']);
    // Even a poisoned row past the cap is never reached: only the cap is reported.
    expect(tsv(`${many(2000)}\n${row('thing', 'x')}`)).toEqual(['input:too_large']);
  });
  it('reports 20 errors plus a numeric total marker', () => {
    const bad = [row('kind', 'module'), ...Array.from({ length: 25 }, () => row('thing', 'X'))].join('\n');
    const errors = tsv(bad);
    expect(errors).toHaveLength(21);
    expect(errors.at(-1)).toBe('text:more_errors:25');
    expect(errors[0]).toBe('text:line 2:column kind:unknown_value');
  });
  it('a 2,001-row text never reaches storage through the adapter', async () => {
    const a = adapter(), created = await call(a, 'specDraftCreate', { modelId: SPEC_MODEL, sourceDocRef: { docLabel: 'C', docVersion: '2' } });
    const revisionId = (created.data as { revisionId: string }).revisionId;
    const result = await call(a, 'specDraftSave', { revisionId, mode: 'append', format: 'paste', text: many(2001) }, '1');
    expect(result.outcome).toBe('invalid');
  });
});

describe('change input mirrors the server envelope (never throws)', () => {
  const sw = () => software()[1]!.id;
  const base = () => ({ modelId: SPEC_MODEL, softwareId: sw(), targetKind: 'module', target: { module: 'New' }, changeKind: 'added', change: { after: { name: 'New' } } });
  it.each([
    ['an unknown target kind with a value side', { targetKind: 'bogus' }, ['targetKind:malformed']],
    ['an unknown target kind with before/after sides', { targetKind: 'bogus', changeKind: 'changed', change: { before: {}, after: {} } }, ['targetKind:malformed']],
    ['a numeric target kind', { targetKind: 42 }, ['targetKind:malformed']],
    ['a missing target kind', { targetKind: undefined }, ['targetKind:required']],
    ['an unknown change kind', { changeKind: 'bogus' }, ['changeKind:malformed']],
    ['both kinds unknown', { targetKind: 'bogus', changeKind: 'bogus' }, ['targetKind:malformed', 'changeKind:malformed']],
  ])('answers field errors for %s', async (_label, patch, expected) => {
    const input = { ...base(), ...patch };
    expect(() => action('specChangeAdd').validate?.(input)).not.toThrow();
    expect(fe(action('specChangeAdd').validate?.(input))).toEqual(expected);
    const result = await call(adapter(), 'specChangeAdd', input);
    expect(result.outcome).toBe('invalid');
  });
  it('refuses a replacement of an unknown kind as an invalid input, not an engine error', async () => {
    const original = specChanges().find(c => !c.retiredAt)!;
    const result = await call(adapter(), 'specChangeRetire', { changeId: original.id, replacement: { softwareId: sw(), targetKind: 'bogus', target: {}, changeKind: 'added', change: { after: {} } } }, String(original.version));
    expect(result.outcome).toBe('invalid');
  });
});

describe('change targets are stored in the server canonical form', () => {
  const sw = () => software()[1]!.id;
  const add = async (input: Record<string, unknown>) => {
    const full = { modelId: SPEC_MODEL, softwareId: sw(), ...input };
    expect(fe(action('specChangeAdd').validate?.(full))).toEqual([]);
    const result = await call(adapter(), 'specChangeAdd', full);
    expect(result.outcome, JSON.stringify(result)).toBe('ok');
    return specChanges().find(c => c.id === (result.data as { changeId: string }).changeId)!;
  };
  it.each([
    ['a padded field name', { targetKind: 'field', target: { module: 'Chamber', event: 'Start', field: ' pressure ' }, changeKind: 'added', change: { after: { name: ' pressure ', type: 'float', description: 'p' } } }, 'CHAMBER/START#pressure'],
    ['a field name with inner whitespace', { targetKind: 'field', target: { module: 'Chamber', event: 'Start', field: 'wafer   temp' }, changeKind: 'added', change: { after: { name: 'wafer temp', type: 'float', description: 'p' } } }, 'CHAMBER/START#wafer temp'],
    ['a field name carrying the key separators', { targetKind: 'field', target: { module: 'Chamber', event: 'Start', field: 'a/b#c' }, changeKind: 'added', change: { after: { name: 'a/b#c', type: 'float', description: 'p' } } }, 'CHAMBER/START#a%2Fb%23c'],
    ['a padded event name', { targetKind: 'event', target: { module: ' Chamber ', event: '  Second   Evt ' }, changeKind: 'added', change: { after: { name: 'second evt' } } }, 'CHAMBER/SECOND EVT'],
    ['a padded relation predicate', { targetKind: 'relation', target: { sourceModule: 'Chamber', sourceEvent: 'Start', predicate: ' pre#cedes ', targetModule: 'Robot', targetEvent: 'Move' }, changeKind: 'added', change: { after: { ruleRef: '§1' } } }, 'CHAMBER/START#pre%23cedes#ROBOT/MOVE'],
  ])('stores %s under its canonical key', async (_label, input, key) => {
    expect((await add(input)).targetKey).toBe(key);
  });
});
