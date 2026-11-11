import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { parseSampleWindowName, sampleWindowName } from '@eqv/core';
import { expect, it } from 'vitest';

const ev = resolve(process.cwd(), '..');

const COPIES = async () => {
  const onboarding = join(ev, 'fixtures/cluster-single/onboarding');
  const walk = async (dir: string): Promise<string[]> => (await Promise.all((await readdir(dir, { withFileTypes: true }))
    .map(async (entry) => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]))).flat();
  const pairs: [string, string][] = [
    ['fixtures/cluster-single/occurrence-batch.json', 'assets/observations/eq-synth-01/windows/20260101T100000.000_20260101T103000.000_23e9e214b396bfaa4539e7b30c5f8f9163fbac6c50201430231f641ff7c822ba.batch.json'],
    ['fixtures/cluster-single/onboarding/alias-metadata.json', 'assets/observations/eq-synth-01/alias-metadata.json'],
    ['fixtures/cluster-single/layout.json', 'assets/layouts/eq-synth-01-layout/draft.layout.json'],
  ];
  for (const file of await walk(onboarding)) {
    const inside = relative(onboarding, file);
    if (inside !== 'alias-metadata.json') pairs.push([relative(ev, file), `assets/onboarding/${inside}`]);
  }
  return pairs;
};

it.each(['eq-synth-01', 'eq-synth-02'])('names every %s Sample Window file after its content', async (id) => {
  const dir = join(ev, 'assets/observations', id, 'windows');
  const files = await readdir(dir);
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const stem = file.slice(0, -'.batch.json'.length);
    expect(parseSampleWindowName(stem), file).not.toBeNull();
    expect(stem, file).toBe(await sampleWindowName(JSON.parse(await readFile(join(dir, file), 'utf8'))));
  }
});

it('keeps every assets/ seed copy byte-identical to its fixture', async () => {
  const pairs = await COPIES();
  expect(pairs.length).toBe(9);
  for (const [source, copy] of pairs) {
    expect(await readFile(join(ev, copy)), copy).toEqual(await readFile(join(ev, source)));
  }
});
