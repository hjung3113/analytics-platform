// Fixture builders for the synthetic adapter and the scenarios of the contract suite. Dev and test only.

import { createHash } from 'node:crypto';

import type { SourceReadCapability, SourceSampleSet } from '@ap/contract-schemas';

import type { SourceReadPort } from '../../ports/source-read.js';
import {
  createSyntheticSourceReadPort,
  SYNTHETIC_SOURCE_OWNER,
  type SyntheticFile,
  type SyntheticFixture,
  type SyntheticLine,
} from './synthetic-adapter.js';

const ALL: SourceReadCapability[] = ['searchRecords', 'getWindow', 'getParsed', 'getPeriods', 'getTopViewLink'];
const sha = (seed: string) => createHash('sha256').update(seed).digest('hex');

function file(fileRef: string, lines: SyntheticLine[], extra: Partial<SyntheticFile> = {}): SyntheticFile {
  return { fileRef, sha256: sha(fileRef), lines, ...extra };
}
function plain(count: number, prefix: string): SyntheticLine[] {
  return Array.from({ length: count }, (_unused, i) => ({
    text: `합성 ${prefix} line ${i + 1}`,
    timestamp: `2026-01-01T00:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`,
    logType: 'event',
    module: i % 2 === 0 ? 'ModuleA' : 'ModuleB',
    event: i % 10 === 0 ? 'Start' : 'Tick',
  }));
}

export function sampleSetOf(fixture: SyntheticFixture): SourceSampleSet {
  return { sourceOwner: fixture.sourceOwner, files: fixture.files.map((f, index) => ({ fileRef: f.fileRef, order: index + 1, sha256: f.sha256 })) };
}

export const SYNTHETIC_SCENARIOS = ['typical', 'many_rows', 'long_line', 'partial', 'time_reversal', 'slow', 'unsupported', 'absent_source', 'permission_denied', 'failing'] as const;
export type SyntheticScenario = (typeof SYNTHETIC_SCENARIOS)[number];
/** The text the `failing` scenario throws internally; the contract suite checks it never leaves the adapter. */
export const SYNTHETIC_LEAK_MARKER = 'LEAK_MARKER_SOURCE_BODY_7f3a';

export function syntheticFixture(scenario: SyntheticScenario): SyntheticFixture {
  const base: SyntheticFixture = {
    sourceOwner: SYNTHETIC_SOURCE_OWNER,
    files: [file('synthetic/a.log', plain(30, 'a')), file('synthetic/b.log', plain(30, 'b'))],
    periods: [],
    capabilities: ALL,
    mode: 'normal',
  };
  const withParsed = (lines: SyntheticLine[]) =>
    lines.map((l, i) => (i === 4 ? { ...l, parsed: { extractedFields: { job: 'J-1' }, parserIn: l.text, parserOut: '합성 parsed' } } : l));
  switch (scenario) {
    case 'typical': {
      const a = file('synthetic/a.log', withParsed(plain(30, 'a')));
      return {
        ...base,
        files: [a, file('synthetic/b.log', plain(30, 'b'))],
        periods: [
          { fileRef: 'synthetic/a.log', startLine: 1, endLine: 9, state: 'run', incomplete: false },
          { fileRef: 'synthetic/b.log', startLine: 25, endLine: null, state: 'run', incomplete: true },
        ],
      };
    }
    case 'many_rows':
      return { ...base, files: [file('synthetic/a.log', plain(320, 'a')), file('synthetic/b.log', plain(320, 'b'))] };
    case 'long_line': {
      const lines = plain(10, 'a');
      lines[4] = { ...lines[4], text: 'x'.repeat(20_000) } as SyntheticLine;
      return { ...base, files: [file('synthetic/a.log', lines)] };
    }
    case 'partial':
      return { ...base, files: [file('synthetic/a.log', plain(30, 'a')), file('synthetic/b.log', [], { missing: true })] };
    case 'time_reversal': {
      const lines = plain(6, 'a');
      lines[3] = { ...lines[3], timestamp: '2025-12-31T23:59:59' } as SyntheticLine;
      return { ...base, files: [file('synthetic/a.log', lines)] };
    }
    case 'slow':
      return { ...base, mode: 'slow' };
    case 'unsupported':
      return { ...base, capabilities: ['searchRecords', 'getWindow'] };
    case 'absent_source':
      return { ...base, mode: 'absent' };
    case 'permission_denied':
      return { ...base, mode: 'denied' };
    case 'failing':
      return { ...base, mode: 'failing', failureText: `${SYNTHETIC_LEAK_MARKER} raw line: password=hunter2` };
  }
}

export function createSyntheticScenario(scenario: SyntheticScenario): { port: SourceReadPort; fixture: SyntheticFixture; sampleSet: SourceSampleSet } {
  const fixture = syntheticFixture(scenario);
  return { port: createSyntheticSourceReadPort(fixture), fixture, sampleSet: sampleSetOf(fixture) };
}
