import { describe, expect, it } from 'vitest';

import {
  IMPORT_MAX_ROWS,
  PASTE_MAX_BYTES,
  PASTE_MAX_ROWS,
  parseImportFile,
  parsePastedText,
  pasteDelimiter,
} from '../domain/import-file.js';
import { modelHeaderFailure } from '../domain/import-headers.js';
import { MenuActionInvalidError } from '../../menu-dispatch/types.js';
import { createSlots } from '../import-admission.js';
import { importIntakeActions } from '../import-intake-actions.js';

const paste = (text: string) => parsePastedText(text, { recognizeHeaders: modelHeaderFailure });
const HEADER = ['설비사명', '모델명', '공정명'];
const sheet = (sep: string, n = 2) =>
  [HEADER.join(sep), ...Array.from({ length: n }, (_, i) => [`M${i}`, `Model ${i}`, 'A, B'].join(sep))].join('\n');

describe('importPaste: delimiter and parse', () => {
  it.each([
    ['tab on the first line', '설비사명\t모델명\n', '\t'],
    ['comma only', '설비사명,모델명\n', ','],
    ['a leading blank line is skipped', '\n\n설비사명\t모델명\n', '\t'],
    ['a BOM before a tab header', '\uFEFF설비사명\t모델명\n', '\t'],
    ['a tab only in a later line does not count', '설비사명,모델명\na\tb\n', ','],
  ])('%s', (_label, text, expected) => {
    expect(pasteDelimiter(text)).toBe(expected);
  });

  it('gives equal rows for pasted TSV, pasted CSV and an uploaded CSV (the same names-only sheet)', async () => {
    const tsv = paste(`${HEADER.join('\t')}\nM0\tModel 0\tA; B\nM1\tModel 1\tC\n`);
    const csvText = `${HEADER.join(',')}\nM0,Model 0,A; B\nM1,Model 1,C\n`;
    const pastedCsv = paste(csvText);
    const uploaded = await parseImportFile(new TextEncoder().encode(csvText), 'x.csv', { recognizeHeaders: modelHeaderFailure });
    expect(tsv).toEqual(pastedCsv);
    expect(pastedCsv).toEqual(uploaded);
  });

  it('keeps a comma inside a tab cell and a quoted newline', () => {
    const r = paste(`${HEADER.join('\t')}\nM0\tModel 0\t"A, B"\n`);
    expect(r.ok && r.rows[0]?.cells['공정명']).toBe('A, B');
  });

  it('strips a BOM', () => {
    const r = paste(`\uFEFF${sheet('\t', 1)}`);
    expect(r.ok && r.headers).toEqual(HEADER);
  });

  it('refuses empty text and text that is only whitespace', () => {
    expect(paste('')).toMatchObject({ ok: false, code: 'empty' });
    expect(paste(' \n\t\n')).toMatchObject({ ok: false, code: 'empty' });
    expect(paste(`${HEADER.join('\t')}\n`)).toMatchObject({ ok: false, code: 'empty' });
  });
});

describe('importPaste: limits', () => {
  it('accepts exactly 256 KiB and refuses one byte more', () => {
    const head = `${HEADER.join('\t')}\n`;
    const fill = (bytes: number) => `${head}M\tModel\t${'x'.repeat(bytes - Buffer.byteLength(head) - 'M\tModel\t'.length)}`;
    const ok = fill(PASTE_MAX_BYTES);
    expect(Buffer.byteLength(ok)).toBe(PASTE_MAX_BYTES);
    expect(paste(ok)).toMatchObject({ ok: true });
    expect(paste(`${ok}x`)).toMatchObject({ ok: false, code: 'file_too_large', status: 413 });
  });

  it('counts UTF-8 bytes, not characters', () => {
    expect(paste(`${HEADER.join('\t')}\nM\tModel\t${'가'.repeat(PASTE_MAX_BYTES / 3)}`)).toMatchObject({ ok: false, code: 'file_too_large' });
  });

  it('accepts 1,000 data rows and refuses 1,001 (an upload keeps 5,000)', () => {
    expect(paste(sheet('\t', PASTE_MAX_ROWS))).toMatchObject({ ok: true });
    expect(paste(sheet('\t', PASTE_MAX_ROWS + 1))).toMatchObject({ ok: false, code: 'too_many_rows' });
    expect(IMPORT_MAX_ROWS).toBe(5000);
  });
});

describe('importPaste: header refusals as field errors', () => {
  const action = importIntakeActions({ db: {} as never, checkService: {} as never }).find((a) => a.spec.id === 'logKnowledge.importPaste');
  const run = async (text: string) => {
    try {
      await action?.handle({} as never, {} as never, { text }, { correlationId: 'c', scopes: [] });
    } catch (error) {
      return error instanceof MenuActionInvalidError ? error.fieldErrors : error;
    }
    return null;
  };

  it('missing_header names the file-level code and each expected header', async () => {
    expect(await run('모델명\nM\n')).toEqual([
      { path: ['text'], code: 'missing_header' },
      { path: ['text', 'headers', '설비사명'], code: 'missing_header' },
    ]);
  });

  it('duplicate_header names the code and each header text that resolves to one field', async () => {
    expect(await run('설비사명\t제조사\t모델명\nA\tB\tC\n')).toEqual([
      { path: ['text'], code: 'duplicate_header' },
      { path: ['text', 'headers', '설비사명'], code: 'duplicate_header' },
      { path: ['text', 'headers', '제조사'], code: 'duplicate_header' },
    ]);
  });

  it.each([
    ['', 'empty'],
    ['설비사명,,모델명\nA,B,C\n', 'invalid_headers'],
    ['설비사명,모델명\nA\n', 'unreadable'],
  ])('refuses %j as %s', async (text, code) => {
    expect(await run(text)).toEqual([{ path: ['text'], code }]);
  });

  it('validates the input shape before the engine runs the handler', () => {
    expect(action?.validate({ text: 5 })).toEqual([{ path: ['text'], code: 'required' }]);
    expect(action?.validate({ text: 'x'.repeat(PASTE_MAX_BYTES + 1) })).toEqual([{ path: ['text'], code: 'file_too_large' }]);
    expect(action?.validate({ text: 'x', sourceName: 3 })).toEqual([{ path: ['sourceName'], code: 'invalid' }]);
    expect(action?.validate({ text: 'x', sourceName: 'a.xlsx' })).toEqual([]);
  });
});

describe('importApply: input shape', () => {
  const action = importIntakeActions({ db: {} as never, checkService: {} as never }).find((a) => a.spec.id === 'logKnowledge.importApply');
  it.each([
    [{ jobId: 'nope', expectedPlanVersion: 1 }, [{ path: ['jobId'], code: 'required' }]],
    [{ jobId: '00000000-0000-4000-8000-000000000000', expectedPlanVersion: 0 }, [{ path: ['expectedPlanVersion'], code: 'invalid' }]],
    [{ jobId: '00000000-0000-4000-8000-000000000000', expectedPlanVersion: 1.5 }, [{ path: ['expectedPlanVersion'], code: 'invalid' }]],
    [{ jobId: '00000000-0000-4000-8000-000000000000', expectedPlanVersion: 2 }, []],
  ])('%j', (input, errors) => {
    expect(action?.validate(input)).toEqual(errors);
  });
});

describe('admission slots', () => {
  it('hands out at most max slots and gives one back once', () => {
    const slots = createSlots(2);
    const a = slots.tryTake();
    const b = slots.tryTake();
    expect(a && b).toBeTruthy();
    expect(slots.tryTake()).toBeNull();
    a?.();
    a?.(); // a second release changes nothing
    expect(slots.tryTake()).not.toBeNull();
    expect(slots.tryTake()).toBeNull();
  });
});
