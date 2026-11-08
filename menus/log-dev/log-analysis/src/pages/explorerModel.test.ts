import { describe, expect, it } from 'vitest';
import { evidenceFor, periodSelectionOf, queryFrom, sequenceData, selectionOf, exportRange } from './explorerModel';
const set = { sourceOwner: 'owner', files: [{ fileRef: 'second', order: 2, sha256: 'b'.repeat(64) }, { fileRef: 'first', order: 1, sha256: 'a'.repeat(64) }] };
describe('investigation projection (#1473)', () => {
  it('saves only source-supported conditions and accepts a known location without putting text in URL state', () => {
    expect(queryFrom({ text: 'word', module: 'M', contextKey: 'job', contextValue: '1', from: 'private' })).toEqual({ text: 'word', module: 'M', context: { job: '1' } });
    expect(selectionOf('2:10', set)).toEqual({ fileRef: 'second', fileOrder: 2, line: 10 });
    expect(selectionOf('3:10', set)).toBeNull();
    expect(selectionOf('1:0', set)).toBeNull();
    expect(evidenceFor(set, { fileRef: 'first', line: 3 })).toEqual({ fileRef: 'first', line: 3, fileSha256: 'a'.repeat(64) });
  });
  it('keeps file-then-line order even with incomplete periods and maps selection to the original location', () => {
    const data = sequenceData(set, [{ fileRef: 'second', startLine: 1, endLine: null, state: 'open', incomplete: true, synthetic: true }, { fileRef: 'first', startLine: 5, endLine: 9, state: 'run', incomplete: false, synthetic: true }]);
    expect(data.items.map(i => i.id)).toEqual(['1:5', '2:1']);
    expect(data.items[1].orderEnd).toBeUndefined();
    expect(data.items[1].carryover).toBe(true);
  });
  it('highlights the containing period without changing the selected raw location', () => {
    const periods = [{ fileRef: 'first', startLine: 5, endLine: 9, state: 'run', incomplete: false, synthetic: true }];
    expect(periodSelectionOf(set, periods, '1:7')).toBe('1:5');
    expect(periodSelectionOf(set, periods, '1:10')).toBeNull();
  });
  it.each([0, -1, 10001, NaN])('refuses an invalid export row count %s', n => expect(exportRange(n)).toBeNull());
  it('states the export cap and range without silently clipping', () => expect(exportRange(10000)).toEqual({ rows: 10000 }));
});
