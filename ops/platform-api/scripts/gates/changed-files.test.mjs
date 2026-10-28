import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseChangedFiles } from './changed-files.mjs';

test('pure moves (R100) are excluded', () => {
  assert.deepEqual(parseChangedFiles('R100\told/a.ts\tnew/a.ts'), []);
});

test('moves with edits (R<100), added, copied and modified files are kept under the new path', () => {
  const input = [
    'R087\told/b.ts\tnew/b.ts',
    'A\tc.ts',
    'C075\tc.ts\td.ts',
    'M\te.ts',
    'D\tf.ts',
  ].join('\n');
  assert.deepEqual(parseChangedFiles(input), ['new/b.ts', 'c.ts', 'd.ts', 'e.ts']);
});
