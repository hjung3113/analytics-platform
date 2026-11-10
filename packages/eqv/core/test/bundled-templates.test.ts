import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { BUNDLED_TEMPLATE_IDS } from '../src/index.js';

const dir = new URL('../../assets/templates/', import.meta.url);

it('lists exactly the Templates of packages/eqv/assets/templates, by document id and file name', () => {
  const files = readdirSync(dir).filter((file) => file.endsWith('.template.json')).sort();
  const ids = files.map((file) => (JSON.parse(readFileSync(new URL(file, dir), 'utf8')) as { id: string }).id);
  expect(files.map((file) => file.slice(0, -'.template.json'.length))).toEqual(ids);
  expect([...BUNDLED_TEMPLATE_IDS].sort()).toEqual(ids);
});
