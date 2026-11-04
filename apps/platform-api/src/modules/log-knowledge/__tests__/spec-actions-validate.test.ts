// #1196 fix C1 — the `specDraftSave` validate gate short-circuits: an envelope/contract/cap refusal is returned
// without invoking the TSV parser, so refused input never pays for cell splitting, schema validation or
// `JSON.parse` (the spy on `JSON.parse` fails the test the moment any cell work happens).

import { describe, expect, it, vi } from 'vitest';

import type { CheckService } from '../../permissions/check-service.js';
import { specActions } from '../spec-actions.js';

const draftSave = specActions({ checkService: {} as CheckService }).find((d) => d.spec.id === 'logKnowledge.specDraftSave');
if (!draftSave) throw new Error('the specDraftSave declaration is missing');

const T = (...cells: string[]) => cells.join('\t');
const HEADER = T(
  'kind', 'module', 'parent_module', 'event', 'trigger_rule', 'detail_doc_ref', 'fields_json',
  'source_module', 'source_event', 'predicate', 'target_module', 'target_event', 'rule_ref',
);
const base = { revisionId: '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10', mode: 'append' };
const fe = (errors: readonly { path: readonly string[]; code: string }[]) => errors.map((e) => `${e.path.join(':')}:${e.code}`);

describe('specDraftSave validate gates the TSV parser (#1196 fix C1)', () => {
  it('oversized text answers only input:too_large and never parses', () => {
    const jsonParse = vi.spyOn(JSON, 'parse');
    try {
      const text = [HEADER, T('module', 'A'.repeat(512 * 1024))].join('\n');
      const errors = draftSave.validate({ ...base, text, format: 'tsv' });
      expect(fe(errors)).toEqual(['input:too_large']);
      expect(jsonParse).not.toHaveBeenCalled();
    } finally {
      jsonParse.mockRestore();
    }
  });

  it('2,001 data rows answer only input:too_large and never parse', () => {
    const jsonParse = vi.spyOn(JSON, 'parse');
    try {
      const text = [HEADER, ...Array.from({ length: 2001 }, () => T('event', 'Spindle', '', 'Start', '', '', '{"bad'))].join('\n');
      const errors = draftSave.validate({ ...base, text, format: 'tsv' });
      expect(fe(errors)).toEqual(['input:too_large']);
      expect(jsonParse).not.toHaveBeenCalled();
    } finally {
      jsonParse.mockRestore();
    }
  });

  it('mixed rows and text answer only the contract refusal and never parse', () => {
    const jsonParse = vi.spyOn(JSON, 'parse');
    try {
      const text = [HEADER, T('event', 'Spindle', '', 'Start', '', '', '{"bad')].join('\n');
      const errors = draftSave.validate({ ...base, modules: [{ name: 'A' }], text });
      expect(fe(errors)).toEqual(['input:rows_or_text']);
      expect(jsonParse).not.toHaveBeenCalled();
    } finally {
      jsonParse.mockRestore();
    }
  });
});
