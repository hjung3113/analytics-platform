// The TSV parser of the model spec text input (#1196 b2, ADR-0111, design v0.6 §15.5). Pure and DB-free like
// `import-file.ts`. UTF-8 text; a leading BOM is ignored; line endings may be `\n`, `\r\n` or a lone `\r`; blank
// lines are skipped. No quoting or escaping: a cell cannot contain a tab or a newline (the JSON of `fields_json`
// must be compact one-line). One header row is required — exact known columns, free order, any subset, `kind`
// mandatory; an unknown, duplicate or blank header cell is an error naming it. Every parsed row is validated by
// the SAME b1 row schemas (`SPEC_ROW_SCHEMAS`) and normalised the same way, so text and structured calls converge
// on identical rows, plans and content hashes. Errors are numbered by the line in the submitted text (the header
// is line 1) and name the column; at most SPEC_TSV_ERROR_CAP are reported while `total` counts them all.

import type { ZodError } from 'zod';

import type { FieldError } from '../../menu-dispatch/types.js';
import { type EventRowInput, type ModuleRowInput, type RelationRowInput, SPEC_ROW_SCHEMAS, SPEC_ROWS_MAX, fieldErrors } from './spec-input.js';

/** How many line errors one answer reports; the rest are summarised by `text:more_errors`. */
export const SPEC_TSV_ERROR_CAP = 20;

/** Every known header column; all optional in the header except `kind`. There is no `name` column: the
 *  `module`/`event` column carries the entity's display name (decided in #1196 b2 — one column per name). */
export const SPEC_TSV_COLUMNS = [
  'kind', 'module', 'parent_module', 'event', 'trigger_rule', 'detail_doc_ref', 'fields_json',
  'source_module', 'source_event', 'predicate', 'target_module', 'target_event', 'rule_ref',
] as const;
type SpecTsvColumn = (typeof SPEC_TSV_COLUMNS)[number];
type SpecKind = 'module' | 'event' | 'relation';

const KNOWN_COLUMNS: readonly string[] = SPEC_TSV_COLUMNS;

/** The columns a row of each kind may fill; a non-empty cell of any other column is an error. */
const KIND_COLUMNS: Record<SpecKind, readonly SpecTsvColumn[]> = {
  module: ['kind', 'module', 'parent_module'],
  event: ['kind', 'module', 'event', 'trigger_rule', 'detail_doc_ref', 'fields_json'],
  relation: ['kind', 'source_module', 'source_event', 'predicate', 'target_module', 'target_event', 'rule_ref'],
};

/** The columns of a kind, addressed by the `kind` cell as typed (an unknown kind is absent). */
const COLUMNS_OF_KIND: Record<string, readonly SpecTsvColumn[]> = KIND_COLUMNS;

/** The b1 row field each column becomes, per kind: where a zod or planning error lands on the TSV grid. */
const FIELD_COLUMNS: Record<SpecKind, Record<string, SpecTsvColumn>> = {
  module: { name: 'module', parentModule: 'parent_module' },
  event: { module: 'module', name: 'event', fields: 'fields_json', triggerRule: 'trigger_rule', detailDocRef: 'detail_doc_ref' },
  relation: {
    sourceModule: 'source_module',
    sourceEvent: 'source_event',
    predicate: 'predicate',
    targetModule: 'target_module',
    targetEvent: 'target_event',
    ruleRef: 'rule_ref',
  },
};

export interface SpecTsvRows {
  modules: ModuleRowInput[];
  events: EventRowInput[];
  relations: RelationRowInput[];
}

/** The source line (1-based, in the submitted text) of every parsed row, for planning-error numbering. */
export interface SpecTsvLines {
  modules: number[];
  events: number[];
  relations: number[];
}

export type SpecTsvResult =
  | { ok: true; rows: SpecTsvRows; lines: SpecTsvLines }
  | { ok: false; errors: FieldError[]; total: number };

const at = (line: number, column: string): string[] => ['text', `line ${line}`, `column ${column}`];

export function parseSpecTsv(text: string): SpecTsvResult {
  const errors: FieldError[] = [];
  let total = 0;
  const seen = new Set<string>();
  const fail = (path: string[], code: string) => {
    total += 1;
    if (errors.length < SPEC_TSV_ERROR_CAP) errors.push({ path, code });
  };
  // One error per cell: nested row issues (a field inside `fields_json`) collapse onto the cell's column.
  const cellFail = (line: number, column: string, code: string) => {
    const key = `${line}:${column}`;
    if (seen.has(key)) return;
    seen.add(key);
    fail(at(line, column), code);
  };

  const lines = (text.startsWith('\uFEFF') ? text.slice(1) : text).split(/\r\n|\r|\n/);
  const headerText = lines.find((l) => l.trim() !== '');
  if (headerText === undefined) return { ok: false, errors: [{ path: ['text'], code: 'required' }], total: 1 };
  const headerNo = lines.indexOf(headerText);
  const headerLine = headerNo + 1;

  const headerCells = headerText.split('\t');
  const position: Partial<Record<SpecTsvColumn, number>> = {};
  for (const [i, raw] of headerCells.entries()) {
    const column = raw.trim();
    if (!KNOWN_COLUMNS.includes(column)) fail(at(headerLine, column), 'unknown_column');
    else if (position[column as SpecTsvColumn] !== undefined) fail(at(headerLine, column), 'duplicate_column');
    else position[column as SpecTsvColumn] = i;
  }
  if (position.kind === undefined) fail(at(headerLine, 'kind'), 'required');
  if (total > 0) return { ok: false, errors, total };

  const rows: SpecTsvRows = { modules: [], events: [], relations: [] };
  const linesOf: SpecTsvLines = { modules: [], events: [], relations: [] };
  let dataRows = 0;
  for (const [i, rawLine] of lines.entries()) {
    if (i <= headerNo || rawLine.trim() === '') continue;
    dataRows += 1;
    if (dataRows > SPEC_ROWS_MAX) return { ok: false, errors: [{ path: ['input'], code: 'too_large' }], total: 1 };

    const line = i + 1;
    const cells = rawLine.split('\t');
    // Trailing empty cells are fine (a padded export); a line is too wide only past what it actually fills.
    let width = cells.length;
    while (width > 0 && (cells[width - 1] ?? '').trim() === '') width -= 1;
    if (width > headerCells.length) {
      fail(['text', `line ${line}`], 'too_many_cells');
      continue;
    }
    const cell = (column: SpecTsvColumn): string => {
      const j = position[column];
      return j === undefined ? '' : (cells[j] ?? '');
    };
    const present = (column: SpecTsvColumn): boolean => cell(column).trim() !== '';

    const kindCell = cell('kind').trim();
    const kindColumns = COLUMNS_OF_KIND[kindCell];
    if (kindCell === '') {
      cellFail(line, 'kind', 'required');
      continue;
    }
    if (kindColumns === undefined) {
      cellFail(line, 'kind', 'unknown_value');
      continue;
    }
    const kind = kindCell as SpecKind; // checked against COLUMNS_OF_KIND just above
    for (const column of Object.keys(position) as SpecTsvColumn[]) {
      if (!kindColumns.includes(column) && present(column)) cellFail(line, column, 'unexpected_value');
    }
    const rowErrors = (error: ZodError) => {
      for (const field of fieldErrors(error)) {
        const column = FIELD_COLUMNS[kind][field.path[0] ?? ''];
        if (column !== undefined) cellFail(line, column, field.code);
      }
    };

    if (kind === 'module') {
      const parsed = SPEC_ROW_SCHEMAS.module.safeParse({
        name: cell('module'),
        ...(present('parent_module') ? { parentModule: cell('parent_module') } : {}),
      });
      if (!parsed.success) {
        rowErrors(parsed.error);
        continue;
      }
      rows.modules.push(parsed.data);
      linesOf.modules.push(line);
    } else if (kind === 'event') {
      let fields: unknown;
      if (present('fields_json')) {
        try {
          fields = JSON.parse(cell('fields_json'));
        } catch {
          fields = null; // reported below, together with every other non-array shape
        }
        if (!Array.isArray(fields)) {
          cellFail(line, 'fields_json', 'malformed');
          continue;
        }
      }
      const parsed = SPEC_ROW_SCHEMAS.event.safeParse({
        module: cell('module'),
        name: cell('event'),
        ...(fields === undefined ? {} : { fields }),
        ...(present('trigger_rule') ? { triggerRule: cell('trigger_rule') } : {}),
        ...(present('detail_doc_ref') ? { detailDocRef: cell('detail_doc_ref') } : {}),
      });
      if (!parsed.success) {
        rowErrors(parsed.error);
        continue;
      }
      rows.events.push(parsed.data);
      linesOf.events.push(line);
    } else {
      const parsed = SPEC_ROW_SCHEMAS.relation.safeParse({
        sourceModule: cell('source_module'),
        sourceEvent: cell('source_event'),
        predicate: cell('predicate'),
        targetModule: cell('target_module'),
        targetEvent: cell('target_event'),
        ...(present('rule_ref') ? { ruleRef: cell('rule_ref') } : {}),
      });
      if (!parsed.success) {
        rowErrors(parsed.error);
        continue;
      }
      rows.relations.push(parsed.data);
      linesOf.relations.push(line);
    }
  }

  return total > 0 ? { ok: false, errors, total } : { ok: true, rows, lines: linesOf };
}

/** The parser as the engine's `validate` step uses it (#1196 b2): nothing to report for rows input or valid text,
 *  at most SPEC_TSV_ERROR_CAP line errors, and a trailing `text:more_errors` when more were found. */
export function specTsvFieldErrors(input: Record<string, unknown>): FieldError[] {
  if (typeof input.text !== 'string') return [];
  const parsed = parseSpecTsv(input.text);
  if (parsed.ok) return [];
  return parsed.total > parsed.errors.length ? [...parsed.errors, { path: ['text'], code: 'more_errors' }] : parsed.errors;
}

/** Planning errors of a text call, renumbered from row indices onto the source lines and columns; errors without
 *  a row index (the call caps) pass through unchanged. */
export function tsvLineErrors(errors: readonly FieldError[], lines: SpecTsvLines): FieldError[] {
  const lineOf = (list: string, index: number): number | undefined => {
    if (list === 'modules') return lines.modules[index];
    if (list === 'events') return lines.events[index];
    if (list === 'relations') return lines.relations[index];
    return undefined;
  };
  return errors.map((error) => {
    const list = error.path[0];
    if (list !== 'modules' && list !== 'events' && list !== 'relations') return error;
    const kind: SpecKind = list === 'modules' ? 'module' : list === 'events' ? 'event' : 'relation';
    const line = lineOf(list, Number(error.path[1]));
    const column = error.path[2] === undefined ? undefined : FIELD_COLUMNS[kind][error.path[2]];
    return line === undefined || column === undefined ? error : { path: at(line, column), code: error.code };
  });
}
