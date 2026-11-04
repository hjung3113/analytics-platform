// #1196 b2 — the pure TSV parser of the model spec text input (`domain/spec-tsv.ts`): the header contract, line
// endings, BOM, blank lines, cell errors (row-numbered by the line in the submitted text), the call caps and the
// error cap. Happy rows must equal the structured rows the b1 schemas produce (same normalisation).

import { describe, expect, it } from 'vitest';

import { type DraftIndex, planSpecRows } from '../domain/spec-input.js';
import { SPEC_TSV_ERROR_CAP, type SpecTsvResult, parseSpecTsv, specTsvFieldErrors, tsvLineErrors } from '../domain/spec-tsv.js';
import type { FieldError } from '../../menu-dispatch/types.js';


const HEADER = [
  'kind', 'module', 'parent_module', 'event', 'trigger_rule', 'detail_doc_ref', 'fields_json',
  'source_module', 'source_event', 'predicate', 'target_module', 'target_event', 'rule_ref',
].join('\t');
const row = (...cells: string[]) => cells.join('\t');
const fe = (errors: FieldError[]) => errors.map((e) => `${e.path.join(':')}:${e.code}`);
/** Narrows a failed parse (and fails the test on an unexpected success) so the errors are typed. */
function failure(parsed: SpecTsvResult): { errors: FieldError[]; total: number } {
  if (parsed.ok) throw new Error(`expected a parse failure, got ${JSON.stringify(parsed.rows)}`);
  return { errors: parsed.errors, total: parsed.total };
}
const empty: DraftIndex = { moduleKeys: new Set(), eventKeys: new Set(), relationEdges: new Set() };

/** The worked example of design §15.5: two modules (one child), two events, one relation. */
const EXAMPLE = [
  HEADER,
  row('module', 'Spindle'),
  row('module', 'Spindle Motor', 'Spindle'),
  row('event', 'Spindle', '', 'Start', 'on start', '', '[{"name":"speed","type":"float","unit":"rpm","description":"RPM at start"}]'),
  row('event', 'Spindle Motor', '', 'Stop', '', '', ''),
  row('relation', '', '', '', '', '', '', 'Spindle', 'Start', 'precedes', 'Spindle Motor', 'Stop', '§4.2'),
].join('\n');

describe('spec TSV header', () => {
  it.each([
    ['empty text', '', ['text:required']],
    ['blank-only text', ' \r\n\t\n', ['text:required']],
    ['no kind column', row('module', 'parent_module'), ['text:line 1:column kind:required']],
    // `name` was dropped from the column list (the module/event column carries the name): it is unknown here
    ['unknown column', row('kind', 'module', 'name'), ['text:line 1:column name:unknown_column']],
    ['duplicate column', row('kind', 'module', 'module'), ['text:line 1:column module:duplicate_column']],
    ['a blank header cell is unknown', row('kind', 'module', ' '), ['text:line 1:column :unknown_column']],
  ])('refuses %s', (_label, text, expected) => {
    expect(fe(failure(parseSpecTsv(text)).errors)).toEqual(expected);
  });

  it('numbers header errors by the header line, also when blank lines precede it', () => {
    expect(fe(failure(parseSpecTsv(`\n\n${row('module')}\n${row('module', 'A')}`)).errors)).toEqual(['text:line 3:column kind:required']);
  });

  it('accepts a free column order and a column subset (all optional except kind)', () => {
    expect(parseSpecTsv([row('module', 'kind'), row('A', 'module')].join('\n'))).toMatchObject({ ok: true, rows: { modules: [{ name: 'A' }] } });
  });
});

describe('spec TSV text handling', () => {
  it('ignores a leading BOM and mixed CRLF, CR and LF line endings, and blank lines', () => {
    const mixed = `\uFEFF${HEADER}\r\n${row('module', 'Spindle')}\r${row('module', 'Spindle Motor', 'Spindle')}\n\n${row('event', 'Spindle', '', 'Start', 'on start')}\n`;
    const clean = parseSpecTsv([HEADER, row('module', 'Spindle'), row('module', 'Spindle Motor', 'Spindle'), row('event', 'Spindle', '', 'Start', 'on start')].join('\n'));
    expect(clean.ok).toBe(true);
    const parsed = parseSpecTsv(mixed);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || !clean.ok) return;
    expect(parsed.rows).toEqual(clean.rows);
    expect(parsed.lines).toEqual({ modules: [2, 3], events: [5], relations: [] }); // the blank line shifts the event
  });

  it('fewer cells than the header leave the missing cells empty; trailing empty cells are fine', () => {
    const parsed = parseSpecTsv([row('kind', 'module', 'parent_module'), row('module', 'Child', 'Parent', '', ''), row('module', 'Parent')].join('\n'));
    expect(parsed).toMatchObject({ ok: true, rows: { modules: [{ name: 'Child', parentModule: 'PARENT' }, { name: 'Parent' }] } });
  });
});

describe('spec TSV rows', () => {
  it('parses the worked example into the structured rows of b1, with source lines', () => {
    const parsed = parseSpecTsv(EXAMPLE);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toEqual({
      modules: [{ name: 'Spindle' }, { name: 'Spindle Motor', parentModule: 'SPINDLE' }],
      events: [
        { module: 'SPINDLE', name: 'Start', fields: [{ name: 'speed', type: 'float', unit: 'rpm', description: 'RPM at start' }], triggerRule: 'on start' },
        { module: 'SPINDLE MOTOR', name: 'Stop' },
      ],
      relations: [{ sourceModule: 'SPINDLE', sourceEvent: 'START', predicate: 'precedes', targetModule: 'SPINDLE MOTOR', targetEvent: 'STOP', ruleRef: '§4.2' }],
    });
    expect(parsed.lines).toEqual({ modules: [2, 3], events: [4, 5], relations: [6] });
    // the parsed rows plan like the equivalent structured call (an acceptance criterion of b2)
    expect(planSpecRows(empty, parsed.rows).ok).toBe(true);
  });

  it('normalises Korean names like the structured path: NFC, trimmed, inner whitespace collapsed', () => {
    const parsed = parseSpecTsv([row('kind', 'module'), row('module', '  카  탐 '), row('module', '\u1100\u1161')].join('\n'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows.modules.map((m) => m.name)).toEqual(['카 탐', '가']);
  });
});

describe('spec TSV cell errors', () => {
  it('a line with more cells than the header is refused without a column', () => {
    expect(fe(failure(parseSpecTsv([row('kind', 'module'), row('module', 'A', 'X')].join('\n'))).errors)).toEqual(['text:line 2:too_many_cells']);
  });

  it.each([
    ['a bad kind', [HEADER, row('thing', 'A')].join('\n'), 'text:line 2:column kind:unknown_value'],
    ['an empty kind', [HEADER, row('', 'A')].join('\n'), 'text:line 2:column kind:required'],
    ['a cell of another kind', [HEADER, row('module', 'A', '', '', '', '', '', 'X')].join('\n'), 'text:line 2:column source_module:unexpected_value'],
    ['a missing required cell', [HEADER, row('module', ' ', 'B')].join('\n'), 'text:line 2:column module:required'],
    ['a missing relation end', [HEADER, row('relation', '', '', '', '', '', '', 'A', 'E', 'p', '', 'T')].join('\n'), 'text:line 2:column target_module:required'],
    ['invalid fields_json', [HEADER, row('event', 'A', '', 'E', '', '', '{"name":"x"')].join('\n'), 'text:line 2:column fields_json:malformed'],
    ['fields_json of the wrong shape', [HEADER, row('event', 'A', '', 'E', '', '', '"text"')].join('\n'), 'text:line 2:column fields_json:malformed'],
    ['a fields field of an unknown key', [HEADER, row('event', 'A', '', 'E', '', '', '[{"name":"x","type":"int","description":"d","extra":1}]')].join('\n'), 'text:line 2:column fields_json:malformed'],
    ['a fields type outside the closed list', [HEADER, row('event', 'A', '', 'E', '', '', '[{"name":"x","type":"date","description":"d"}]')].join('\n'), 'text:line 2:column fields_json:malformed'],
    ['an overlong cell', [HEADER, row('module', 'A'.repeat(201))].join('\n'), 'text:line 2:column module:too_long'],
  ])('refuses %s', (_label, text, expected) => {
    const parsed = parseSpecTsv(text);
    expect(parsed.ok, JSON.stringify(parsed)).toBe(false);
    if (parsed.ok) return;
    expect(fe(parsed.errors)).toEqual([expected]);
  });

  it('numbers every bad row by its line and keeps going', () => {
    const parsed = parseSpecTsv([HEADER, row('module', 'A'), row('thing', 'B'), '', row('module', ' '), row('module', 'C')].join('\n'));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(fe(parsed.errors)).toEqual(['text:line 3:column kind:unknown_value', 'text:line 5:column module:required']);
    expect(parsed.total).toBe(2);
  });
});

describe('spec TSV caps', () => {
  const many = (n: number) => [row('kind', 'module'), ...Array.from({ length: n }, (_, i) => row('module', `M${i}`))].join('\n');

  it('accepts exactly 2,000 data rows and refuses 2,001', () => {
    const ok = parseSpecTsv(many(2000));
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.rows.modules).toHaveLength(2000);
    const over = parseSpecTsv(many(2001));
    expect(over.ok).toBe(false);
    if (over.ok) return;
    expect(fe(over.errors)).toEqual(['input:too_large']);
  });

  it(`reports at most ${SPEC_TSV_ERROR_CAP} errors plus a total, and the wire list ends with more_errors`, () => {
    const bad = [row('kind', 'module'), ...Array.from({ length: 25 }, () => row('thing', 'X'))].join('\n');
    const parsed = failure(parseSpecTsv(bad));
    expect(parsed.errors).toHaveLength(SPEC_TSV_ERROR_CAP);
    expect(parsed.total).toBe(25);
    const wire = specTsvFieldErrors({ text: bad });
    expect(wire).toHaveLength(SPEC_TSV_ERROR_CAP + 1);
    expect(wire.at(-1)).toEqual({ path: ['text'], code: 'more_errors' });
  });

  it('the wire errors are empty for rows input and for valid text', () => {
    expect(specTsvFieldErrors({ modules: [{ name: 'A' }] })).toEqual([]);
    expect(specTsvFieldErrors({ text: EXAMPLE, format: 'tsv' })).toEqual([]);
  });
});

describe('planning errors of parsed text keep their line numbers', () => {
  it('maps a duplicate and a dangling reference onto the source line and column', () => {
    const parsed = parseSpecTsv([HEADER, row('module', 'A'), row('module', 'a'), row('event', 'Z', '', 'E')].join('\n'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const plan = planSpecRows(empty, parsed.rows);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(fe(tsvLineErrors(plan.errors, parsed.lines))).toEqual([
      'text:line 3:column module:duplicate',
      'text:line 4:column module:not_found',
    ]);
    // errors without a row index pass through unchanged
    expect(fe(tsvLineErrors([{ path: ['input'], code: 'too_large' }], parsed.lines))).toEqual(['input:too_large']);
  });
});
