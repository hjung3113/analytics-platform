import { plugin as shadcn } from '@shadcn/lint';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

import { PACKAGE_PREFIX } from './prefix.js';
import { FEATURE_PACKAGES } from './feature-packages.js';
import { featureBridgeEntrySources } from './feature-bridge-entries.js';
import { EQV_PACKAGES, EQV_UI_PACKAGE } from './eqv-packages.js';
import noHandBuiltUrl from './hand-built-url.js';
import noRelativePackageEscape from './relative-escape.js';
import restrictedImportSource from './import-source.js';
import { noMenuMockImport } from './menu-boundaries.js';
import noShellIdLiteralComparison from './no-shell-id-literal-comparison.js';
import noLangCopyTernary from './no-lang-copy-ternary.js';
import noColorVarShorthand from './no-color-var-shorthand.js';
import noBrowserRandomUuid from './no-browser-random-uuid.js';
import requireApiPath from './require-api-path.js';
import { featureServer, featureShared, featureUi, featureScreenPaths } from './feature.js';

const pkg = (name) => `${PACKAGE_PREFIX}${name}`;

const DEEP_SUBPATH_MESSAGE = `Import the package entry (${PACKAGE_PREFIX}name) or, in CSS only, ${PACKAGE_PREFIX}name/styles.css. No ${PACKAGE_PREFIX}*/src.`;
const LAYER_MESSAGE = 'Importing an internal workspace package outside this layer allowlist.';
const MOCK_SERVER_MESSAGE = `${PACKAGE_PREFIX}mock-server is only legal in menu src/mock/**.`;
const REACT_MESSAGE = 'react / react-dom are not allowed in this package.';
const FEATURE_MESSAGE = `Feature server/screens/shared/UI/ops are consumer dependencies; the design system lives in ${pkg('ui')} (ADR-0046).`;
// #160: the table engine is components-internal; menus declare columns with the platform types.
// EV packages are imported only by EV's own two menus and by other EV packages; the app reaches the viewer through the menu package (ADR-0132, #1659).
const EQV_MESSAGE = `Platform and other menus learn nothing about equipment: only EV's own menus (${pkg('menu-topview')}, ${pkg('menu-topview-studio')}) and EV packages import @eqv/*; the app reaches the viewer through ${pkg('menu-topview')} (ADR-0132).`;
// #1654, #1659: the two menus that are EV's own (menus/tools/topview-studio, menus/tools/topview) import exactly these entries; every other menu stays under EQV_MESSAGE.
const EQV_MENU_ENTRIES = ['@eqv/core', '@eqv/renderer', '@eqv/replay', '@eqv/views', '@eqv/editor', '@eqv/ui'];
const EQV_MENU_MESSAGE = `Only EV's own menus (${pkg('menu-topview-studio')} and ${pkg('menu-topview')}) import exactly @eqv/core, @eqv/renderer, @eqv/replay, @eqv/views, @eqv/editor and @eqv/ui (ADR-0132); no other @eqv/* entry or subpath, and nothing under src/mock/**.`;
const EQV_CORE_MESSAGE = 'EV core and renderer are design-system-free and platform-free: they import no @eqv package except @eqv/core (never @eqv/ui) (ADR-0132).';
const EQV_UI_MESSAGE = 'EV ui, replay, views and editor use EV siblings and the SDK ui only (ADR-0132).';
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
// that list, so it keeps mock-server and exactly ./dev/mock-assembly — no `/mock` subpath, never the feature
// origin slot; published-metrics.test.ts keeps mock-server only. No app file outside src/dev/** may import ./dev/**.
const APP_CONFORMANCE_FILE = 'src/server-conformance.test.ts';
const APP_DEV_FILES = 'src/dev/**/*.{ts,tsx}';
const APP_REAL_FILES = 'src/real/**/*.{ts,tsx}';
const APP_REAL_TEST_FILES = 'src/real/**/*.test.{ts,tsx}';
const APP_PUBLISHED_METRICS_FILE = 'src/published-metrics.test.ts';
const APP_SAVED_VIEW_ASSEMBLY_FILE = 'src/saved-view-assembly.test.tsx';
const DEV_MESSAGE = 'src/dev/** (mock assembly, DevTools) is reached only through #platform-assembly in mock builds (ADR-0009).';
// Specifiers that name a `dev` folder segment: relative ./dev, ./dev/x, ../dev/x, ../../src/dev/x, and Vite's
// root-absolute /src/dev/x. Matched case-insensitively by both rules (ESLint's `regex` uses the `i` flag).
// `import.meta.glob('./dev/*')` is not an import source — only the production-graph check catches it.
const DEV_REGEX = '^(?:\\.{1,2}/(?:.*/)?|/src/)dev(?:/|$)';
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** DEV_REGEX minus the exact `devAllow` specifiers. */
const devRegex = (devAllow = []) =>
  devAllow.length === 0 ? DEV_REGEX : `^(?!(?:${devAllow.map(escapeRegex).join('|')})$)${DEV_REGEX.slice(1)}`;

// Menu subpaths: the feature-bridge package slot subpaths (the screen API slot feature-api and the notifications, VOC compose and home todo slots); each menu's exact `/mock` export is
// src/dev/** only. The exact menu-home/launcher entry is src/menus.ts only (#1109). Every other menu subpath and any `*/src` import stays banned.
// NOTE: the gitignore-style `*` in `menu-*/mock` also matches an empty name (no way to say
// "one or more" here), so a `menu-/mock` source is not rejected on this side; the dynamic-import
// side (import-source.js) uses `[^/]+` for the same pattern.
const MENU_MOCK_SUBPATH = 'menu-*/mock';
const FEATURE_API_SUBPATH = 'feature-bridge/feature-api';
const NOTIFICATIONS_SLOT_SUBPATH = 'feature-bridge/notifications-slot';
const VOC_COMPOSE_SLOT_SUBPATH = 'feature-bridge/voc-compose-slot';
const HOME_TODO_SLOT_SUBPATH = 'feature-bridge/home-todo-slot';
// Consumer-owned contributions, composed only in main.tsx (#1328 e2, #1408).
const IMPROVEMENT_ANALYSIS_ACTIONS_SUBPATH = 'menu-improvement-items/analysis-actions';
const IMPROVEMENT_HOME_SLOT_SUBPATH = 'menu-improvement-items/home-todo-slot';
// #1475: the Round tab body of menu-log-analysis and the slot that takes it in menu-log-models; the app joins the two here, so the menus never import each other.
const LOG_EXPLORER_VIEW_SUBPATH = 'menu-log-analysis/view';
const LOG_ROUND_SOURCE_SLOT_SUBPATH = 'menu-log-models/round-source-slot';
const LOG_MODEL_TOPVIEW_SLOT_SUBPATH = 'menu-log-knowledge/model-topview-slot';
const SCOPE_CONTROL_SLOT_SUBPATH = 'feature-bridge/scope-control';
const NAV_COUNTS_SLOT_SUBPATH = 'feature-bridge/nav-counts';
const SAVED_VIEWS_SLOT_SUBPATH = 'feature-bridge/saved-views';
const ACCESS_REQUEST_SLOT_SUBPATH = 'feature-bridge/access-request-slot';
// The feature-bridge menu test harness (`createFeatureMenuHarness`) subpath: test-only like `kernel/testing`, so only bridge-menu test files import it (FEATURE_BRIDGE_TEST_SUBPATHS).
const FEATURE_BRIDGE_TESTING_SUBPATH = 'feature-bridge/testing';
// Rule 8 exception (platform ADR-0071, ADR-0081): a bridge menu imports exactly these entries, read from `apps/feature-screens/package.json` `exports` (the one list; the screen barrel, its eager-code subset `/core`,
// the lazy notifications panel entry `/inbox-panel`, and the operator dashboard and VOC entries); no other feature package entry. the feature-bridge package imports `/core` only (FEATURE_BRIDGE_PACKAGE_ENTRIES)
// except its lazy `src/pages/**`, which are screens too (the notifications slot loads `inbox-panel` through one of them).
const FEATURE_BRIDGE_ENTRIES = featureBridgeEntrySources();
const FEATURE_BRIDGE_TEST_SUBPATHS = [FEATURE_API_SUBPATH, NOTIFICATIONS_SLOT_SUBPATH, VOC_COMPOSE_SLOT_SUBPATH, HOME_TODO_SLOT_SUBPATH, SCOPE_CONTROL_SLOT_SUBPATH, NAV_COUNTS_SLOT_SUBPATH, SAVED_VIEWS_SLOT_SUBPATH, ACCESS_REQUEST_SLOT_SUBPATH, 'feature-bridge/home-todo-page', 'feature-bridge/voc-compose-page', FEATURE_BRIDGE_TESTING_SUBPATH];
const FEATURE_BRIDGE_PACKAGE_ENTRIES = [pkg('feature-screens/global-screens/core')];
const UI_THEME_SUBPATHS = ['ui/theme', 'ui/theme-tokens.json'];

// Restriction data is the single decision source: each layer declares
// { allow, denyReact, denyTableEngine, mockAllowed, allowSubpaths } and BOTH import rules are built
// from it, so static and dynamic imports can never drift apart.
//   allow: package-entry names this layer may import; null = every entry.
//   mockAllowed: exempts exactly the mock-server entry (never its subpaths).
//   allowSubpaths: exact names or patterns exempted from the deep-subpath ban (default none).
//   allowDockEngine: exempts the dock layout engine packages (components only; every other layer bans them, ADR-0067).
//   denyQueryEngine: bans the Kernel's query engine (@tanstack/react-query); only kernel and the feature bridge package import it.
//   denyDev: bans relative imports of a `dev` folder (DEV_REGEX), static and dynamic; devAllow lists exact
//   specifiers exempted from it.
// Deep subpaths are banned for everyone, except subpaths matched by allowSubpaths.
// The Kernel's query engine: only kernel and the feature bridge (its own client, ADR-0071) import it.
const QUERY_ENGINE_PACKAGES = ['@tanstack/react-query', '@tanstack/query-core'];
const TABLE_ENGINE_PACKAGES = ['@tanstack/react-table', '@tanstack/react-virtual', '@tanstack/table-core', '@tanstack/virtual-core'];
const MENU_RESTRICTION = { allow: MENU_ALLOW, denyReact: false, denyTableEngine: true, denyQueryEngine: true, mockAllowed: false, allowSubpaths: UI_THEME_SUBPATHS };
// allowFeature: exact feature package sources exempted from the feature ban (only the bridge menu, FEATURE_BRIDGE_ENTRIES).
const FEATURE_BRIDGE_RESTRICTION = { ...MENU_RESTRICTION, allow: [...MENU_ALLOW, 'feature-bridge'], allowFeature: FEATURE_BRIDGE_ENTRIES };
// The feature-bridge package (consumer-side runtime, not SDK): the menu layer's workspace allowlist, `/core` only; its lazy pages see the screen barrel.
const FEATURE_BRIDGE_PACKAGE_RESTRICTION = { ...MENU_RESTRICTION, denyQueryEngine: false, allowFeature: FEATURE_BRIDGE_PACKAGE_ENTRIES };
const FEATURE_BRIDGE_PAGES_RESTRICTION = { ...FEATURE_BRIDGE_PACKAGE_RESTRICTION, denyQueryEngine: false, allowFeature: FEATURE_BRIDGE_ENTRIES };
const MENU_MOCK_RESTRICTION = { allow: ['contracts'], denyReact: true, denyTableEngine: true, denyQueryEngine: true, mockAllowed: true };
// #154: the real-server adapter reaches the app through src/real/** only (APP_REAL_FILES below).
// The app imports no @eqv/* source: the viewer is the menu package menu-topview (manifests, the model-topview subpath in main.tsx, the mock-data subpath in src/dev/** and the conformance test).
const APP_EQV_ENTRIES = [];
const TOPVIEW_MODEL_SUBPATH = 'menu-topview/model-topview';
const TOPVIEW_MOCK_DATA_SUBPATH = 'menu-topview/mock-data';
const APP_RESTRICTION = { allowEqv: APP_EQV_ENTRIES, allow: null, denyReact: false, denyQueryEngine: true, mockAllowed: false, denyDev: true, denyHttpAdapter: true, allowSubpaths: [...UI_THEME_SUBPATHS, DOCK_ENTRY_SUBPATH, HOST_ENTRY_SUBPATH] };
// src/main.tsx is the composition root: only the screen API and notifications slot subpaths; no mock, no ./dev (#153).
const APP_REAL_RESTRICTION = { ...APP_RESTRICTION, denyHttpAdapter: false };
const APP_MAIN_RESTRICTION = { ...APP_RESTRICTION, allowSubpaths: [...UI_THEME_SUBPATHS, DOCK_ENTRY_SUBPATH, HOST_ENTRY_SUBPATH, FEATURE_API_SUBPATH, NOTIFICATIONS_SLOT_SUBPATH, VOC_COMPOSE_SLOT_SUBPATH, HOME_TODO_SLOT_SUBPATH, IMPROVEMENT_HOME_SLOT_SUBPATH, IMPROVEMENT_ANALYSIS_ACTIONS_SUBPATH, SCOPE_CONTROL_SLOT_SUBPATH, NAV_COUNTS_SLOT_SUBPATH, SAVED_VIEWS_SLOT_SUBPATH, ACCESS_REQUEST_SLOT_SUBPATH, LOG_EXPLORER_VIEW_SUBPATH, LOG_ROUND_SOURCE_SLOT_SUBPATH, LOG_MODEL_TOPVIEW_SLOT_SUBPATH, TOPVIEW_MODEL_SUBPATH] };
// The mock assembly and DevTools: mock-server and the menu `/mock` subpaths.
const APP_DEV_RESTRICTION = { allowEqv: APP_EQV_ENTRIES, allow: null, denyReact: false, denyQueryEngine: true, mockAllowed: true, denyHttpAdapter: true, allowSubpaths: [...UI_THEME_SUBPATHS, MENU_MOCK_SUBPATH, TOPVIEW_MOCK_DATA_SUBPATH] };
// The conformance test: mock-server, and from ./dev only the mock assembly's MOCK_ENDPOINTS list (#153 follow-up —
// one source for "what the app registers"); no menu `/mock` subpath of its own.
const APP_CONFORMANCE_RESTRICTION = { ...APP_RESTRICTION, mockAllowed: true, devAllow: ['./dev/mock-assembly'], allowSubpaths: [...APP_RESTRICTION.allowSubpaths, TOPVIEW_MOCK_DATA_SUBPATH] };
// published-metrics.test.ts and saved-view-assembly.test.tsx (the browser saved-view store lives in mock-server, #1702h) keep the mock-server exemption but never the menu-subpath allowance.
const APP_PUBLISHED_METRICS_RESTRICTION = { ...APP_RESTRICTION, mockAllowed: true };

// Exact EV identities (not the namespace), minus the layer's exact sources and identity roots.
const eqvRegex = (allowEqv = [], allowEqvPackages = []) => {
  const exact = allowEqv.length ? `(?!(?:${allowEqv.map(escapeRegex).join('|')})$)` : '';
  const roots = allowEqvPackages.length ? `(?!(?:${allowEqvPackages.map(escapeRegex).join('|')})(?:/|$))` : '';
  return `^${exact}${roots}(?:${EQV_PACKAGES.map(escapeRegex).join('|')})(?:/|$)`;
};

function importRestrictions({ allow, denyReact, denyTableEngine, denyQueryEngine = false, mockAllowed, allowSubpaths = [], denyDev = false, devAllow = [], denyHttpAdapter = false, allowEqv = [], allowEqvPackages = [], eqvMessage = EQV_MESSAGE, allowDockEngine = false, allowRadix = false, allowFeature = [] }) {
  const negations = [
    ...(allow === null ? [] : allow.map((name) => `!${pkg(name)}`)),
    ...new Set(allowFeature.map((source) => `!${source.split('/').slice(0, 2).join('/')}`)),
    ...(mockAllowed ? [`!${pkg('mock-server')}`] : []),
  ];
  // Exact package boundary plus exact bridge-entry exemptions; near neighbors are distinct packages.
  const exempt = allowFeature.length ? `(?!(?:${allowFeature.map(escapeRegex).join('|')})$)` : '';
  const featurePatterns = [{ regex: `^${exempt}(?:${FEATURE_PACKAGES.map(escapeRegex).join('|')})(?:/|$)`, message: FEATURE_MESSAGE }];
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
        ...featurePatterns,
        // First, so a layer that may not import the host-only entry gets its own message instead of the generic deep-subpath one.
        ...(allowSubpaths.includes(DOCK_ENTRY_SUBPATH) ? [] : [{ group: [pkg(DOCK_ENTRY_SUBPATH)], message: DOCK_ENTRY_MESSAGE }]),
        ...(allowSubpaths.includes(HOST_ENTRY_SUBPATH) ? [] : [{ group: [pkg(HOST_ENTRY_SUBPATH)], message: HOST_ENTRY_MESSAGE }]),
        {
          regex: `^${escapeRegex(PACKAGE_PREFIX)}(?!(?:${[...allowSubpaths.map((s) => escapeRegex(s).replaceAll('\\*', '[^/]*')), ...allowFeature.map((source) => escapeRegex(source.slice(PACKAGE_PREFIX.length)))].join('|')})$)[^/]+/`,
          message: DEEP_SUBPATH_MESSAGE,
        },
        ...(allow === null
          ? []
          : [{ group: [`${PACKAGE_PREFIX}*`, ...negations], message: LAYER_MESSAGE }]),
        ...(mockAllowed ? [] : [{ group: [pkg('mock-server'), pkg('mock-server/*')], message: MOCK_SERVER_MESSAGE }]),
        ...(denyHttpAdapter ? [{ group: [pkg('http-adapter')], message: HTTP_ADAPTER_MESSAGE }] : []),
        { regex: eqvRegex(allowEqv, allowEqvPackages), message: eqvMessage },
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
const COMPONENTS_ENGINES_TEST_ENTRY_SUBPATH = 'components/testing/engines';
const TEST_ENTRY_FILES = ['**/*.test.{ts,tsx}', '**/test-support.{ts,tsx}', '**/test-setup.ts'];
const testEntryOverride = (restriction, subpaths = [TEST_ENTRY_SUBPATH], files = TEST_ENTRY_FILES) => {
  const withEntry = { ...restriction, allowSubpaths: [...(restriction.allowSubpaths ?? []), ...subpaths] };
  return {
    files,
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
    eqvMessage: restriction.eqvMessage ?? EQV_MESSAGE,
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
    featureMessage: FEATURE_MESSAGE,
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
          'no-lang-copy-ternary': noLangCopyTernary,
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
// The options mirror the former feature-package .oxlintrc.json (ADR-0062), the source of the shared design system:
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
  // Platform accessibility floor (ADR-0023), on top of the feature contracts: control boundaries keep the
  // >=3:1 border-control, buttons that use aria-disabled (to keep focus for Radix) keep a disabled look, and menu items
  // keep a keyboard focus ring (the feature focus tint is ~1.1:1 on the popover surface).
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
// Where the primitives are defined (the ui package) they style themselves, as in feature packages/ui: no restyle
// or static-class check; arbitrary layout values stay allowed.
const COMPONENT_SOURCE_RULES = {
  ...DESIGN_SYSTEM_RULES,
  'shadcn/no-restyle': 'off',
  'shadcn/require-static-classes': 'off',
};
/** @param {{ componentSource?: boolean, eqvComponents?: boolean }} [options] componentSource: true where the components themselves are defined; eqvComponents: the EV components count as components too. */
const designSystem = ({ componentSource = false, eqvComponents = false } = {}) => ({
  files: ['**/*.{ts,tsx}'],
  // Generated token tables list token names, not class strings.
  ignores: ['**/*.test.{ts,tsx}', '**/*.generated.ts'],
  plugins: { shadcn },
  settings: {
    shadcn: {
      componentImports: [`^${pkg('ui')}(/|$)`, `^${pkg('components')}(/|$)`, ...(eqvComponents ? [`^${escapeRegex(EQV_UI_PACKAGE)}(/|$)`] : [])],
      note: 'Visual rules: DESIGN.md. Shared components: docs/contract/components.md §13. New tokens go in packages/sdk/ui/src/styles (platform extension layer: DESIGN.md).',
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

// contract-schemas (ADR-0096): production code imports no other platform package and no React; "zod only" is held by the manifest and review, not lint.
// Its tests compare the schemas with the hand-written types, so test files alone may import contracts, its vocab.json and its build entry (the snapshot emitter the schema pins).
const CONTRACT_SCHEMAS_RESTRICTION = { allow: [], denyReact: true, mockAllowed: false };
const CONTRACT_SCHEMAS_TEST_RESTRICTION = { ...CONTRACT_SCHEMAS_RESTRICTION, allow: ['contracts'] };

/** @type {import('eslint').Linter.Config[]} */
export const contractSchemas = [
  BUILD_OUTPUT,
  layerConfig({ restriction: CONTRACT_SCHEMAS_RESTRICTION }),
  testEntryOverride(CONTRACT_SCHEMAS_TEST_RESTRICTION, ['contracts/vocab.json', 'contracts/build'], ['**/*.test.ts']),
];

/** @type {import('eslint').Linter.Config[]} */
export const ui = [
  REACT_HOOKS,
  BUILD_OUTPUT,
  layerConfig({ restriction: { allow: [], denyReact: false, mockAllowed: false, allowRadix: true } }),
  designSystem({ componentSource: true }),
];

// #2174: ko/en copy lives in a message table, not a language ternary (rule source: no-lang-copy-ternary.js). Tests may
// spell the expected text of both languages. Enabled per package as its copy moves: kernel and shell first, then
// components, then menus and platform features.
const LANG_COPY = { files: ['**/*.{ts,tsx}'], ignores: TEST_ENTRY_FILES, rules: { 'ap/no-lang-copy-ternary': 'error' } };

/** @type {import('eslint').Linter.Config[]} */
export const kernel = [
  REACT_HOOKS,
  BUILD_OUTPUT,
  layerConfig({ restriction: { allow: ['contracts'], denyReact: false, mockAllowed: false } }),
  LANG_COPY,
];

const COMPONENTS_RESTRICTION = { allow: ['contracts', 'kernel', 'ui'], denyReact: false, denyQueryEngine: true, mockAllowed: false, allowSubpaths: [...UI_THEME_SUBPATHS, HOST_ENTRY_SUBPATH], allowDockEngine: true };
const ABOVE_COMPONENTS_TEST_ENTRIES = [TEST_ENTRY_SUBPATH, COMPONENTS_TEST_ENTRY_SUBPATH, COMPONENTS_ENGINES_TEST_ENTRY_SUBPATH];
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
  designSystem(),  LANG_COPY,
];

// Host assembly package (#1702, host-entry-contract §3): sits above the shell and is domain-free, so it sees exactly the SDK layers
// below it. The allowlist is what rejects the feature bridge, every menu, @eqv/*, mock-server and http-adapter (an assembly injects those).
const APP_HOST_RESTRICTION = { allow: ['contracts', 'kernel', 'components', 'ui', 'shell'], denyReact: false, denyQueryEngine: true, mockAllowed: false, allowSubpaths: [...UI_THEME_SUBPATHS, HOST_ENTRY_SUBPATH] };

/** @type {import('eslint').Linter.Config[]} */
export const appHost = [
  REACT_HOOKS,
  BUILD_OUTPUT,
  layerConfig({ restriction: APP_HOST_RESTRICTION }),
  testEntryOverride(APP_HOST_RESTRICTION, ABOVE_COMPONENTS_TEST_ENTRIES),
  designSystem(),
];

const HTTP_ADAPTER_RESTRICTION = { allow: ['contracts'], denyReact: true, mockAllowed: false };

/** @type {import('eslint').Linter.Config[]} */
export const httpAdapter = [
  layerConfig({ restriction: HTTP_ADAPTER_RESTRICTION }),
  // Test files alone compare the hand-written response guards with the wire schemas (ADR-0099); production code stays contracts-only.
  testEntryOverride({ ...HTTP_ADAPTER_RESTRICTION, allow: ['contracts', 'contract-schemas'] }, ['contract-schemas/source'], ['**/*.test.ts']),
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

// EV presets (packages/eqv/<name>, packages named @eqv/*; ADR-0132). The files resolve their owning package at that depth
// (relative-escape.js), so a relative import cannot leave the package.
// core and renderer: no platform package at all (static, dynamic, type), no @eqv package but core; design-system-free.
const EQV_CORE_RESTRICTION = { allow: [], denyReact: false, mockAllowed: false, allowEqvPackages: ['@eqv/core'], eqvMessage: EQV_CORE_MESSAGE };
/** @type {import('eslint').Linter.Config[]} */
export const eqvCore = [
  REACT_HOOKS,
  BUILD_OUTPUT,
  layerConfig({ restriction: EQV_CORE_RESTRICTION }),
];

// ui, replay, views, editor: the SDK design system (its ui package) only; EV siblings are free.
const EQV_UI_RESTRICTION = { allow: ['ui'], denyReact: false, mockAllowed: false, allowSubpaths: HOST_MODULE_RESTRICTION.allowSubpaths, allowEqvPackages: EQV_PACKAGES, eqvMessage: EQV_UI_MESSAGE };
/** @type {import('eslint').Linter.Config[]} */
export const eqvUi = [
  REACT_HOOKS,
  BUILD_OUTPUT,
  layerConfig({ restriction: EQV_UI_RESTRICTION }),
  designSystem({ eqvComponents: true }),
];

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
 * `menu` plus the six exact `@eqv/*` entries of EV's own menus (menus/tools/topview-studio and menus/tools/topview, ADR-0132). `allowEqv` lists exact sources,
 * so subpaths such as `@eqv/ui/styles.css` stay banned; `src/mock/**` keeps the plain menu mock policy and may not import `@eqv/core`.
 * @type {import('eslint').Linter.Config[]}
 */
export const eqvMenu = menuPreset({ ...MENU_RESTRICTION, allowEqv: EQV_MENU_ENTRIES, eqvMessage: EQV_MENU_MESSAGE });

/**
 * `menu` plus the one feature entry the bridge menu (menu-my-activity) may import (platform ADR-0071).
 * @type {import('eslint').Linter.Config[]}
 */
export const featureBridgeMenuPreset = [
  ...menuPreset(FEATURE_BRIDGE_RESTRICTION),
  // The bridge menu's integration tests drive the bridge slots and lazy pages directly; production files see the bridge root only.
  testEntryOverride(FEATURE_BRIDGE_RESTRICTION, [...ABOVE_COMPONENTS_TEST_ENTRIES, ...FEATURE_BRIDGE_TEST_SUBPATHS]),
  // Last, so the mock policy (contracts + mock-server only) also wins for tests under src/mock/**.
  menuMockOverride,
];

/**
 * The feature bridge runtime package (the feature-bridge package, ADR-0071, ADR-0081): menu-layer imports, `/core` only,
 * and `src/pages/**` (lazy chunks) may also import the screen barrel. Menu contract rules do not apply (no manifests here).
 * @type {import('eslint').Linter.Config[]}
 */
export const featureBridgePreset = [
  REACT_HOOKS,
  layerConfig({ restriction: FEATURE_BRIDGE_PACKAGE_RESTRICTION, extraRules: menuContractRules }),
  // Its tests mount a platform with the kernel fixtures (ADR-0040); production files stay restricted.
  testEntryOverride(FEATURE_BRIDGE_PACKAGE_RESTRICTION),
  // The menu test harness is the one non-test file that mounts a platform with the kernel fixtures; it is exported only as the `feature-bridge/testing` subpath, never from the root.
  testEntryOverride(FEATURE_BRIDGE_PACKAGE_RESTRICTION, [TEST_ENTRY_SUBPATH], ['src/testing.tsx']),
  {
    files: ['src/pages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': importRestrictions(FEATURE_BRIDGE_PAGES_RESTRICTION),
      'ap/restricted-import-source': ['error', importSourceOptions(FEATURE_BRIDGE_PAGES_RESTRICTION)],
    },
  },
  designSystem(),
];

// App: all package entries allowed, deep subpaths, mock-server and ./dev banned (#153). src/main.tsx keeps only
// the feature-bridge slot subpaths; src/dev/** sees mock-server and the menu `/mock`
// subpaths; the conformance test sees mock-server and ./dev/mock-assembly only; published-metrics.test.ts sees
// mock-server only. src/menus.ts alone may configure menu-home/launcher (#1109). Both import rules use the same restriction.
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
  testEntryOverride(APP_RESTRICTION, [...ABOVE_COMPONENTS_TEST_ENTRIES, FEATURE_BRIDGE_TESTING_SUBPATH]),
  appOverride(['src/menus.ts'], { ...APP_RESTRICTION, allowSubpaths: [...APP_RESTRICTION.allowSubpaths, 'menu-home/launcher'] }),
  appOverride(['src/main.tsx'], APP_MAIN_RESTRICTION),
  // The build script that emits the menu declaration snapshot (ADR-0156) is the one app file that imports the contracts build entry.
  appOverride(['scripts/menu-declaration-snapshot.ts'], { ...APP_RESTRICTION, allowSubpaths: [...APP_RESTRICTION.allowSubpaths, 'contracts/build'] }),
  appOverride([APP_CONFORMANCE_FILE], APP_CONFORMANCE_RESTRICTION),
  appOverride([APP_PUBLISHED_METRICS_FILE], APP_PUBLISHED_METRICS_RESTRICTION),
  appOverride([APP_SAVED_VIEW_ASSEMBLY_FILE], { ...APP_PUBLISHED_METRICS_RESTRICTION, allowSubpaths: [...APP_PUBLISHED_METRICS_RESTRICTION.allowSubpaths, ...ABOVE_COMPONENTS_TEST_ENTRIES] }),
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

// Feature packages have no layer allowlist; they take the EV ban alone (static, dynamic, type). The server alone may use
// @eqv/core (pure domain validation shared with the browser; no React and no platform imports; ADR-0132, ADR-0135).
const eqvBanOnlyFor = (allowEqvPackages = []) => ({
  files: ['**/*.{ts,tsx,js,mjs}'],
  // One `ap` plugin per preset array: flat config rejects a second definition of the same plugin name. The screens-only
  // `no-browser-random-uuid` and `require-api-path` are registered here (dormant — no preset enables them) so
  // `featureScreensPreset` can enable them without redefining `ap`.
  plugins: { ap: { rules: { 'restricted-import-source': restrictedImportSource, 'no-browser-random-uuid': noBrowserRandomUuid, 'require-api-path': requireApiPath } } },
  rules: {
    'no-restricted-imports': ['error', { patterns: [{ regex: eqvRegex([], allowEqvPackages), message: EQV_MESSAGE }] }],
    'ap/restricted-import-source': ['error', { eqvOnly: true, eqvMessage: EQV_MESSAGE, allowEqvPackages }],
  },
});
const eqvBanOnly = eqvBanOnlyFor();

// Feature full-source presets (#1102 a). Feature-only: no other preset reads them. Rules and the old Biome/Oxlint
// correspondence: feature.js and docs/integration/platform-packages.md §6.
/** @type {import('eslint').Linter.Config[]} */
export const featureServerPreset = [...featureServer(), eqvBanOnlyFor(['@eqv/core'])];

/**
 * `featureServerPreset` without its type-aware block (#1972): only for tests that lint text under a path that does not
 * exist, which the project service cannot open. Never a package's lint config.
 * @type {import('eslint').Linter.Config[]}
 */
export const featureServerUntypedPreset = [...featureServer({ typed: false }), eqvBanOnlyFor(['@eqv/core'])];

/** @type {import('eslint').Linter.Config[]} */
export const featureSharedPreset = [...featureShared(), eqvBanOnly];

/** @type {import('eslint').Linter.Config[]} */
export const featureUiPreset = [...featureUi({ reactHooks: REACT_HOOKS, design: designSystem({ componentSource: true }) }), eqvBanOnly];

// feature-screens (#1102 b): the former Oxlint pass over the screens (ops/platform-api/.oxlintrc.json, removed) restyled-component
// checks included, so `no-restyle` and `require-static-classes` stay on (only packages that define the primitives turn them
// off). The screens also render the feature components of the feature UI package, which the old config named as its `ui` alias.
const screensDesign = designSystem();
/** @type {import('eslint').Linter.Config[]} */
export const featureScreensPreset = [...featureUi({
  reactHooks: REACT_HOOKS,
  design: {
    ...screensDesign,
    settings: {
      shadcn: {
        ...screensDesign.settings.shadcn,
        componentImports: [...screensDesign.settings.shadcn.componentImports, `^${pkg('feature-ui')}(/|$)`],
      },
    },
  },
}), eqvBanOnly, featureScreenPaths, {
  // #2017: `crypto.randomUUID` does not exist outside a secure context (plain HTTP on a non-localhost origin), so a direct
  // call throws and the write never leaves. Only the browser call is reported — the global receivers `crypto`,
  // `globalThis.crypto` and `window.crypto` — so feature detection (`crypto.randomUUID === undefined`) and Node test
  // objects (`nodeCrypto.randomUUID()`) pass. Feature-only: no other preset reads this.
  // `ap/no-browser-random-uuid` is registered once in `eqvBanOnlyFor`'s plugin (above); the screens preset only enables it.
  rules: {
    'ap/no-browser-random-uuid': ['error'],
  },
}];
