import assert from 'node:assert/strict';
import test from 'node:test';

import { hasCssSelector, selectCssProbes } from './sdk-css-probes.mjs';

const packageSources = [
  { packageName: 'ui', sourceText: 'const x = { className: "flex gap-4 bg-red-500 max-w-[1600px]" };' },
  { packageName: 'components', sourceText: 'const x = { className: "grid gap-4 rounded-lg" };' },
  { packageName: 'shell', sourceText: 'const x = { className: "sticky h-screen min-w-0" };' },
];

test('CSS probes come from package-only utility classes in built JS', () => {
  const probes = selectCssProbes(packageSources, 2);

  assert.deepEqual(probes, [
    { packageName: 'ui', classNames: ['flex', 'bg-red-500'] },
    { packageName: 'components', classNames: ['grid', 'rounded-lg'] },
    { packageName: 'shell', classNames: ['sticky', 'h-screen'] },
  ]);
});

test('CSS probe selection follows routine class edits without a pinned class name', () => {
  const editedSources = packageSources.map((entry) => ({ ...entry }));
  editedSources[0].sourceText = 'const x = { className: "inline-flex px-3 py-2" };';

  assert.deepEqual(selectCssProbes(editedSources, 2)[0], {
    packageName: 'ui',
    classNames: ['inline-flex', 'px-3'],
  });
});

test('CSS selector matching requires the complete utility class', () => {
  assert.equal(hasCssSelector('.flex{display:flex}.flex-1{flex:1}', 'flex'), true);
  assert.equal(hasCssSelector('.flex-1{flex:1}', 'flex'), false);
});

test('CSS selector matching accepts a combinator or closing parenthesis right after the class (minified Tailwind output)', () => {
  assert.equal(hasCssSelector('.space-y-4>:not(:last-child){margin-block-end:0}', 'space-y-4'), true);
  assert.equal(hasCssSelector(':where(.space-y-4>:not(:last-child)){--tw-space-y-reverse:0}', 'space-y-4'), true);
  assert.equal(hasCssSelector(':where(.divide-x)>.a+.b~.c{x:1}', 'divide-x'), true);
  assert.equal(hasCssSelector('.space-y-4x>:not(:last-child){x:1}', 'space-y-4'), false);
});

test('CSS probe selection reports packages without a unique utility class', () => {
  assert.throws(
    () => selectCssProbes([
      { packageName: 'ui', sourceText: 'const x = { className: "flex gap-2" };' },
      { packageName: 'components', sourceText: 'const x = { className: "flex gap-2" };' },
    ], 1),
    /could not derive a package-only Tailwind utility class for @ap\/ui/,
  );
});
