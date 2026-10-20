import assert from 'node:assert/strict';
import test from 'node:test';

import { readAutoAnimatePatch, readWorkspaceBlock } from './sdk-pnpm-config.mjs';

const workspaceYaml = [
  'packages:',
  '  - packages/*',
  'patchedDependencies:',
  '  "@formkit/auto-animate@0.10.1": patches/@formkit__auto-animate@0.10.1.patch',
  'overrides:',
  '  "@tiptap/core": 3.23.5',
  '',
].join('\n');

test('workspace block reader returns only the requested top-level block', () => {
  assert.deepEqual(readWorkspaceBlock(workspaceYaml, 'patchedDependencies'), [
    '  "@formkit/auto-animate@0.10.1": patches/@formkit__auto-animate@0.10.1.patch',
  ]);
});

test('auto-animate patch name, version and path come from patchedDependencies', () => {
  assert.deepEqual(readAutoAnimatePatch(workspaceYaml), {
    id: '@formkit/auto-animate@0.10.1',
    path: 'patches/@formkit__auto-animate@0.10.1.patch',
  });
});

test('auto-animate patch lookup fails clearly if the workspace no longer declares it', () => {
  assert.throws(() => readAutoAnimatePatch('patchedDependencies:\n  "other@1.0.0": patches/other.patch\n'), /no @formkit\/auto-animate patch/);
});
