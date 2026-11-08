import { describe, expect, it } from 'vitest';
import { datasetsMock } from './datasets';
import { DS, REV, datasetRows } from './datasets-fixtures';

const read = (name: string, params: Record<string, unknown>) => datasetsMock.find(e => e.spec.id === `logDataset.${name}`)!.handle({ params } as never) as Record<string, unknown>;

describe('synthetic dataset identity', () => {
  it('keeps revision and baseline identities within their dataset', () => {
    const first = read('datasetDetail', { datasetId: DS }) as { revisions: { id: string }[] };
    const second = read('datasetDetail', { datasetId: datasetRows[1]!.id }) as { revisions: { id: string }[] };
    expect(first.revisions[0]!.id).toBe(REV);
    expect(second.revisions[0]!.id).not.toBe(REV);
    expect(read('baselines', { datasetRevisionId: second.revisions[0]!.id })).toMatchObject({ datasetId: datasetRows[1]!.id, rows: [] });
  });
});
