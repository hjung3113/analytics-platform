import { describe, expect, it } from 'vitest';
import { relationInputs, relationRowsOf, validateRelations } from './itemRelationModel';

describe('Event relation form payload', () => {
  it('prefills stable keys and sends after without swapping it in the client', () => {
    const rows = relationRowsOf([{ ordinal: 1, kind: 'expected', source: 'CHAMBER/START', predicate: 'before', target: 'CHAMBER/STOP', resolved: false, sourceLabel: null, targetLabel: null }]);
    expect(rows).toMatchObject([{ kind: 'expected', source: 'CHAMBER/START', target: 'CHAMBER/STOP', predicate: 'before' }]);
    expect(relationInputs([{ ...rows[0]!, predicate: 'after' }])).toEqual([{ kind: 'expected', source: { module: 'CHAMBER', event: 'START' }, target: { module: 'CHAMBER', event: 'STOP' }, predicate: 'after' }]);
  });
  it('allows an empty optional list and free keys, but rejects incomplete, self and duplicate rows', () => {
    expect(validateRelations([])).toEqual({});
    const row = { kind: 'observed' as const, source: 'CUSTOM/A', target: 'CUSTOM/B', predicate: 'before' as const };
    expect(validateRelations([row])).toEqual({});
    expect(validateRelations([{ ...row, target: '' }])).toHaveProperty('relations.0');
    expect(validateRelations([{ ...row, target: row.source }])).toHaveProperty('relations.0');
    expect(validateRelations([row, { ...row, source: row.target, target: row.source, predicate: 'after' }])).toHaveProperty('relations.1');
  });
  it('decodes escaped stable keys when building the write input', () => {
    expect(relationInputs([{ kind: 'observed', source: 'MOD%2FONE/START', target: 'MOD%2FONE/STOP', predicate: 'before' }])[0]?.source).toEqual({ module: 'MOD/ONE', event: 'START' });
  });
  it('caps writes at twenty relation records', () => {
    expect(validateRelations(Array.from({ length: 21 }, (_, i) => ({ kind: 'observed', source: `MOD/E${i}`, target: 'MOD/END', predicate: 'before' })))).toHaveProperty('relations');
  });
});
