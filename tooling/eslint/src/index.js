import tsParser from '@typescript-eslint/parser';

import { PACKAGE_PREFIX } from './prefix.js';
import noHandBuiltUrl from './hand-built-url.js';
import noRelativePackageEscape from './relative-escape.js';
import restrictedImportSource from './import-source.js';
import { noMenuMockImport } from './menu-boundaries.js';

const pkg = (name) => `${PACKAGE_PREFIX}${name}`;

const DEEP_SUBPATH_MESSAGE = `Import the package entry (${PACKAGE_PREFIX}name) or, in CSS only, ${PACKAGE_PREFIX}name/styles.css. No ${PACKAGE_PREFIX}*/src.`;
const LAYER_MESSAGE = 'Importing an internal workspace package outside this layer allowlist.';
const MOCK_SERVER_MESSAGE = `${PACKAGE_PREFIX}mock-server is only legal in menu src/mock/**.`;
const REACT_MESSAGE = 'react / react-dom are not allowed in this package.';
// #160: the table engine is components-internal; menus declare columns with the platform types.
const TABLE_ENGINE_MESSAGE = `The table engine belongs to ${PACKAGE_PREFIX}components; menus use the platform column types (PlatformColumn).`;

const MENU_ALLOW = ['contracts', 'kernel', 'components', 'ui'];
// #153 (ADR-0009): the production graph carries no mock. src/main.tsx gets its adapter from `#platform-assembly`
// and sees neither mock-server nor any menu `/mock` subpath; the mock assembly and DevTools live in src/dev/**,
// which is the only app source that registers menu mocks. The server conformance test (#145) registers the same
// mocks, so it keeps mock-server and the `/mock` subpaths (never the FeedbackOps origin slot);
// published-metrics.test.ts keeps mock-server only. No app file outside src/dev/** may import ./dev/**.
const APP_CONFORMANCE_FILE = 'src/server-conformance.test.ts';
const APP_DEV_FILES = 'src/dev/**/*.{ts,tsx}';
const APP_PUBLISHED_METRICS_FILE = 'src/published-metrics.test.ts';
const DEV_MESSAGE = 'src/dev/** (mock assembly, DevTools) is reached only through #platform-assembly in mock builds (ADR-0009).';
// Relative specifiers that name a `dev` folder segment: ./dev, ./dev/x, ../dev/x, ../../src/dev/x.
const DEV_REGEX = '^\\.{1,2}/(?:.*/)?dev(?:/|$)';
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** DEV_REGEX minus the exact `devAllow` specifiers. */
const devRegex = (devAllow = []) =>
  devAllow.length === 0 ? DEV_REGEX : `^(?!(?:${devAllow.map(escapeRegex).join('|')})$)${DEV_REGEX.slice(1)}`;

// Menu subpaths: the FeedbackOps origin slot is src/main.tsx ONLY; each menu's exact `/mock` export is
// src/dev/** only. Every other menu subpath and any `*/src` import stays banned.
// NOTE: the gitignore-style `*` in `menu-*/mock` also matches an empty name (no way to say
// "one or more" here), so a `menu-/mock` source is not rejected on this side; the dynamic-import
// side (import-source.js) uses `[^/]+` for the same pattern.
const MENU_MOCK_SUBPATH = 'menu-*/mock';
const FEEDBACKOPS_ORIGIN_SUBPATH = 'menu-notice-voc/feedbackops-origin';

// Restriction data is the single decision source: each layer declares
// { allow, denyReact, denyTableEngine, mockAllowed, allowSubpaths } and BOTH import rules are built
// from it, so static and dynamic imports can never drift apart.
//   allow: package-entry names this layer may import; null = every entry.
//   mockAllowed: exempts exactly the mock-server entry (never its subpaths).
//   allowSubpaths: exact names or patterns exempted from the deep-subpath ban (default none).
//   denyDev: bans relative imports of a `dev` folder (DEV_REGEX), static and dynamic; devAllow lists exact
//   specifiers exempted from it.
// Deep subpaths are banned for everyone, except subpaths matched by allowSubpaths.
const TABLE_ENGINE_PACKAGES = ['@tanstack/react-table', '@tanstack/react-virtual', '@tanstack/table-core', '@tanstack/virtual-core'];
const MENU_RESTRICTION = { allow: MENU_ALLOW, denyReact: false, denyTableEngine: true, mockAllowed: false };
const MENU_MOCK_RESTRICTION = { allow: ['contracts'], denyReact: true, denyTableEngine: true, mockAllowed: true };
const APP_RESTRICTION = { allow: null, denyReact: false, mockAllowed: false, denyDev: true };
// src/main.tsx is the composition root: only the FeedbackOps origin slot subpath; no mock, no ./dev (#153).
const APP_MAIN_RESTRICTION = { ...APP_RESTRICTION, allowSubpaths: [FEEDBACKOPS_ORIGIN_SUBPATH] };
// The mock assembly and DevTools: mock-server and the menu `/mock` subpaths.
const APP_DEV_RESTRICTION = { allow: null, denyReact: false, mockAllowed: true, allowSubpaths: [MENU_MOCK_SUBPATH] };
// The conformance test: mock-server, and from ./dev only the mock assembly's MOCK_ENDPOINTS list (#153 follow-up —
// one source for "what the app registers"); no menu `/mock` subpath of its own.
const APP_CONFORMANCE_RESTRICTION = { ...APP_RESTRICTION, mockAllowed: true, devAllow: ['./dev/mock-assembly'] };
// published-metrics.test.ts keeps the mock-server exemption but never the menu-subpath allowance.
const APP_PUBLISHED_METRICS_RESTRICTION = { ...APP_RESTRICTION, mockAllowed: true };

function importRestrictions({ allow, denyReact, denyTableEngine, mockAllowed, allowSubpaths = [], denyDev = false, devAllow = [] }) {
  const negations = [
    ...(allow === null ? [] : allow.map((name) => `!${pkg(name)}`)),
    ...(mockAllowed ? [`!${pkg('mock-server')}`] : []),
  ];
  return [
    'error',
    {
      paths: [
        ...(denyReact
          ? [
              { name: 'react', message: REACT_MESSAGE },
              { name: 'react-dom', message: REACT_MESSAGE },
            ]
          : []),
        ...(denyTableEngine ? TABLE_ENGINE_PACKAGES.map((name) => ({ name, message: TABLE_ENGINE_MESSAGE })) : []),
      ],
      patterns: [
        {
          group: [`${PACKAGE_PREFIX}*/*`, `${PACKAGE_PREFIX}*/*/**`, ...allowSubpaths.map((s) => `!${pkg(s)}`)],
          message: DEEP_SUBPATH_MESSAGE,
        },
        ...(allow === null
          ? []
          : [{ group: [`${PACKAGE_PREFIX}*`, ...negations], message: LAYER_MESSAGE }]),
        ...(mockAllowed ? [] : [{ group: [pkg('mock-server'), pkg('mock-server/*')], message: MOCK_SERVER_MESSAGE }]),
        ...(denyReact ? [{ group: ['react/*', 'react-dom/*'], message: REACT_MESSAGE }] : []),
        ...(denyTableEngine ? [{ group: TABLE_ENGINE_PACKAGES.map((name) => `${name}/*`), message: TABLE_ENGINE_MESSAGE }] : []),
        ...(denyDev ? [{ regex: devRegex(devAllow), message: DEV_MESSAGE }] : []),
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
    devRegex: devRegex(restriction.devAllow),
    devMessage: DEV_MESSAGE,
    reactMessage: REACT_MESSAGE,
    tableEngineMessage: TABLE_ENGINE_MESSAGE,
    tableEnginePackages: TABLE_ENGINE_PACKAGES,
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
          'no-menu-mock-import': noMenuMockImport,
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

// Menu: mock-server is limited to src/mock/** (the step-11 removal of src/api.ts and serve, #132);
// contract rules (storage, location writes, hand-built query strings) apply to every menu file.
// Restriction data stays shared by the static and dynamic import rules in each file carve-out.

// Server conformance kit (#145): adapter-agnostic, so it may see only the contracts — never
// mock-server (it must judge a real server the same way) and never React.
/** @type {import('eslint').Linter.Config[]} */
export const serverConformance = [
  layerConfig({ restriction: { allow: ['contracts'], denyReact: true, mockAllowed: false } }),
];

/** @type {import('eslint').Linter.Config[]} */
export const menu = [
  layerConfig({
    restriction: MENU_RESTRICTION,
    extraRules: {
      ...menuContractRules,
      'ap/no-menu-mock-import': 'error',
    },
  }),
  {
    files: ['src/mock/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': importRestrictions(MENU_MOCK_RESTRICTION),
      'ap/restricted-import-source': ['error', importSourceOptions(MENU_MOCK_RESTRICTION)],
    },
  },
];

// App: all package entries allowed, deep subpaths, mock-server and ./dev banned (#153). src/main.tsx keeps only
// the FeedbackOps origin subpath; src/dev/** sees mock-server and the menu `/mock`
// subpaths; the conformance test sees mock-server and ./dev/mock-assembly only; published-metrics.test.ts sees
// mock-server only. Both import rules use the same restriction.
// No ignores for **/*.test.*.
const appOverride = (files, restriction) => ({
  files,
  rules: {
    'no-restricted-imports': importRestrictions(restriction),
    'ap/restricted-import-source': ['error', importSourceOptions(restriction)],
  },
});

/** @type {import('eslint').Linter.Config[]} */
export const app = [
  layerConfig({ restriction: APP_RESTRICTION }),
  appOverride(['src/main.tsx'], APP_MAIN_RESTRICTION),
  appOverride([APP_CONFORMANCE_FILE], APP_CONFORMANCE_RESTRICTION),
  appOverride([APP_PUBLISHED_METRICS_FILE], APP_PUBLISHED_METRICS_RESTRICTION),
  appOverride([APP_DEV_FILES], APP_DEV_RESTRICTION),
];

/** @type {import('eslint').Linter.Config[]} */
export const tooling = [
  layerConfig({ restriction: { allow: [], denyReact: true, mockAllowed: false } }),
];
