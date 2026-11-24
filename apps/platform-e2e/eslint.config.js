import { tooling } from '@ap/eslint-config';

export default [
  ...tooling,
  {
    // #2897: specs take `test` from the same-origin guard so its auto fixture runs in every test.
    files: ['tests/**/*.ts'],
    ignores: ['tests/origin-guard.ts'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "ImportDeclaration[source.value='@playwright/test'] ImportSpecifier[imported.name='test']",
        message: "Import `test` from './origin-guard' (#2897): its fixture fails a test that sends a request to another origin.",
      }],
    },
  },
];
