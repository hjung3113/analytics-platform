import tsParser from '@typescript-eslint/parser';

import { PACKAGE_PREFIX } from './prefix.js';
import noHandBuiltUrl from './hand-built-url.js';
import noRelativePackageEscape from './relative-escape.js';
import restrictedImportSource from './import-source.js';

const pkg = (name) => `${PACKAGE_PREFIX}${name}`;

const DEEP_SUBPATH_MESSAGE = `Import the package entry (${PACKAGE_PREFIX}name) or, in CSS only, ${PACKAGE_PREFIX}name/styles.css. No ${PACKAGE_PREFIX}*/src.`;
const LAYER_MESSAGE = 'Importing an internal workspace package outside this layer allowlist.';
const MOCK_SERVER_MESSAGE = `${PACKAGE_PREFIX}mock-server is only legal in src/api.ts`;
const REACT_MESSAGE = 'react / react-dom are not allowed in this package.';

const MENU_ALLOW = ['contracts', 'kernel', 'components', 'ui'];
const APP_CARVEOUT_FILES = ['src/main.tsx', 'src/dev/**/*.{ts,tsx}', 'src/published-metrics.test.ts'];

// Restriction data is the single decision source: each layer declares
// { allow, denyReact, mockAllowed } and BOTH import rules are built from it,
// so static and dynamic imports can never drift apart.
//   allow: package-entry names this layer may import; null = every entry.
//   mockAllowed: exempts exactly the mock-server entry (never its subpaths).
// Deep subpaths are banned for everyone, including inside carve-outs.
const MENU_RESTRICTION = { allow: MENU_ALLOW, denyReact: false, mockAllowed: false };
const MENU_API_RESTRICTION = { allow: MENU_ALLOW, denyReact: false, mockAllowed: true };
const APP_RESTRICTION = { allow: null, denyReact: false, mockAllowed: false };
const APP_CARVEOUT_RESTRICTION = { allow: null, denyReact: false, mockAllowed: true };

function importRestrictions({ allow, denyReact, mockAllowed }) {
  const negations = [
    ...(allow === null ? [] : allow.map((name) => `!${pkg(name)}`)),
    ...(mockAllowed ? [`!${pkg('mock-server')}`] : []),
  ];
  return [
    'error',
    {
      paths: denyReact
        ? [
            { name: 'react', message: REACT_MESSAGE },
            { name: 'react-dom', message: REACT_MESSAGE },
          ]
        : [],
      patterns: [
        {
          group: [`${PACKAGE_PREFIX}*/*`, `${PACKAGE_PREFIX}*/*/**`],
          message: DEEP_SUBPATH_MESSAGE,
        },
        ...(allow === null
          ? []
          : [{ group: [`${PACKAGE_PREFIX}*`, ...negations], message: LAYER_MESSAGE }]),
        ...(mockAllowed ? [] : [{ group: [pkg('mock-server'), pkg('mock-server/*')], message: MOCK_SERVER_MESSAGE }]),
        ...(denyReact ? [{ group: ['react/*', 'react-dom/*'], message: REACT_MESSAGE }] : []),
      ],
    },
  ];
}

function importSourceOptions(restriction) {
  return {
    ...restriction,
    deepMessage: DEEP_SUBPATH_MESSAGE,
    layerMessage: LAYER_MESSAGE,
    mockMessage: MOCK_SERVER_MESSAGE,
    reactMessage: REACT_MESSAGE,
  };
}

const MENU_STORAGE_MESSAGE = 'Menu code cannot touch web storage; kernel, shell, and components own it.';
const MENU_LOCATION_MESSAGE = 'Menu code cannot write window.location; navigate through the kernel deep-link API.';
const MENU_QUERY_MESSAGE = 'Menu code cannot hand-build a query string in href or navigate; use linkTo().';

// Location-write selectors, with accepted gaps documented:
// - The 3-level member forms exist so `window.location.href = '/x'` and the
//   globalThis equivalents are caught (bare 2-level selectors cannot match them).
// - The call selectors carry [callee.object.optional!=true] so the optional
//   chains `window?.location?.assign(...)` / `globalThis?.location?.assign(...)`
//   stay allowed (accepted gap from 6a-design §4 row 73).
const menuContractSyntax = [
  {
    selector:
      'MemberExpression[object.name=/^(window|globalThis)$/][property.name=/^(localStorage|sessionStorage)$/][computed=false]',
    message: MENU_STORAGE_MESSAGE,
  },
  {
    selector: "AssignmentExpression[left.type='Identifier'][left.name='location']",
    message: MENU_LOCATION_MESSAGE,
  },
  {
    selector: "AssignmentExpression[left.object.name='location']",
    message: MENU_LOCATION_MESSAGE,
  },
  {
    selector: "AssignmentExpression[left.object.name='window'][left.property.name='location']",
    message: MENU_LOCATION_MESSAGE,
  },
  {
    selector:
      "AssignmentExpression[left.object.object.name='window'][left.object.property.name='location']",
    message: MENU_LOCATION_MESSAGE,
  },
  {
    selector: "AssignmentExpression[left.object.name='globalThis'][left.property.name='location']",
    message: MENU_LOCATION_MESSAGE,
  },
  {
    selector:
      "AssignmentExpression[left.object.object.name='globalThis'][left.object.property.name='location']",
    message: MENU_LOCATION_MESSAGE,
  },
  {
    selector:
      "CallExpression[callee.object.name='location'][callee.property.name=/^(assign|replace)$/]",
    message: MENU_LOCATION_MESSAGE,
  },
  {
    selector:
      "CallExpression[callee.object.object.name='window'][callee.object.property.name='location'][callee.object.optional!=true][callee.property.name=/^(assign|replace)$/]",
    message: MENU_LOCATION_MESSAGE,
  },
  {
    selector:
      "CallExpression[callee.object.object.name='globalThis'][callee.object.property.name='location'][callee.object.optional!=true][callee.property.name=/^(assign|replace)$/]",
    message: MENU_LOCATION_MESSAGE,
  },
];

const menuContractRules = {
  'no-restricted-globals': [
    'error',
    { name: 'localStorage', message: MENU_STORAGE_MESSAGE },
    { name: 'sessionStorage', message: MENU_STORAGE_MESSAGE },
  ],
  'no-restricted-syntax': ['error', ...menuContractSyntax],
  // Query strings: structural walk of the URL expression only (6a-review F2
  // replaced six descendant no-restricted-syntax selectors with this rule).
  'ap/no-hand-built-url': ['error', { message: MENU_QUERY_MESSAGE }],
};

function layerConfig({ restriction, extraRules = {} }) {
  return {
    ignores: ['dist/**', 'coverage/**'],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      // ESLint 10 validates languageOptions strictly: parser-owned keys go
      // through parserOptions, so jsx lives here instead of ecmaFeatures.
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      ap: {
        rules: {
          'no-relative-package-escape': noRelativePackageEscape,
          'restricted-import-source': restrictedImportSource,
          'no-hand-built-url': noHandBuiltUrl,
        },
      },
    },
    rules: {
      'ap/no-relative-package-escape': 'error',
      'ap/restricted-import-source': ['error', importSourceOptions(restriction)],
      'no-restricted-imports': importRestrictions(restriction),
      ...extraRules,
    },
  };
}

/** @type {import('eslint').Linter.Config[]} */
export const contracts = [
  layerConfig({ restriction: { allow: [], denyReact: true, mockAllowed: false } }),
];

/** @type {import('eslint').Linter.Config[]} */
export const ui = [layerConfig({ restriction: { allow: [], denyReact: false, mockAllowed: false } })];

/** @type {import('eslint').Linter.Config[]} */
export const kernel = [
  layerConfig({ restriction: { allow: ['contracts'], denyReact: false, mockAllowed: false } }),
];

/** @type {import('eslint').Linter.Config[]} */
export const components = [
  layerConfig({
    restriction: { allow: ['contracts', 'kernel', 'ui'], denyReact: false, mockAllowed: false },
  }),
];

/** @type {import('eslint').Linter.Config[]} */
export const shell = [
  layerConfig({
    restriction: {
      allow: ['contracts', 'kernel', 'ui', 'components'],
      denyReact: false,
      mockAllowed: false,
    },
  }),
];

/** @type {import('eslint').Linter.Config[]} */
export const mockServer = [
  layerConfig({ restriction: { allow: ['contracts'], denyReact: true, mockAllowed: false } }),
];

// Menu: mock-server banned outside src/api.ts; contract rules (storage,
// location writes, hand-built query strings) apply to every menu file.
// src/api.ts keeps the contract rules and swaps the mock-server exemption on
// for both import rules together (flat config replaces each rule id; other
// rules cascade).
/** @type {import('eslint').Linter.Config[]} */
export const menu = [
  layerConfig({ restriction: MENU_RESTRICTION, extraRules: menuContractRules }),
  {
    files: ['src/api.ts'],
    rules: {
      'no-restricted-imports': importRestrictions(MENU_API_RESTRICTION),
      'ap/restricted-import-source': ['error', importSourceOptions(MENU_API_RESTRICTION)],
    },
  },
];

// App: all package entries allowed, deep subpaths and mock-server banned;
// main.tsx / src/dev / published-metrics.test.ts keep the deep-subpath ban
// but drop the mock-server ban for both import rules together. No ignores
// for **/*.test.*.
/** @type {import('eslint').Linter.Config[]} */
export const app = [
  layerConfig({ restriction: APP_RESTRICTION }),
  {
    files: APP_CARVEOUT_FILES,
    rules: {
      'no-restricted-imports': importRestrictions(APP_CARVEOUT_RESTRICTION),
      'ap/restricted-import-source': ['error', importSourceOptions(APP_CARVEOUT_RESTRICTION)],
    },
  },
];

/** @type {import('eslint').Linter.Config[]} */
export const tooling = [
  layerConfig({ restriction: { allow: [], denyReact: true, mockAllowed: false } }),
];
