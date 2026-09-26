import tsParser from '@typescript-eslint/parser';

import { PACKAGE_PREFIX } from './prefix.js';
import noRelativePackageEscape from './relative-escape.js';

const pkg = (name) => `${PACKAGE_PREFIX}${name}`;

const DEEP_SUBPATH_MESSAGE = `Import the package entry (${PACKAGE_PREFIX}name) or, in CSS only, ${PACKAGE_PREFIX}name/styles.css. No ${PACKAGE_PREFIX}*/src.`;
const LAYER_MESSAGE = 'Importing an internal workspace package outside this layer allowlist.';
const MOCK_SERVER_MESSAGE = `${PACKAGE_PREFIX}mock-server is only legal in src/api.ts`;
const REACT_MESSAGE = 'react / react-dom are not allowed in this package.';

const MENU_ALLOW = ['contracts', 'kernel', 'components', 'ui'];
const APP_CARVEOUT_FILES = ['src/main.tsx', 'src/dev/**/*.{ts,tsx}', 'src/published-metrics.test.ts'];

// Universal: deep subpaths are always banned. Layer allowlist: entries only,
// with `!` negations for the packages this layer may import. `*` does not
// cross `/`, so exempting a package never exempts its src subpaths.
const deepSubpathBan = {
  group: [`${PACKAGE_PREFIX}*/*`, `${PACKAGE_PREFIX}*/*/**`],
  message: DEEP_SUBPATH_MESSAGE,
};

const layerAllowlist = (allow) =>
  allow === null
    ? undefined
    : {
        group: [`${PACKAGE_PREFIX}*`, ...allow.map((name) => `!${pkg(name)}`)],
        message: LAYER_MESSAGE,
      };

const mockServerBan = {
  group: [pkg('mock-server'), pkg('mock-server/*')],
  message: MOCK_SERVER_MESSAGE,
};

function importRestrictions({ allow, denyReact, banMockServer }) {
  const allowlist = layerAllowlist(allow);
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
        deepSubpathBan,
        ...(allowlist ? [allowlist] : []),
        ...(banMockServer ? [mockServerBan] : []),
        ...(denyReact ? [{ group: ['react/*', 'react-dom/*'], message: REACT_MESSAGE }] : []),
      ],
    },
  ];
}

const MENU_STORAGE_MESSAGE = 'Menu code cannot touch web storage; kernel, shell, and components own it.';
const MENU_LOCATION_MESSAGE = 'Menu code cannot write window.location; navigate through the kernel deep-link API.';
const MENU_QUERY_MESSAGE = 'Menu code cannot hand-build a query string in href or navigate; use linkTo().';

// Design note vs 6a-design §1: two deviations, both required by the §4 fixture table.
// 1) Added AssignmentExpression[left.object.object.name='window'][left.object.property.name='location']
//    so `window.location.href = '/x'` (row 64) is caught; without it the 3-level
//    member write matches no selector and row 64 would have to pass.
// 2) The window.location.assign/replace selector carries [callee.object.optional!=true]
//    so the optional chain `window?.location?.assign(...)` (row 73, accepted gap) stays allowed.
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
    selector: "JSXAttribute[name.name='href'] Literal[value=/[?&]/]",
    message: MENU_QUERY_MESSAGE,
  },
  {
    selector: "JSXAttribute[name.name='href'] TemplateElement[value.raw=/[?&]/]",
    message: MENU_QUERY_MESSAGE,
  },
  {
    selector: "CallExpression[callee.name='navigate'] Literal[value=/[?&]/]",
    message: MENU_QUERY_MESSAGE,
  },
  {
    selector: "CallExpression[callee.name='navigate'] TemplateElement[value.raw=/[?&]/]",
    message: MENU_QUERY_MESSAGE,
  },
  {
    selector: "CallExpression[callee.property.name='navigate'] Literal[value=/[?&]/]",
    message: MENU_QUERY_MESSAGE,
  },
  {
    selector: "CallExpression[callee.property.name='navigate'] TemplateElement[value.raw=/[?&]/]",
    message: MENU_QUERY_MESSAGE,
  },
];

const menuContractRules = {
  'no-restricted-globals': [
    'error',
    { name: 'localStorage', message: MENU_STORAGE_MESSAGE },
    { name: 'sessionStorage', message: MENU_STORAGE_MESSAGE },
  ],
  'no-restricted-syntax': ['error', ...menuContractSyntax],
};

function layerConfig({ allow, denyReact, banMockServer = false, extraRules = {} }) {
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
      ap: { rules: { 'no-relative-package-escape': noRelativePackageEscape } },
    },
    rules: {
      'ap/no-relative-package-escape': 'error',
      'no-restricted-imports': importRestrictions({ allow, denyReact, banMockServer }),
      ...extraRules,
    },
  };
}

/** @type {import('eslint').Linter.Config[]} */
export const contracts = [layerConfig({ allow: [], denyReact: true })];

/** @type {import('eslint').Linter.Config[]} */
export const ui = [layerConfig({ allow: [], denyReact: false })];

/** @type {import('eslint').Linter.Config[]} */
export const kernel = [layerConfig({ allow: ['contracts'], denyReact: false })];

/** @type {import('eslint').Linter.Config[]} */
export const components = [layerConfig({ allow: ['contracts', 'kernel', 'ui'], denyReact: false })];

/** @type {import('eslint').Linter.Config[]} */
export const shell = [
  layerConfig({ allow: ['contracts', 'kernel', 'ui', 'components'], denyReact: false }),
];

/** @type {import('eslint').Linter.Config[]} */
export const mockServer = [layerConfig({ allow: ['contracts'], denyReact: true })];

// Menu: mock-server banned outside src/api.ts; contract rules (storage,
// location writes, hand-built query strings) apply to every menu file.
// src/api.ts keeps the contract rules and swaps the mock-server ban for an
// allowlist entry (flat config replaces the rule id; other rules cascade).
/** @type {import('eslint').Linter.Config[]} */
export const menu = [
  layerConfig({
    allow: MENU_ALLOW,
    denyReact: false,
    banMockServer: true,
    extraRules: menuContractRules,
  }),
  {
    files: ['src/api.ts'],
    rules: {
      'no-restricted-imports': importRestrictions({
        allow: [...MENU_ALLOW, 'mock-server'],
        denyReact: false,
        banMockServer: false,
      }),
    },
  },
];

// App: all package entries allowed, deep subpaths and mock-server banned;
// main.tsx / src/dev / published-metrics.test.ts keep the deep-subpath ban
// but drop the mock-server ban. No ignores for **/*.test.*.
/** @type {import('eslint').Linter.Config[]} */
export const app = [
  layerConfig({ allow: null, denyReact: false, banMockServer: true }),
  {
    files: APP_CARVEOUT_FILES,
    rules: {
      'no-restricted-imports': importRestrictions({ allow: null, denyReact: false, banMockServer: false }),
    },
  },
];

/** @type {import('eslint').Linter.Config[]} */
export const tooling = [layerConfig({ allow: [], denyReact: true })];
