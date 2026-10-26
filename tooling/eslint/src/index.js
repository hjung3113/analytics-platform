import { plugin as shadcn } from '@shadcn/lint';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

import { PACKAGE_PREFIX } from './prefix.js';
import noHandBuiltUrl from './hand-built-url.js';
import noRelativePackageEscape from './relative-escape.js';
import restrictedImportSource from './import-source.js';
import { noMenuMockImport } from './menu-boundaries.js';
import noShellIdLiteralComparison from './no-shell-id-literal-comparison.js';
import noColorVarShorthand from './no-color-var-shorthand.js';

const pkg = (name) => `${PACKAGE_PREFIX}${name}`;

const DEEP_SUBPATH_MESSAGE = `Import the package entry (${PACKAGE_PREFIX}name) or, in CSS only, ${PACKAGE_PREFIX}name/styles.css. No ${PACKAGE_PREFIX}*/src.`;
const LAYER_MESSAGE = 'Importing an internal workspace package outside this layer allowlist.';
const MOCK_SERVER_MESSAGE = `${PACKAGE_PREFIX}mock-server is only legal in menu src/mock/**.`;
const REACT_MESSAGE = 'react / react-dom are not allowed in this package.';
const FEEDBACKOPS_MESSAGE = `@fops/* is not a platform dependency; the design system lives in ${pkg('ui')} (ADR-0046).`;
// #160: the table engine is components-internal; menus declare columns with the platform types.
// EV's synthetic endpoint data (#801): reaches the app through src/dev/** (the mock assembly) and the conformance test only.
const EQV_MOCK_DATA_PATTERN = '@eqv/*/mock-data';
const EQV_MOCK_DATA_MESSAGE = '@eqv/*/mock-data is synthetic mock data; only src/dev/** and the server conformance test import it (ADR-0009, #801).';
const HTTP_ADAPTER_MESSAGE = `${PACKAGE_PREFIX}http-adapter is imported only by the production assembly in apps/platform-web/src/real/** (#154).`;
// Radix primitives are wrapped once in the design system (ADR-0046); every other layer composes the ui wrappers.
const RADIX_MESSAGE = `@radix-ui/* is wrapped by ${pkg('ui')}; import the ${pkg('ui')} component instead (ADR-0046).`;
const QUERY_ENGINE_MESSAGE = `The query engine is internal to ${PACKAGE_PREFIX}kernel (ADR-0086); read data through the Kernel hooks (useMenuQuery and friends).`;
const TABLE_ENGINE_MESSAGE = `The table engine belongs to ${PACKAGE_PREFIX}components; menus use the platform column types (PlatformColumn).`;

// ADR-0067 (#575): the dock layout engine is components-internal (a lazy chunk behind the components `dock` subpath); that entry is host-only.
const DOCK_ENGINE_PACKAGES = ['dockview', 'dockview-react', 'dockview-core'];
const DOCK_ENGINE_MESSAGE = `The dock layout engine (dockview) belongs to ${PACKAGE_PREFIX}components (ADR-0067); hosts import DockLayout from ${PACKAGE_PREFIX}components/dock.`;
const DOCK_ENTRY_SUBPATH = 'components/dock';
const DOCK_ENTRY_MESSAGE = `${PACKAGE_PREFIX}components/dock is a host-only entry (shell and app); menu and module packages do not import it (ADR-0067).`;
// ADR-0076: the full platform value and the shell-only Providers live on a host-only kernel entry; menus use usePlatform() from the root.
const HOST_ENTRY_SUBPATH = 'kernel/host';
const HOST_ENTRY_MESSAGE = `${PACKAGE_PREFIX}kernel/host is the shell, components and app surface; menus use usePlatform() from ${PACKAGE_PREFIX}kernel (ADR-0076).`;

const MENU_ALLOW = ['contracts', 'kernel', 'components', 'ui'];
// #153 (ADR-0009): the production graph carries no mock. src/main.tsx gets its adapter from `#platform-assembly`
// and sees neither mock-server nor any menu `/mock` subpath; the mock assembly and DevTools live in src/dev/**,
// which is the only app source that registers menu mocks (MOCK_ENDPOINTS). The server conformance test (#145) reads
// that list, so it keeps mock-server and exactly ./dev/mock-assembly — no `/mock` subpath, never the FeedbackOps
// origin slot; published-metrics.test.ts keeps mock-server only. No app file outside src/dev/** may import ./dev/**.
const APP_CONFORMANCE_FILE = 'src/server-conformance.test.ts';
const APP_DEV_FILES = 'src/dev/**/*.{ts,tsx}';
const APP_REAL_FILES = 'src/real/**/*.{ts,tsx}';
const APP_REAL_TEST_FILES = 'src/real/**/*.test.{ts,tsx}';
const APP_PUBLISHED_METRICS_FILE = 'src/published-metrics.test.ts';
const DEV_MESSAGE = 'src/dev/** (mock assembly, DevTools) is reached only through #platform-assembly in mock builds (ADR-0009).';
// Specifiers that name a `dev` folder segment: relative ./dev, ./dev/x, ../dev/x, ../../src/dev/x, and Vite's
// root-absolute /src/dev/x. Matched case-insensitively by both rules (ESLint's `regex` uses the `i` flag).
// `import.meta.glob('./dev/*')` is not an import source — only the production-graph check catches it.
const DEV_REGEX = '^(?:\\.{1,2}/(?:.*/)?|/src/)dev(?:/|$)';
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** DEV_REGEX minus the exact `devAllow` specifiers. */
const devRegex = (devAllow = []) =>
  devAllow.length === 0 ? DEV_REGEX : `^(?!(?:${devAllow.map(escapeRegex).join('|')})$)${DEV_REGEX.slice(1)}`;

// Menu subpaths: the FeedbackOps origin slot is src/main.tsx ONLY, and so are the fo-bridge package slot subpaths (the FO API slot fo-api and the notifications, VOC compose and home todo slots); each menu's exact `/mock` export is
// src/dev/** only. Every other menu subpath and any `*/src` import stays banned.
// NOTE: the gitignore-style `*` in `menu-*/mock` also matches an empty name (no way to say
// "one or more" here), so a `menu-/mock` source is not rejected on this side; the dynamic-import
// side (import-source.js) uses `[^/]+` for the same pattern.
const MENU_MOCK_SUBPATH = 'menu-*/mock';
const FO_API_SUBPATH = 'fo-bridge/fo-api';
const NOTIFICATIONS_SLOT_SUBPATH = 'fo-bridge/notifications-slot';
const VOC_COMPOSE_SLOT_SUBPATH = 'fo-bridge/voc-compose-slot';
const HOME_TODO_SLOT_SUBPATH = 'fo-bridge/home-todo-slot';
const SCOPE_CONTROL_SLOT_SUBPATH = 'fo-bridge/scope-control';
const NAV_COUNTS_SLOT_SUBPATH = 'fo-bridge/nav-counts';
const SAVED_VIEWS_SLOT_SUBPATH = 'fo-bridge/saved-views';
// Rule 8 exception (platform ADR-0071, ADR-0081): a bridge menu imports exactly these entries (the screen barrel, its eager-code subset `/core`,
// the lazy notifications panel entry `/inbox-panel`, and the operator dashboard and VOC entries); nothing else under @fops/*. the fo-bridge package imports `/core` only (FO_BRIDGE_PACKAGE_ENTRIES)
// except its lazy `src/pages/**`, which are screens too (the notifications slot loads `inbox-panel` through one of them).
const FO_BRIDGE_ENTRIES = ['@fops/frontend/global-screens', '@fops/frontend/global-screens/core', '@fops/frontend/global-screens/inbox-panel', '@fops/frontend/operator-screens/scope-picker', '@fops/frontend/operator-screens/dashboard', '@fops/frontend/operator-screens/voc-clusters', '@fops/frontend/operator-screens/task-detail', '@fops/frontend/operator-screens/voc-detail', '@fops/frontend/operator-screens/voc-inbox', '@fops/frontend/operator-screens/milestones', '@fops/frontend/operator-screens/voc-search', '@fops/frontend/operator-screens/tasks-search', '@fops/frontend/operator-screens/voc-triage', '@fops/frontend/operator-screens/task-list', '@fops/frontend/operator-screens/task-board', '@fops/frontend/operator-screens/task-requests', '@fops/frontend/operator-screens/findings-search', '@fops/frontend/operator-screens/integration-search'];
const FO_BRIDGE_TEST_SUBPATHS = [FO_API_SUBPATH, NOTIFICATIONS_SLOT_SUBPATH, VOC_COMPOSE_SLOT_SUBPATH, HOME_TODO_SLOT_SUBPATH, SCOPE_CONTROL_SLOT_SUBPATH, NAV_COUNTS_SLOT_SUBPATH, SAVED_VIEWS_SLOT_SUBPATH, 'fo-bridge/home-todo-page', 'fo-bridge/voc-compose-page'];
const FO_BRIDGE_PACKAGE_ENTRIES = ['@fops/frontend/global-screens/core'];
const UI_THEME_SUBPATHS = ['ui/theme', 'ui/theme-tokens.json'];

// Restriction data is the single decision source: each layer declares
// { allow, denyReact, denyTableEngine, mockAllowed, allowSubpaths } and BOTH import rules are built
// from it, so static and dynamic imports can never drift apart.
//   allow: package-entry names this layer may import; null = every entry.
//   mockAllowed: exempts exactly the mock-server entry (never its subpaths).
//   allowSubpaths: exact names or patterns exempted from the deep-subpath ban (default none).
//   allowDockEngine: exempts the dock layout engine packages (components only; every other layer bans them, ADR-0067).
//   denyQueryEngine: bans the Kernel's query engine (@tanstack/react-query); only kernel and the FeedbackOps bridge package import it.
//   denyDev: bans relative imports of a `dev` folder (DEV_REGEX), static and dynamic; devAllow lists exact
//   specifiers exempted from it.
// Deep subpaths are banned for everyone, except subpaths matched by allowSubpaths.
// The Kernel's query engine: only kernel and the FeedbackOps bridge (its own client, ADR-0071) import it.
const QUERY_ENGINE_PACKAGES = ['@tanstack/react-query', '@tanstack/query-core'];
const TABLE_ENGINE_PACKAGES = ['@tanstack/react-table', '@tanstack/react-virtual', '@tanstack/table-core', '@tanstack/virtual-core'];
const MENU_RESTRICTION = { allow: MENU_ALLOW, denyReact: false, denyTableEngine: true, denyQueryEngine: true, mockAllowed: false, allowSubpaths: UI_THEME_SUBPATHS };
// allowFeedbackOps: exact @fops/* sources exempted from the FeedbackOps ban (only the bridge menu, FO_BRIDGE_ENTRIES).
const FO_BRIDGE_RESTRICTION = { ...MENU_RESTRICTION, allow: [...MENU_ALLOW, 'fo-bridge'], allowFeedbackOps: FO_BRIDGE_ENTRIES };
// The fo-bridge package (consumer-side runtime, not SDK): the menu layer's workspace allowlist, `/core` only; its lazy pages see the screen barrel.
const FO_BRIDGE_PACKAGE_RESTRICTION = { ...MENU_RESTRICTION, denyQueryEngine: false, allowFeedbackOps: FO_BRIDGE_PACKAGE_ENTRIES };
const FO_BRIDGE_PAGES_RESTRICTION = { ...FO_BRIDGE_PACKAGE_RESTRICTION, denyQueryEngine: false, allowFeedbackOps: FO_BRIDGE_ENTRIES };
const MENU_MOCK_RESTRICTION = { allow: ['contracts'], denyReact: true, denyTableEngine: true, denyQueryEngine: true, mockAllowed: true };
// #154: the real-server adapter reaches the app through src/real/** only (APP_REAL_FILES below).
const APP_RESTRICTION = { allow: null, denyReact: false, denyQueryEngine: true, mockAllowed: false, denyDev: true, denyHttpAdapter: true, denyEqvMockData: true, allowSubpaths: [...UI_THEME_SUBPATHS, DOCK_ENTRY_SUBPATH, HOST_ENTRY_SUBPATH] };
// src/main.tsx is the composition root: only the FeedbackOps origin, FO API and notifications slot subpaths; no mock, no ./dev (#153).
const APP_REAL_RESTRICTION = { ...APP_RESTRICTION, denyHttpAdapter: false };
const APP_MAIN_RESTRICTION = { ...APP_RESTRICTION, allowSubpaths: [...UI_THEME_SUBPATHS, DOCK_ENTRY_SUBPATH, HOST_ENTRY_SUBPATH, FO_API_SUBPATH, NOTIFICATIONS_SLOT_SUBPATH, VOC_COMPOSE_SLOT_SUBPATH, HOME_TODO_SLOT_SUBPATH, SCOPE_CONTROL_SLOT_SUBPATH, NAV_COUNTS_SLOT_SUBPATH, SAVED_VIEWS_SLOT_SUBPATH] };
// The mock assembly and DevTools: mock-server and the menu `/mock` subpaths.
const APP_DEV_RESTRICTION = { allow: null, denyReact: false, denyQueryEngine: true, mockAllowed: true, denyHttpAdapter: true, denyEqvMockData: false, allowSubpaths: [...UI_THEME_SUBPATHS, MENU_MOCK_SUBPATH] };
// The conformance test: mock-server, and from ./dev only the mock assembly's MOCK_ENDPOINTS list (#153 follow-up —
// one source for "what the app registers"); no menu `/mock` subpath of its own.
const APP_CONFORMANCE_RESTRICTION = { ...APP_RESTRICTION, mockAllowed: true, denyEqvMockData: false, devAllow: ['./dev/mock-assembly'] };
// published-metrics.test.ts keeps the mock-server exemption but never the menu-subpath allowance.
const APP_PUBLISHED_METRICS_RESTRICTION = { ...APP_RESTRICTION, mockAllowed: true };

function importRestrictions({ allow, denyReact, denyTableEngine, denyQueryEngine = false, mockAllowed, allowSubpaths = [], denyDev = false, devAllow = [], denyHttpAdapter = false, denyEqvMockData = false, allowDockEngine = false, allowRadix = false, allowFeedbackOps = [] }) {
  const negations = [
    ...(allow === null ? [] : allow.map((name) => `!${pkg(name)}`)),
    ...(mockAllowed ? [`!${pkg('mock-server')}`] : []),
  ];
  // A gitignore-style `!source` cannot re-include a source whose parent `@fops/<pkg>` the first glob already ignores,
  // so a layer with exact exemptions uses a negative-lookahead regex instead.
  const feedbackOpsPatterns = allowFeedbackOps.length === 0
    ? [{ group: ['@fops/*', '@fops/*/*', '@fops/*/*/**'], message: FEEDBACKOPS_MESSAGE }]
    : [{ regex: `^@fops/(?!(?:${allowFeedbackOps.map((source) => escapeRegex(source.slice('@fops/'.length))).join('|')})$)`, message: FEEDBACKOPS_MESSAGE }];
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
        ...(denyQueryEngine ? QUERY_ENGINE_PACKAGES.map((name) => ({ name, message: QUERY_ENGINE_MESSAGE })) : []),
        ...(allowDockEngine ? [] : DOCK_ENGINE_PACKAGES.map((name) => ({ name, message: DOCK_ENGINE_MESSAGE }))),
      ],
      patterns: [
        ...feedbackOpsPatterns,
        // First, so a layer that may not import the host-only entry gets its own message instead of the generic deep-subpath one.
        ...(allowSubpaths.includes(DOCK_ENTRY_SUBPATH) ? [] : [{ group: [pkg(DOCK_ENTRY_SUBPATH)], message: DOCK_ENTRY_MESSAGE }]),
        ...(allowSubpaths.includes(HOST_ENTRY_SUBPATH) ? [] : [{ group: [pkg(HOST_ENTRY_SUBPATH)], message: HOST_ENTRY_MESSAGE }]),
        {
          group: [`${PACKAGE_PREFIX}*/*`, `${PACKAGE_PREFIX}*/*/**`, ...allowSubpaths.map((s) => `!${pkg(s)}`)],
          message: DEEP_SUBPATH_MESSAGE,
        },
        ...(allow === null
          ? []
          : [{ group: [`${PACKAGE_PREFIX}*`, ...negations], message: LAYER_MESSAGE }]),
        ...(mockAllowed ? [] : [{ group: [pkg('mock-server'), pkg('mock-server/*')], message: MOCK_SERVER_MESSAGE }]),
        ...(denyHttpAdapter ? [{ group: [pkg('http-adapter')], message: HTTP_ADAPTER_MESSAGE }] : []),
        ...(denyEqvMockData ? [{ group: [EQV_MOCK_DATA_PATTERN, `${EQV_MOCK_DATA_PATTERN}/**`], message: EQV_MOCK_DATA_MESSAGE }] : []),
        ...(denyReact ? [{ group: ['react/*', 'react-dom/*'], message: REACT_MESSAGE }] : []),
        ...(denyTableEngine ? [{ group: TABLE_ENGINE_PACKAGES.map((name) => `${name}/*`), message: TABLE_ENGINE_MESSAGE }] : []),
        ...(denyQueryEngine ? [{ group: QUERY_ENGINE_PACKAGES.map((name) => `${name}/*`), message: QUERY_ENGINE_MESSAGE }] : []),
        ...(allowDockEngine ? [] : [{ group: DOCK_ENGINE_PACKAGES.map((name) => `${name}/*`), message: DOCK_ENGINE_MESSAGE }]),
        ...(allowRadix ? [] : [{ group: ['@radix-ui/*', '@radix-ui/*/**'], message: RADIX_MESSAGE }]),
        ...(denyDev ? [{ regex: devRegex(devAllow), message: DEV_MESSAGE }] : []),
      ],
    },
  ];
}

// ADR-0040 (#381): the kernel `testing` subpath is the one public test entry; #413 adds `components/testing` for the layers
// above components. Test files and test-tooling files get them as extra allowed subpaths on top of their layer restriction;
// production configs never do, so a production import fails. The components preset itself gets `kernel/testing` only (its
// own tests import `./testing`).
const TEST_ENTRY_SUBPATH = 'kernel/testing';
const COMPONENTS_TEST_ENTRY_SUBPATH = 'components/testing';
const TEST_ENTRY_FILES = ['**/*.test.{ts,tsx}', '**/test-support.{ts,tsx}', '**/test-setup.ts'];
const testEntryOverride = (restriction, subpaths = [TEST_ENTRY_SUBPATH]) => {
  const withEntry = { ...restriction, allowSubpaths: [...(restriction.allowSubpaths ?? []), ...subpaths] };
  return {
    files: TEST_ENTRY_FILES,
    rules: {
      'no-restricted-imports': importRestrictions(withEntry),
      'ap/restricted-import-source': ['error', importSourceOptions(withEntry)],
    },
  };
};

function importSourceOptions(restriction) {
  return {
    ...restriction,
    deepMessage: DEEP_SUBPATH_MESSAGE,
    layerMessage: LAYER_MESSAGE,
    mockMessage: MOCK_SERVER_MESSAGE,
    httpAdapterMessage: HTTP_ADAPTER_MESSAGE,
    eqvMockDataMessage: EQV_MOCK_DATA_MESSAGE,
    devRegex: devRegex(restriction.devAllow),
    devMessage: DEV_MESSAGE,
    reactMessage: REACT_MESSAGE,
    tableEngineMessage: TABLE_ENGINE_MESSAGE,
    tableEnginePackages: TABLE_ENGINE_PACKAGES,
    queryEngineMessage: QUERY_ENGINE_MESSAGE,
    queryEnginePackages: QUERY_ENGINE_PACKAGES,
    denyDockEngine: !restriction.allowDockEngine,
    dockEnginePackages: DOCK_ENGINE_PACKAGES,
    dockEngineMessage: DOCK_ENGINE_MESSAGE,
    hostOnlyMessages: { [DOCK_ENTRY_SUBPATH]: DOCK_ENTRY_MESSAGE, [HOST_ENTRY_SUBPATH]: HOST_ENTRY_MESSAGE },
    feedbackOpsMessage: FEEDBACKOPS_MESSAGE,
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
    // A disable comment that no longer suppresses anything is an error, so stale exceptions cannot pile up.
    linterOptions: { reportUnusedDisableDirectives: 'error' },
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
          'no-shell-id-literal-comparison': noShellIdLiteralComparison,
          'no-color-var-shorthand': noColorVarShorthand,
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

// #228: design-system rules (@shadcn/lint) for packages that render UI. The theme is the app's Tailwind entry,
// named by the root components.json; components are the ui primitives and the shared components. Every rule is an
// error. There are no suppression files (removed in #236/#241): an exception is an inline eslint-disable-next-line with
// its reason, and an unused one fails (reportUnusedDisableDirectives). Class strings in .ts files are checked too.
// The options mirror FeedbackOps' .oxlintrc.json (FO ADR-0062), the source of the shared design system:
// screens may add layout to a component, containers also spacing, and the 50px headers never a height. The last
// matching contract wins.
const RESTYLE_CONTRACTS = [
  {
    pattern: '^(Card|EmptyState|PanelTitleBlock|ListToolbar)$|(Content|Header|Footer|Group|Panel|List|SectionTitle)$',
    allow: ['layout', 'spacing'],
  },
  {
    pattern:
      '^(TabsList|ToggleGroup|RadioGroup|DialogFooter|AlertDialogFooter|TooltipContent|SelectContent|DropdownMenuContent|DropdownMenuSubContent|PopoverContent|HoverCardContent)$',
    allow: ['layout'],
  },
  {
    pattern: '^(DetailPanelHeader|ShellHeader|ListToolbar)$',
    allow: ['layout', 'spacing'],
    deny: ['h-*', 'min-h-*', 'max-h-*', 'size-*'],
  },
  // Platform accessibility floor (ADR-0023), on top of the FeedbackOps contracts: control boundaries keep the
  // >=3:1 border-control, buttons that use aria-disabled (to keep focus for Radix) keep a disabled look, and menu items
  // keep a keyboard focus ring (the FeedbackOps focus tint is ~1.1:1 on the popover surface).
  { pattern: '^(Input|SelectTrigger|Checkbox)$', allow: ['layout', 'border-border-control'] },
  {
    pattern: '^DropdownMenu(Item|RadioItem|CheckboxItem)$',
    allow: ['layout', 'focus-visible:ring-2', 'focus-visible:ring-inset', 'focus-visible:ring-focus-ring'],
  },
  {
    pattern: '^Button$',
    allow: ['layout', 'aria-disabled:opacity-50', 'aria-disabled:pointer-events-none', 'aria-disabled:cursor-not-allowed',
      // The dim must not fade the focus ring itself (DESIGN Shared interaction: opaque focus, #301 FIX1).
      'aria-disabled:focus-visible:opacity-100'],
  },
];
const DESIGN_SYSTEM_RULES = {
  'shadcn/no-restyle': ['error', { allow: ['layout'], contracts: RESTYLE_CONTRACTS }],
  'shadcn/no-raw-colors': ['error', { scanAllStrings: true }],
  'shadcn/no-arbitrary-values': ['error', { allow: ['layout'], scanAllStrings: true }],
  'shadcn/no-inline-styles': 'error',
  'shadcn/no-unknown-classes': 'error',
  'shadcn/require-static-classes': 'error',
  'ap/no-color-var-shorthand': 'error',
};
// Where the primitives are defined (the ui package) they style themselves, as in FeedbackOps packages/ui: no restyle
// or static-class check; arbitrary layout values stay allowed.
const COMPONENT_SOURCE_RULES = {
  ...DESIGN_SYSTEM_RULES,
  'shadcn/no-restyle': 'off',
  'shadcn/require-static-classes': 'off',
};
/** @param {{ componentSource?: boolean }} [options] componentSource: true where the components themselves are defined. */
const designSystem = ({ componentSource = false } = {}) => ({
  files: ['**/*.{ts,tsx}'],
  // Generated token tables list token names, not class strings.
  ignores: ['**/*.test.{ts,tsx}', '**/*.generated.ts'],
  plugins: { shadcn },
  settings: {
    shadcn: {
      componentImports: [`^${pkg('ui')}(/|$)`, `^${pkg('components')}(/|$)`],
      note: 'Visual rules: DESIGN.md. Shared components: docs/06_platform_ui_contract.md §13. New tokens go in packages/ui/src/styles (platform extension layer: DESIGN.md).',
    },
  },
  rules: componentSource ? COMPONENT_SOURCE_RULES : DESIGN_SYSTEM_RULES,
});

// React layers: the Rules of Hooks are an error; a missing effect dependency is an error too. An intended omission gets a
// next-line disable comment that states its reason (review follow-up 2026-10-22).
const REACT_HOOKS = {
  files: ['**/*.{ts,tsx}'],
  plugins: { 'react-hooks': reactHooks },
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'error',
  },
};

// Build output (the SDK release `dist`, ADR-0056) is emitted code with source comments copied in; a config object that holds
// only `ignores` is global, so no rule and no inline directive of the emitted files is evaluated.
const BUILD_OUTPUT = { ignores: ['dist/**'] };

/** @type {import('eslint').Linter.Config[]} */
export const contracts = [
  BUILD_OUTPUT,
  layerConfig({ restriction: { allow: [], denyReact: true, mockAllowed: false } }),
];

/** @type {import('eslint').Linter.Config[]} */
export const ui = [
  REACT_HOOKS,
  BUILD_OUTPUT,
  layerConfig({ restriction: { allow: [], denyReact: false, mockAllowed: false, allowRadix: true } }),
  designSystem({ componentSource: true }),
];

/** @type {import('eslint').Linter.Config[]} */
export const kernel = [
  REACT_HOOKS,
  BUILD_OUTPUT,
  layerConfig({ restriction: { allow: ['contracts'], denyReact: false, mockAllowed: false } }),
];

const COMPONENTS_RESTRICTION = { allow: ['contracts', 'kernel', 'ui'], denyReact: false, denyQueryEngine: true, mockAllowed: false, allowSubpaths: [...UI_THEME_SUBPATHS, HOST_ENTRY_SUBPATH], allowDockEngine: true };
const ABOVE_COMPONENTS_TEST_ENTRIES = [TEST_ENTRY_SUBPATH, COMPONENTS_TEST_ENTRY_SUBPATH];
const SHELL_RESTRICTION = { allow: ['contracts', 'kernel', 'ui', 'components'], denyReact: false, denyQueryEngine: true, mockAllowed: false, allowSubpaths: [...UI_THEME_SUBPATHS, DOCK_ENTRY_SUBPATH, HOST_ENTRY_SUBPATH] };

/** @type {import('eslint').Linter.Config[]} */
export const components = [
  REACT_HOOKS,
  BUILD_OUTPUT,
  layerConfig({ restriction: COMPONENTS_RESTRICTION }),
  testEntryOverride(COMPONENTS_RESTRICTION),
  // Shared components are assembled from ui primitives (06 §13) and may not restyle them; their own markup is not a
  // design-system component here (relative imports never match componentImports), so it styles freely with tokens.
  designSystem(),
];

/** @type {import('eslint').Linter.Config[]} */
export const shell = [
  REACT_HOOKS,
  BUILD_OUTPUT,
  layerConfig({
    restriction: SHELL_RESTRICTION,
    extraRules: { 'ap/no-shell-id-literal-comparison': 'error' },
  }),
  testEntryOverride(SHELL_RESTRICTION, ABOVE_COMPONENTS_TEST_ENTRIES),
  designSystem(),
];

/** @type {import('eslint').Linter.Config[]} */
export const httpAdapter = [
  layerConfig({ restriction: { allow: ['contracts'], denyReact: true, mockAllowed: false } }),
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

// Module package (ADR-0053): lives in another repository, sees only the host contract and the SDK UI (with its
// CSS subpaths). Never kernel, shell, components, menus or mock-server. Not applied to a package in this repo yet.
const HOST_MODULE_RESTRICTION = {
  allow: ['contracts', 'ui'],
  denyReact: false,
  mockAllowed: false,
  // gitignore semantics: a file under styles/ is re-included only when its directory is too.
  allowSubpaths: [...UI_THEME_SUBPATHS, 'ui/styles.css', 'ui/styles', 'ui/styles/*.css'],
};

/** @type {import('eslint').Linter.Config[]} */
export const hostModule = [
  // The module keeps its own package scope, so relative imports are checked against its nearest package root.
  layerConfig({ restriction: HOST_MODULE_RESTRICTION, extraRules: { 'ap/no-relative-package-escape': ['error', { anyPackageName: true }] } }),
];

/**
 * hostModule for one directory of a package that is not its own package (a fixture module): the directory is the
 * boundary, so a relative import may not leave it, and kernel, components and shell files stay out of reach.
 * Appended after a layer preset, which already registers the `ap` plugin.
 * @param {string} dir directory relative to the lint cwd, no trailing slash
 * @type {(dir: string) => import('eslint').Linter.Config[]}
 */
export const hostModuleDir = (dir) => hostModule.map(({ plugins: _ap, ...config }) => ({
  ...config,
  files: [`${dir}/**/*.{ts,tsx}`],
  rules: { ...config.rules, 'ap/no-relative-package-escape': ['error', { root: dir }] },
}));

const menuMockOverride = {
  files: ['src/mock/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': importRestrictions(MENU_MOCK_RESTRICTION),
    'ap/restricted-import-source': ['error', importSourceOptions(MENU_MOCK_RESTRICTION)],
  },
};

const menuPreset = (restriction) => [
  REACT_HOOKS,
  layerConfig({
    restriction,
    extraRules: {
      ...menuContractRules,
      'ap/no-menu-mock-import': 'error',
    },
  }),
  testEntryOverride(restriction, ABOVE_COMPONENTS_TEST_ENTRIES),
  menuMockOverride,
  designSystem(),
];

/** @type {import('eslint').Linter.Config[]} */
export const menu = menuPreset(MENU_RESTRICTION);

/**
 * `menu` plus the one FeedbackOps entry the bridge menu (menu-my-activity) may import (platform ADR-0071).
 * @type {import('eslint').Linter.Config[]}
 */
export const foBridgeMenu = [
  ...menuPreset(FO_BRIDGE_RESTRICTION),
  // The bridge menu's integration tests drive the bridge slots and lazy pages directly; production files see the bridge root only.
  testEntryOverride(FO_BRIDGE_RESTRICTION, [...ABOVE_COMPONENTS_TEST_ENTRIES, ...FO_BRIDGE_TEST_SUBPATHS]),
  // Last, so the mock policy (contracts + mock-server only) also wins for tests under src/mock/**.
  menuMockOverride,
];

/**
 * The FeedbackOps bridge runtime package (the fo-bridge package, ADR-0071, ADR-0081): menu-layer imports, `/core` only,
 * and `src/pages/**` (lazy chunks) may also import the screen barrel. Menu contract rules do not apply (no manifests here).
 * @type {import('eslint').Linter.Config[]}
 */
export const foBridge = [
  REACT_HOOKS,
  layerConfig({ restriction: FO_BRIDGE_PACKAGE_RESTRICTION, extraRules: menuContractRules }),
  // Its tests mount a platform with the kernel fixtures (ADR-0040); production files stay restricted.
  testEntryOverride(FO_BRIDGE_PACKAGE_RESTRICTION),
  {
    files: ['src/pages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': importRestrictions(FO_BRIDGE_PAGES_RESTRICTION),
      'ap/restricted-import-source': ['error', importSourceOptions(FO_BRIDGE_PAGES_RESTRICTION)],
    },
  },
  designSystem(),
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
  REACT_HOOKS,
  layerConfig({ restriction: APP_RESTRICTION }),
  testEntryOverride(APP_RESTRICTION, ABOVE_COMPONENTS_TEST_ENTRIES),
  appOverride(['src/main.tsx'], APP_MAIN_RESTRICTION),
  appOverride([APP_CONFORMANCE_FILE], APP_CONFORMANCE_RESTRICTION),
  appOverride([APP_PUBLISHED_METRICS_FILE], APP_PUBLISHED_METRICS_RESTRICTION),
  appOverride([APP_DEV_FILES], APP_DEV_RESTRICTION),
  // The production assembly (and its tests) is the one app place that sees the http-adapter package. Last, so it wins over
  // the test-entry override for src/real/**/*.test.*; the test files keep the test entry subpaths.
  appOverride([APP_REAL_FILES], APP_REAL_RESTRICTION),
  appOverride([APP_REAL_TEST_FILES], { ...APP_REAL_RESTRICTION, allowSubpaths: [...APP_REAL_RESTRICTION.allowSubpaths, ...ABOVE_COMPONENTS_TEST_ENTRIES] }),
  designSystem(),
];

/** @type {import('eslint').Linter.Config[]} */
export const tooling = [
  layerConfig({ restriction: { allow: [], denyReact: true, mockAllowed: false } }),
];
