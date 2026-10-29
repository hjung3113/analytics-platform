// FeedbackOps full-source lint presets (#1102 a): platform-api, feature-shared, feature-ui.
// These replace the former Biome lint for those packages. Policy and the old-rule -> ESLint-rule table:
// docs/integration/platform-packages.md §6 (FeedbackOps 기능 패키지 lint). Presets here are feature-only; no SDK, app, menu or bridge preset reads them.
import js from '@eslint/js';
import { fixupPluginRules } from '@eslint/compat';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import unicorn from 'eslint-plugin-unicorn';

const SOURCE_FILES = ['**/*.{ts,tsx,js,mjs}'];

// Build output and caches only; authored files, tests and config files are all linted.
const GENERATED = { ignores: ['**/dist/**', '**/coverage/**', '**/.drizzle-schema/**', '**/.vite/**', '**/.turbo/**'] };

// react and jsx-a11y declare ESLint peers up to 9; the compat adapter runs their rules under ESLint 10 (tooling test pins this).
const reactPlugin = fixupPluginRules(react);
const a11yPlugin = fixupPluginRules(jsxA11y);

// Rules without an old Biome counterpart that js/ts "recommended" would add.
const NO_OLD_COUNTERPART = {
  'preserve-caught-error': 'off',
  'no-useless-assignment': 'off',
  '@typescript-eslint/no-require-imports': 'off',
  '@typescript-eslint/ban-ts-comment': 'off',
  '@typescript-eslint/no-namespace': 'off',
  '@typescript-eslint/no-unused-expressions': 'off',
  '@typescript-eslint/triple-slash-reference': 'off',
  '@typescript-eslint/no-duplicate-enum-values': 'off',
  '@typescript-eslint/no-array-constructor': 'off',
};

// Biome noUnusedVariables semantics, measured on 1.9.4: every binding (including parameters, caught errors and array
// destructuring) is reported unless it starts with `_`; a rest sibling is not.
const UNUSED = [
  'error',
  {
    vars: 'all',
    args: 'all',
    caughtErrors: 'all',
    varsIgnorePattern: '^_',
    argsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_',
    destructuredArrayIgnorePattern: '^_',
    ignoreRestSiblings: true,
  },
];

// Focused tests silently skip the rest of the suite (old Biome suspicious/noFocusedTests). describe/it/test/suite `.only`
// in every spelling the old rule reported: direct, `.only.each(...)` (table-driven), `.concurrent.only`, computed `['only']`.
const TEST_RUNNERS = '/^(describe|it|test|suite)$/';
const FOCUSED_TESTS = [
  `MemberExpression[computed=false][property.name='only'][object.name=${TEST_RUNNERS}]`,
  `MemberExpression[computed=false][property.name='only'][object.type='MemberExpression'][object.object.name=${TEST_RUNNERS}]`,
  `MemberExpression[computed=true][property.value='only'][object.name=${TEST_RUNNERS}]`,
].map((selector) => ({ selector, message: 'Focused test: .only skips the rest of the suite (old Biome suspicious/noFocusedTests).' }));

// Old Biome performance/noAccumulatingSpread: a reduce callback that rebuilds an object or array with a spread on every
// step is quadratic. ESLint selectors cannot compare the spread target with the accumulator parameter, so this reports a
// spread directly inside the object/array literal the callback returns (concise body or `return`), whatever it spreads.
const REDUCE_CALLBACK = "CallExpression[callee.property.name=/^(reduce|reduceRight)$/] > :matches(ArrowFunctionExpression, FunctionExpression)";
const ACCUMULATING_SPREAD = [
  `${REDUCE_CALLBACK} > :matches(ObjectExpression, ArrayExpression) > SpreadElement`,
  `${REDUCE_CALLBACK} ReturnStatement > :matches(ObjectExpression, ArrayExpression) > SpreadElement`,
].map((selector) => ({ selector, message: 'Spread inside a reduce callback copies the accumulator on every step (old Biome performance/noAccumulatingSpread); mutate a local accumulator or build once.' }));

// Rules with an exact or near counterpart for an enabled Biome rule (the table in the guide names each pair).
const CORRECTNESS_RULES = {
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': UNUSED,
  // noUnusedImports is covered by no-unused-vars (imports are bindings).
  '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'separate-type-imports', disallowTypeAnnotations: false }],
  '@typescript-eslint/consistent-type-exports': 'off',
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/no-explicit-any': 'error',
  // Old Biome suspicious/noConfusingVoidType: void only as a return type or generic argument.
  '@typescript-eslint/no-invalid-void-type': 'error',
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug', 'trace', 'table', 'group', 'groupEnd', 'time', 'timeEnd', 'assert', 'dir'] }],
  'no-restricted-syntax': [
    'error',
    // Biome performance/noDelete skips `delete obj[name]` with a computed non-literal key (measured on 1.9.4). Engine-policy
    // difference: `delete process.env.X` is allowed, because assigning undefined to process.env stores the string "undefined".
    {
      selector: "UnaryExpression[operator='delete'][argument.type='MemberExpression']:not([argument.computed=true][argument.property.type='Identifier']):not([argument.object.type='MemberExpression'][argument.object.object.name='process'][argument.object.property.name='env'])",
      message: 'delete reshapes the object (old Biome performance/noDelete); assign undefined or rebuild the object.',
    },
    // Biome complexity/noForEach reports an inline callback with at most one parameter; `forEach(fn)` and a callback that
    // takes the index are not reported (measured on 1.9.4).
    {
      selector: "CallExpression[callee.property.name='forEach'][arguments.0.type=/^(ArrowFunctionExpression|FunctionExpression)$/][arguments.0.params.length<2]",
      message: 'Use for...of instead of forEach with an inline callback (old Biome complexity/noForEach).',
    },
    // Biome complexity/useFlatMap: `.map(...).flat()` is `.flatMap(...)`.
    {
      selector: "CallExpression[callee.property.name='flat'][arguments.length=0][callee.object.callee.property.name='map']",
      message: 'Use .flatMap(...) instead of .map(...).flat() (old Biome complexity/useFlatMap).',
    },
    // Biome suspicious/noConstEnum: a const enum is erased and cannot be used across isolated modules.
    { selector: 'TSEnumDeclaration[const=true]', message: 'Use a regular enum or a const object (old Biome suspicious/noConstEnum).' },
    // Biome suspicious/useIsArray: `x instanceof Array` is false across realms.
    { selector: "BinaryExpression[operator='instanceof'][right.name='Array']", message: 'Use Array.isArray (old Biome suspicious/useIsArray).' },
    ...FOCUSED_TESTS,
    ...ACCUMULATING_SPREAD,
  ],
  // typescript-eslint's recommended preset turns this off because tsc reports it, but tsc only does so with
  // allowUnreachableCode:false (unset here: measured, no error), so the ESLint rule stays on (old Biome noUnreachable).
  'no-unreachable': 'error',
  'no-var': 'error',
  'prefer-const': 'error',
  'prefer-rest-params': 'error',
  'no-sequences': 'error',
  'no-param-reassign': 'error',
  'no-eval': 'error',
  'no-inner-declarations': 'error',
  'no-constructor-return': 'error',
  'no-label-var': 'error',
  'no-labels': 'error',
  'no-self-compare': 'error',
  'default-case-last': 'error',
  'no-useless-rename': 'error',
  'no-extra-label': 'error',
  'no-unneeded-ternary': 'error',
  'no-lone-blocks': 'error',
  'prefer-exponentiation-operator': 'error',
  // Old Biome suspicious/noMisrefactoredShorthandAssign: `count += count + 1` counts the old value twice.
  'unicorn/no-misrefactored-assignment': 'error',
  'unicorn/no-thenable': 'error',
  'unicorn/no-static-only-class': 'error',
  'unicorn/no-useless-switch-case': 'error',
  'unicorn/prefer-node-protocol': 'error',
  'unicorn/prefer-number-properties': 'error',
};

// Node globals for the few plain JS files (ESLint config files and one build script), which no TypeScript program checks.
// A full environment package would be a new dependency; these files only use this set (the JS probe test pins it).
const NODE_GLOBALS = Object.fromEntries(
  [
    'process', 'console', 'Buffer', 'URL', 'URLSearchParams', 'AbortController', 'TextEncoder', 'TextDecoder', 'fetch',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'queueMicrotask',
    'structuredClone', 'performance', '__dirname', '__filename', 'module', 'require', 'exports',
  ].map((name) => [name, 'readonly']),
);

// typescript-eslint's compatibility override turns these off because tsc reports the same mistake (TS1117, TS2588 ...).
// That only holds for files that are in a tsc program: tests under a package-level __tests__ folder, *.config.ts,
// vitest.setup.ts and .d.ts files are outside every `include` (typecheck covers src and the platform conformance test
// only). Dropping the rules would leave those files unchecked, so the ones with no TypeScript-aware false positive stay on.
// Not restored: no-undef (type names), getter-return (abstract/interface accessors), no-with (strict-mode syntax error).
// no-redeclare and no-dupe-class-members use the typescript-eslint extension (overloads, declaration merging).
const COMPILER_BACKED_BUT_UNCOVERED = {
  'constructor-super': 'error',
  'no-class-assign': 'error',
  'no-const-assign': 'error',
  'no-dupe-args': 'error',
  'no-dupe-class-members': 'off',
  '@typescript-eslint/no-dupe-class-members': 'error',
  'no-dupe-keys': 'error',
  'no-func-assign': 'error',
  'no-import-assign': 'error',
  'no-new-native-nonconstructor': 'error',
  'no-obj-calls': 'error',
  'no-redeclare': 'off',
  '@typescript-eslint/no-redeclare': 'error',
  'no-setter-return': 'error',
  'no-this-before-super': 'error',
  'no-unsafe-negation': 'error',
};

const baseConfigs = () => [
  GENERATED,
  { files: SOURCE_FILES, ...js.configs.recommended },
  ...tsPlugin.configs['flat/recommended'].map((config) => ({ ...config, files: config.files ?? SOURCE_FILES })),
  {
    files: SOURCE_FILES,
    // A disable comment that no longer suppresses anything is an error, so stale exceptions cannot pile up.
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { unicorn },
    rules: { ...NO_OLD_COUNTERPART, ...CORRECTNESS_RULES },
  },
  { files: ['**/*.{ts,tsx}'], rules: COMPILER_BACKED_BUT_UNCOVERED },
  // Plain JS has no compiler at all, so undeclared names are the lint's job there (TS keeps no-undef off: tsc reports them).
  { files: ['**/*.{js,mjs}'], languageOptions: { globals: NODE_GLOBALS } },
];

const A11Y_RULES = Object.fromEntries(
  Object.entries(jsxA11y.configs.recommended.rules).map(([name, level]) => [name, level]),
);

const reactUiConfigs = (reactHooks) => [
  reactHooks,
  {
    files: ['**/*.{tsx,jsx}'],
    plugins: { react: reactPlugin, 'jsx-a11y': a11yPlugin },
    settings: { react: { version: '19' } },
    rules: {
      // Marks JSX React as used so the existing `import React` convention needs no type-import conversion.
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'react/jsx-key': 'error',
      'react/no-array-index-key': 'error',
      'react/no-children-prop': 'error',
      'react/no-danger': 'error',
      'react/no-danger-with-children': 'error',
      'react/jsx-no-target-blank': 'error',
      'react/jsx-no-duplicate-props': 'error',
      'react/jsx-no-comment-textnodes': 'error',
      'react/void-dom-elements-no-children': 'error',
      'react/no-render-return-value': 'error',
      'react/button-has-type': 'error',
      'react/jsx-no-useless-fragment': 'error',
      'react/self-closing-comp': 'error',
      ...A11Y_RULES,
      // Old Biome a11y/noAriaHiddenOnFocusable and a11y/useValidLang; not in the plugin's recommended set.
      'jsx-a11y/no-aria-hidden-on-focusable': 'error',
      'jsx-a11y/lang': 'error',
    },
  },
];

// These are factories, called by index.js after it defines the pieces they take (index.js owns the Hooks block and the
// design-system config; importing them here would make the two modules circular).

/** platform-api: Node server, no browser or React. @type {() => import('eslint').Linter.Config[]} */
export const featureServer = () => baseConfigs();

/** feature-shared: contracts shared by the server and the screens; no React. @type {() => import('eslint').Linter.Config[]} */
export const featureShared = () => baseConfigs();

/**
 * feature-ui: React components with the design-system rules (the former Oxlint pass over this package).
 * `design` is index.js's designSystem({ componentSource: true }): the primitives are defined here, so restyle and
 * static-class checks are off as in the Oxlint override. Options follow the former ops/platform-api/.oxlintrc.json (removed in #1102 b): tests and
 * __tests__ folders are not checked, `rich-editor` is a known class, and the `ap/` platform extension rule (not in the
 * Oxlint set) is not applied.
 * @param {{ reactHooks: import('eslint').Linter.Config, design: import('eslint').Linter.Config }} parts
 * @returns {import('eslint').Linter.Config[]}
 */
export const featureUi = ({ reactHooks, design }) => {
  const { 'ap/no-color-var-shorthand': _ap, ...designRules } = design.rules;
  return [
    ...baseConfigs(),
    ...reactUiConfigs(reactHooks),
    {
      ...design,
      ignores: [...(design.ignores ?? []), '**/__tests__/**'],
      rules: { ...designRules, 'shadcn/no-unknown-classes': ['error', { allow: ['rich-editor'] }] },
    },
  ];
};
