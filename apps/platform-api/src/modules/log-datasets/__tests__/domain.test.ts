import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  AVAILABILITIES,
  type FileCheckState,
  calculateAvailability,
  summarizeAvailability,
} from '../domain/availability.js';
import { parseDatasetInput, validateDatasetInput } from '../domain/dataset-input.js';
import { parseDatasetsParams } from '../domain/dataset-params.js';
import { type SampleSet, sampleManifestDigest } from '../domain/sample-manifest.js';
import { SCENARIO_TAGS, isScenarioTag } from '../domain/scenario-tags.js';

const H = (c: string) => c.repeat(64);
const set = (order: number[]): SampleSet => ({
  sourceOwner: 'owner-1',
  files: order.map((o, i) => ({ fileRef: `file-${i + 1}.log`, order: o, sha256: H(String(i + 1)) })),
});
const here = dirname(fileURLToPath(import.meta.url));

describe('sample manifest digest', () => {
  it('is stable: the same list gives the same 64-hex digest', () => {
    expect(sampleManifestDigest(set([1, 2, 3]))).toBe(sampleManifestDigest(set([1, 2, 3])));
    expect(sampleManifestDigest(set([1, 2, 3]))).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is order-sensitive: swapping which file comes first is a different manifest', () => {
    expect(sampleManifestDigest(set([1, 2, 3]))).not.toBe(sampleManifestDigest(set([2, 1, 3])));
  });
  it('does not depend on the array position, only on the confirmed order', () => {
    const a = set([1, 2]);
    const b: SampleSet = { ...a, files: [...a.files].reverse() };
    expect(sampleManifestDigest(b)).toBe(sampleManifestDigest(a));
  });
});

describe('availability calculation', () => {
  it.each([
    [null, 'unverified'],
    [[], 'unverified'],
    [['match', 'match'], 'available'],
    [['match', 'hash_mismatch'], 'hash_mismatch'],
    [['match', 'absent'], 'unavailable'],
    [['match', 'permission_denied'], 'unavailable'],
    [['hash_mismatch', 'absent'], 'unavailable'],
    [['match', 'unsupported'], 'unverified'],
    [['match', 'error'], 'unverified'],
    [['hash_unknown', 'hash_unknown'], 'unverified'],
    [['hash_mismatch', 'error'], 'hash_mismatch'],
    [['match', 'hash_unknown'], 'unverified'],
  ] as [FileCheckState[] | null, string][])('%j -> %s', (states, expected) => {
    expect(calculateAvailability(states)).toBe(expected);
  });

  it('never says available unless every file matched', () => {
    const others: FileCheckState[] = ['hash_mismatch', 'hash_unknown', 'absent', 'permission_denied', 'unsupported', 'error'];
    for (const state of others) expect(calculateAvailability(['match', state])).not.toBe('available');
    expect(AVAILABILITIES).toEqual(['available', 'unavailable', 'hash_mismatch', 'unverified']);
  });

  it('summarizes the counts per state', () => {
    expect(summarizeAvailability(['match', 'match', 'absent'], 3)).toEqual({ availability: 'unavailable', fileCount: 3, counts: { match: 2, absent: 1 } });
    expect(summarizeAvailability(null, 2)).toEqual({ availability: 'unverified', fileCount: 2, counts: {} });
  });
});

describe('scenario tags', () => {
  it('is the closed set of the design', () => {
    expect([...SCENARIO_TAGS]).toEqual(['normal', 'exception', 'boundary', 'regression', 'file_boundary', 'carryover', 'partial_support']);
    expect(isScenarioTag('smoke')).toBe(false);
  });
  it('the migration check carries the same list (drift)', () => {
    // Found by name, not number: the lane renumbers the migration at merge.
    const dir = join(here, '../../../../migrations');
    const file = readdirSync(dir).find((name) => /^\d{4}_log_datasets\.sql$/.test(name));
    expect(file).toBeDefined();
    const sql = readFileSync(join(dir, file ?? ''), 'utf8');
    const m = /"dataset_scenario_tags_check" CHECK \([^)]*array\[([^\]]*)\]/.exec(sql);
    expect(m).not.toBeNull();
    const listed = (m?.[1] ?? '').split(',').map((s) => s.trim().replace(/'/g, ''));
    expect(listed).toEqual([...SCENARIO_TAGS]);
  });
});

describe('dataset input', () => {
  const sampleSet = set([1, 2]);
  it('datasetCreate defaults nothing on the wire and trims the name', () => {
    const r = parseDatasetInput('datasetCreate', { name: '  Alpha  ' });
    expect(r).toEqual({ ok: true, value: { name: 'Alpha' } });
  });
  it.each([
    ['an unknown tag', { name: 'a', scenarioTags: ['smoke'] }, 'scenarioTags.0:malformed'],
    ['a duplicate tag', { name: 'a', scenarioTags: ['normal', 'normal'] }, 'scenarioTags:duplicate'],
    ['a blank name', { name: '  ' }, 'name:required'],
    ['an unknown share scope', { name: 'a', shareScope: 'world' }, 'shareScope:malformed'],
    ['a non-uuid model id', { name: 'a', modelIds: ['x'] }, 'modelIds.0:malformed'],
  ])('datasetCreate refuses %s', (_label, input, expected) => {
    expect(validateDatasetInput('datasetCreate', input).map((e) => `${e.path.join('.')}:${e.code}`)).toContain(expected);
  });

  it('revisionCreate parses the sample set with the lifecycle rules', () => {
    const ok = parseDatasetInput('revisionCreate', { datasetId: '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10', sampleSet });
    expect(ok.ok).toBe(true);
    const dup = validateDatasetInput('revisionCreate', {
      datasetId: '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10',
      sampleSet: { sourceOwner: 'o', files: [{ fileRef: 'a', order: 1, sha256: H('a') }, { fileRef: 'a', order: 2, sha256: H('b') }] },
    });
    expect(dup.map((e) => `${e.path.join('.')}:${e.code}`)).toContain('sampleSet.files.1.fileRef:duplicate');
  });
  it('inputMeta takes confirmed encoding / format only', () => {
    const base = { datasetId: '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10', sampleSet };
    expect(validateDatasetInput('revisionCreate', { ...base, inputMeta: { encoding: 'utf-8', format: 'csv' } })).toEqual([]);
    expect(validateDatasetInput('revisionCreate', { ...base, inputMeta: { guessedEncoding: 'utf-8' } })).not.toEqual([]);
  });

  describe('candidateCreate', () => {
    const base = { name: 'c', sampleSet };
    const ref = { fileRef: 'file-1.log', line: 3, fileSha256: H('1') };
    it('a manual candidate names neither a round nor evidence', () => {
      expect(validateDatasetInput('candidateCreate', { ...base, origin: 'manual' })).toEqual([]);
      expect(validateDatasetInput('candidateCreate', { ...base, origin: 'manual', roundId: '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10' })).not.toEqual([]);
    });
    it('a round-evidence candidate needs its round and at least one evidence location', () => {
      const roundId = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
      expect(validateDatasetInput('candidateCreate', { ...base, origin: 'round_evidence', roundId, evidenceRefs: [ref] })).toEqual([]);
      expect(validateDatasetInput('candidateCreate', { ...base, origin: 'round_evidence', evidenceRefs: [ref] }).map((e) => e.path.join('.'))).toContain('roundId');
      expect(validateDatasetInput('candidateCreate', { ...base, origin: 'round_evidence', roundId }).map((e) => e.path.join('.'))).toContain('evidenceRefs');
    });
    it('holds data references only: a body, a command or an unknown origin is refused', () => {
      const roundId = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
      const withBody = validateDatasetInput('candidateCreate', { ...base, origin: 'round_evidence', roundId, evidenceRefs: [{ ...ref, text: 'raw line' }] });
      expect(withBody.map((e) => e.path.join('.'))).toContain('evidenceRefs.0');
      expect(validateDatasetInput('candidateCreate', { ...base, origin: 'llm' }).map((e) => e.path.join('.'))).toContain('origin');
    });
  });

  it('candidateDecide: a rejection needs a reason, an approval does not', () => {
    const id = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
    expect(validateDatasetInput('candidateDecide', { id, decision: 'approve' })).toEqual([]);
    expect(validateDatasetInput('candidateDecide', { id, decision: 'reject' })).toEqual([{ path: ['reason'], code: 'required' }]);
    expect(validateDatasetInput('candidateDecide', { id, decision: 'reject', reason: ' no ' })).toEqual([]);
  });
});

describe('dataset list params', () => {
  it('accepts the tag / model / status filters of ADR-0105 and defaults to newest first', () => {
    const r = parseDatasetsParams({ filters: [{ id: 'tag', op: 'in', value: ['normal', 'carryover'] }, { id: 'status', op: 'in', value: ['active'] }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.sorting).toEqual([{ id: 'updatedAt', desc: true }]);
  });
  it.each([
    ['an unknown tag value', { filters: [{ id: 'tag', op: 'in', value: ['smoke'] }] }],
    ['an unknown field', { filters: [{ id: 'owner', op: 'in', value: ['x'] }] }],
    ['an unknown sort', { sorting: [{ id: 'purpose', desc: false }] }],
  ])('refuses %s', (_label, params) => {
    expect(parseDatasetsParams(params).ok).toBe(false);
  });
});
