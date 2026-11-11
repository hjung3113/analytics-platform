import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { checkSampleWindowImport, observationHash, type OccurrenceBatch, type SampleWindowRef } from '../src/index.js';

// The import verdict the EV dev tool and the 설비 온보딩 mock share (#1658): validateSampleWindow plus the conflict class and,
// on request, a reprocessed Data Generation of a stored window's exact range (EV#105) instead of an overlap.
const root = new URL('../../fixtures/cluster-single/', import.meta.url);
const base = (): OccurrenceBatch => JSON.parse(readFileSync(new URL('occurrence-batch.json', root), 'utf8'));
const reprocessed = (): OccurrenceBatch => {
  const batch = base();
  batch.dataGeneration = 'g9';
  for (const occurrence of batch.occurrences) occurrence.source.dataGeneration = 'g9';
  return batch;
};
const stored = async (batch: OccurrenceBatch, timeDomain = batch.timeDomain): Promise<SampleWindowRef> => ({ from: batch.from, to: batch.to, timeDomain, hash: await observationHash(batch) });
const ctx = (existing: SampleWindowRef[], sameRangeReplaces?: boolean) => ({ equipmentId: 'eq-synth-01', existing, ...(sameRangeReplaces === undefined ? {} : { sameRangeReplaces }) });

it('accepts a new window with nothing stored: no same window, nothing replaced', async () => {
  const result = await checkSampleWindowImport(base(), ctx([]));
  expect(result).toMatchObject({ ok: true, same: null, replaces: [], summary: { dataGeneration: 'g1', occurrences: 29, timeDomain: 'site-synth' } });
});

it('names the stored window with the same content (an import changes nothing)', async () => {
  const g1 = await stored(base());
  expect(await checkSampleWindowImport(base(), ctx([g1]))).toMatchObject({ ok: true, same: g1, replaces: [] });
});

it('refuses a reprocessed generation of a stored range as a conflict by default, like the dev tool', async () => {
  const g1 = await stored(base());
  const result = await checkSampleWindowImport(reprocessed(), ctx([g1]));
  expect(result).toMatchObject({ ok: false, conflict: true, issues: [{ code: 'window-overlap' }] });
});

it('with sameRangeReplaces, accepts it and names the window it would replace; a partial overlap still conflicts', async () => {
  const g1 = await stored(base());
  expect(await checkSampleWindowImport(reprocessed(), ctx([g1], true))).toMatchObject({ ok: true, same: null, replaces: [g1] });
  const shifted = { ...g1, from: '2026-01-01T10:10:00.000' };
  expect(await checkSampleWindowImport(reprocessed(), ctx([shifted], true))).toMatchObject({ ok: false, conflict: true, issues: [{ code: 'window-overlap' }] });
});

it('with sameRangeReplaces, still refuses a same-range window of another Time Domain', async () => {
  const g1 = await stored(base(), 'site-other');
  expect(await checkSampleWindowImport(reprocessed(), ctx([g1], true))).toMatchObject({ ok: false, conflict: true, issues: [{ code: 'time-domain-mismatch', path: ['timeDomain'] }] });
});

it('a content problem is not a conflict', async () => {
  const batch = base();
  batch.timeDomain = '';
  expect(await checkSampleWindowImport(batch, ctx([]))).toMatchObject({ ok: false, conflict: false, issues: [{ code: 'empty-time-domain' }] });
});
