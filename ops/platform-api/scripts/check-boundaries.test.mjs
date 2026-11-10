// Focused test for the cross-module-repo-import rule in check-boundaries.mjs.
// Builds throwaway fixture trees laid out by the path map (ops/platform-api/paths.mjs), runs the checker against each
// tree through FEATURE_PATHS_REPO_ROOT, and removes the tree afterwards.
// Run: node ops/platform-api/scripts/check-boundaries.test.mjs

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FEATURE_BACKEND,
  FEATURE_FRONTEND,
  FEATURE_OPS,
  FEATURE_SHARED,
  FEATURE_UI,
} from '../paths.mjs';

const SCRIPT = fileURLToPath(new URL('check-boundaries.mjs', import.meta.url));
const MODULES = join(FEATURE_BACKEND, 'src', 'modules');

let failures = 0;

// The checker reads git history for the baseline growth check (#1675). Fixture trees without history must not
// inherit the runner's CI/push settings, so every case starts from this environment.
function fixtureEnv(tmp, extra = {}) {
  const env = { ...process.env, FEATURE_PATHS_REPO_ROOT: tmp, ...extra };
  for (const key of ['CI', 'GITHUB_EVENT_NAME', 'FEATURE_LINT_BASE'])
    if (!(key in extra)) delete env[key];
  return env;
}

function runCase(name, files, expectExit0, expectOutput) {
  const tmp = mkdtempSync(join(tmpdir(), 'boundary-test-'));
  try {
    // The checker runs from its real location (so `typescript` resolves from this package's node_modules); the
    // fixture tree is its repository root through FEATURE_PATHS_REPO_ROOT, isolated from the real production tree.
    for (const [rel, content] of Object.entries(files)) {
      const dest = join(tmp, rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content);
    }
    let stdout = '';
    let exit = 0;
    try {
      stdout = execFileSync('node', [SCRIPT], {
        encoding: 'utf8',
        env: fixtureEnv(tmp),
      });
    } catch (err) {
      exit = err.status ?? 1;
      stdout = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }
    if (expectExit0) {
      assert.equal(exit, 0, `${name}: expected exit 0, got ${exit}\n${stdout}`);
    } else {
      assert.equal(exit, 1, `${name}: expected exit 1, got ${exit}\n${stdout}`);
    }
    if (expectOutput) {
      const expected = Array.isArray(expectOutput) ? expectOutput : [expectOutput];
      for (const fragment of expected) {
        assert.ok(stdout.includes(fragment), `${name}: output missing "${fragment}"\n${stdout}`);
      }
    }
    process.stdout.write(`ok - ${name}\n`);
  } catch (err) {
    failures++;
    console.error(`not ok - ${name}\n${err.message}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const zero = {
  [join(MODULES, 'findings', 'service.ts')]: [
    "import { selectVocForUpdate } from '../voc/index.js';",
    "import { canManage } from '../voc/authorization.js';",
    "import type { VocRow } from '../voc/read-service.js';",
    "import { findFindingById } from './repo.js';",
    "const s = await import('../voc/index.js');",
    "export { findFindingById } from './repo.js';",
  ].join('\n'),
  [join(MODULES, 'voc', 'jobs', 'purge.ts')]: [
    "import { insertVoc } from '../embedding/repo.js';",
    "import { selectVocForUpdate } from '../repo.js';",
  ].join('\n'),
};

runCase('zero-violation tree passes', zero, true, 'boundaries: OK');

runCase(
  'foreign repo.js at sibling depth fails',
  {
    ...zero,
    [join(MODULES, 'findings', 'record.ts')]: "import { lockTaskById } from '../tasks/repo.js';\n",
  },
  false,
  `${FEATURE_BACKEND}/src/modules/findings/record.ts:1`,
);

runCase(
  'foreign repo-read.js at nested depth fails',
  {
    ...zero,
    [join(MODULES, 'voc', 'jobs', 'purge.ts')]: [
      "import { findFindingById } from '../../findings/repo-read.js';",
    ].join('\n'),
  },
  false,
  `${FEATURE_BACKEND}/src/modules/voc/jobs/purge.ts:1`,
);

runCase(
  'foreign repositories/ file at sibling depth fails',
  {
    ...zero,
    [join(MODULES, 'findings', 'record.ts')]:
      "import { writeItem } from '../log-knowledge/repositories/item-write.js';\n",
  },
  false,
  `${FEATURE_BACKEND}/src/modules/findings/record.ts:1`,
);

runCase(
  'foreign repositories/ file at nested depth fails',
  {
    ...zero,
    [join(MODULES, 'voc', 'jobs', 'purge.ts')]:
      "import { readItem } from '../../log-knowledge/repositories/item-read.js';\n",
  },
  false,
  `${FEATURE_BACKEND}/src/modules/voc/jobs/purge.ts:1`,
);

runCase(
  'same-module repositories/ import passes',
  {
    ...zero,
    [join(MODULES, 'log-knowledge', 'service.ts')]:
      "import { writeItem } from './repositories/item-write.js';\n",
  },
  true,
  'boundaries: OK',
);

runCase(
  'seeded forbidden import identifies file and line',
  {
    ...zero,
    [join(MODULES, 'surveys', 'results.ts')]: [
      "import { ok } from './helpers.js';",
      "import { resolveVocEndpoint } from '../entity-links/repo.js';",
    ].join('\n'),
  },
  false,
  `${FEATURE_BACKEND}/src/modules/surveys/results.ts:2`,
);

runCase(
  'same-module repo, authorization/read-service imports, and comment pass',
  {
    ...zero,
    [join(MODULES, 'dashboard', 'service.ts')]: [
      "import { checkFindingManage } from '../findings/authorization.js';",
      "import type { VocRow } from '../voc/read-service.js';",
      "// import { evil } from '../findings/repo.js';",
      'const notImport = "import { evil } from \'../findings/repo.js\'";',
    ].join('\n'),
  },
  true,
  'boundaries: OK',
);

runCase(
  'import-type expressions referencing foreign repo files fail',
  {
    ...zero,
    [join(MODULES, 'surveys', 'results.ts')]: [
      "import { ok } from './helpers.js';",
      "type Row = import('../findings/repo.js').FindingRow;",
      "type Mod = typeof import('../tasks/repo-read.js');",
    ].join('\n'),
  },
  false,
  [
    `${FEATURE_BACKEND}/src/modules/surveys/results.ts:2`,
    `${FEATURE_BACKEND}/src/modules/surveys/results.ts:3`,
  ],
);

runCase(
  'dynamic import with options argument targeting foreign repo fails',
  {
    ...zero,
    [join(MODULES, 'surveys', 'results.ts')]: [
      "import { ok } from './helpers.js';",
      "const mod = await import('../tasks/repo.js', { with: { type: 'json' } });",
    ].join('\n'),
  },
  false,
  `${FEATURE_BACKEND}/src/modules/surveys/results.ts:2`,
);

runCase(
  'rule 8 rejects VOC hook imports through the feature alias',
  {
    ...zero,
    [join(FEATURE_FRONTEND, 'src', 'features', 'findings', 'x.ts')]:
      "import { useThing } from '@/features/voc/hooks/useThing';\n",
  },
  false,
  `${FEATURE_FRONTEND}/src/features/findings/x.ts:1`,
);

runCase(
  'rule 8 rejects relative VOC lib imports from src/lib',
  {
    ...zero,
    [join(FEATURE_FRONTEND, 'src', 'lib', 'x.ts')]:
      "import { helper } from '../features/voc/lib/helper';\n",
  },
  false,
  `${FEATURE_FRONTEND}/src/lib/x.ts:1`,
);

runCase(
  'rule 8 treats voc-cluster as a non-VOC feature',
  {
    ...zero,
    [join(FEATURE_FRONTEND, 'src', 'features', 'voc-cluster', 'x.ts')]:
      "import { useThing } from '@/features/voc/hooks/useThing';\n",
  },
  false,
  `${FEATURE_FRONTEND}/src/features/voc-cluster/x.ts:1`,
);

runCase(
  'rule 8 excludes frontend tests and allows VOC feature internals',
  {
    ...zero,
    [join(FEATURE_FRONTEND, 'src', 'features', 'findings', '__tests__', 'x.test.ts')]:
      "import { useThing } from '@/features/voc/hooks/useThing';\n",
    [join(FEATURE_FRONTEND, 'src', 'features', 'voc', 'components', 'x.tsx')]:
      "import { helper } from '@/features/voc/lib/helper';\n",
  },
  true,
  'boundaries: OK',
);

runCase(
  'rule 9 rejects foreign imports of VOC seed helpers',
  {
    ...zero,
    [join(MODULES, 'voc-clusters', '__tests__', 'a.test.ts')]:
      "import { seed } from '../../voc/__tests__/_seed-helpers.js';\n",
  },
  false,
  `${FEATURE_BACKEND}/src/modules/voc-clusters/__tests__/a.test.ts:1`,
);

runCase(
  'rule 9 rejects any cross-module seed-helper import (#574)',
  {
    ...zero,
    [join(MODULES, 'tasks', '__tests__', 'a.test.ts')]:
      "import { seed } from '../../findings/__tests__/_seed-helpers.js';\n",
  },
  false,
  `${FEATURE_BACKEND}/src/modules/tasks/__tests__/a.test.ts:1`,
);

runCase(
  'rule 9 allows same-module VOC jobs seed-helper imports',
  {
    ...zero,
    [join(MODULES, 'voc', 'jobs', '__tests__', 'a.test.ts')]:
      "import { seed } from '../../__tests__/_seed-helpers.js';\n",
  },
  true,
  'boundaries: OK',
);

const ownerTableSql = {
  ...zero,
  [join(MODULES, 'managed-systems', 'repo.ts')]:
    'const result = await tx.execute(sql`select * from core.managed_systems`);\n',
  [join(MODULES, 'analytics-areas', 'repo.ts')]:
    'const result = await tx.execute(sql`select * from core.analytics_areas`);\n',
  [join(MODULES, 'tasks', '__tests__', 'fixture.integration.test.ts')]:
    'const result = await tx.execute(sql`select * from core.managed_systems`);\n',
};

runCase(
  'rule 10 allows owner-table SQL in owner modules and skips tests',
  ownerTableSql,
  true,
  'boundaries: OK',
);

runCase(
  'rule 10 rejects Core owner-table imports outside owner modules and in test-support',
  {
    ...zero,
    [join(MODULES, 'findings', 'creation.ts')]:
      "import { managedSystems as coreManagedSystems } from '../../db/schema/core.js';\n",
    [join(FEATURE_BACKEND, 'src', 'test-support', 'seed.ts')]:
      "import { analyticsAreas } from '../db/schema/core';\n",
  },
  false,
  [
    `${FEATURE_BACKEND}/src/modules/findings/creation.ts:1`,
    `${FEATURE_BACKEND}/src/test-support/seed.ts:1`,
  ],
);

runCase(
  'rule 10 allows Core owner-table imports in owner modules and skips tests',
  {
    ...zero,
    [join(MODULES, 'analytics-areas', 'schema-import.ts')]:
      "import { analyticsAreas } from '../../db/schema/core.js';\n",
    [join(MODULES, 'tasks', '__tests__', 'fixture.test.ts')]:
      "import { managedSystems } from '../../../db/schema/core.js';\n",
  },
  true,
  'boundaries: OK',
);

runCase(
  'rule 10 rejects raw Core owner-table SQL outside the owner modules',
  {
    ...ownerTableSql,
    [join(MODULES, 'findings', 'creation.ts')]:
      'const result = await tx.execute(sql`select * from core.analytics_areas`);\n',
    [join(MODULES, 'tasks', 'service.ts')]: [
      'const rows = await tx.execute(sql`select * from core.managed_systems`);',
      'await tx.execute(sql`update core.managed_systems set archived_at = now()`);',
    ].join('\n'),
  },
  false,
  [
    `${FEATURE_BACKEND}/src/modules/findings/creation.ts:1`,
    `${FEATURE_BACKEND}/src/modules/tasks/service.ts:1`,
    `${FEATURE_BACKEND}/src/modules/tasks/service.ts:2`,
  ],
);

runCase(
  'rule 10 rejects comma joins and USING references to Core owner tables',
  {
    ...zero,
    [join(MODULES, 'tasks', 'comma-join.ts')]:
      'const rows = await tx.execute(sql`select * from voc.vocs v, core.managed_systems ms`);\n',
    [join(MODULES, 'tasks', 'using.ts')]:
      'await tx.execute(sql`delete from voc.vocs using core.analytics_areas`);\n',
  },
  false,
  [
    `${FEATURE_BACKEND}/src/modules/tasks/comma-join.ts:1`,
    `${FEATURE_BACKEND}/src/modules/tasks/using.ts:1`,
  ],
);

runCase(
  'rule 11 allows @ap/ui in source and other @ap/* packages in tests only',
  {
    ...zero,
    [join(FEATURE_UI, 'src', 'index.ts')]:
      "export { Button } from '@ap/ui';\nimport '@ap/ui/styles.css';\n",
    [join(MODULES, 'platform-port', '__tests__', 'conformance.test.ts')]: [
      "import { describeServerConformance } from '@ap/server-conformance';",
      "import { bootstrapHttpAdapter } from '@ap/http-adapter';",
    ].join('\n'),
    [join(FEATURE_BACKEND, 'src', 'test-support', 'vocab.ts')]:
      "import type { Permission } from '@ap/contracts';\n",
    [join(FEATURE_FRONTEND, 'tests', 'visual', 'probe.ts')]:
      "import { PERMISSIONS } from '@ap/contracts';\n",
  },
  true,
  'boundaries: OK',
);

runCase(
  'rule 11 rejects a non-ui platform package imported from source',
  {
    ...zero,
    [join(MODULES, 'platform-port', 'permissions.ts')]:
      "import { PERMISSIONS } from '@ap/contracts';\n",
    [join(FEATURE_FRONTEND, 'src', 'lib', 'shell.ts')]: "export * from '@ap/shell';\n",
    [join(FEATURE_SHARED, 'src', 'kernel.ts')]: "const k = await import('@ap/kernel');\n",
  },
  false,
  [
    `${FEATURE_BACKEND}/src/modules/platform-port/permissions.ts:1`,
    `${FEATURE_FRONTEND}/src/lib/shell.ts:1`,
    `${FEATURE_SHARED}/src/kernel.ts:1`,
  ],
);

runCase(
  'rule 11 allows @ap/ui as a runtime dependency and other @ap/* packages as devDependencies',
  {
    ...zero,
    [join(FEATURE_FRONTEND, 'package.json')]: JSON.stringify({
      dependencies: {
        '@ap/ui': 'git+https://example.test/sdk.git#sdk-v0.5.0',
        react: '19.0.0',
      },
    }),
    [join(FEATURE_BACKEND, 'package.json')]: JSON.stringify({
      dependencies: { fastify: '5.2.0' },
      devDependencies: {
        '@ap/contracts': 'link:../../../../packages/sdk/contracts',
        '@ap/http-adapter': 'link:../../../../packages/adapters/http-adapter',
        '@ap/server-conformance': 'link:../../../../packages/adapters/server-conformance',
      },
    }),
    [join(FEATURE_SHARED, 'package.json')]: JSON.stringify({
      name: '@ap/feature-shared',
    }),
  },
  true,
  'boundaries: OK',
);

runCase(
  'rule 11 rejects a non-ui platform package under runtime dependencies',
  {
    ...zero,
    [join(FEATURE_BACKEND, 'package.json')]: JSON.stringify({
      dependencies: {
        '@ap/contracts': 'link:../../../../packages/sdk/contracts',
      },
    }),
    [join(FEATURE_SHARED, 'package.json')]: JSON.stringify({
      dependencies: { '@ap/ui': '0.5.0', '@ap/kernel': '0.5.0' },
    }),
  },
  false,
  [
    `${FEATURE_BACKEND}/package.json: dependencies may list only @ap/ui from the platform; @ap/contracts`,
    `${FEATURE_SHARED}/package.json: dependencies may list only @ap/ui from the platform; @ap/kernel`,
  ],
);

runCase(
  'rule 11 also reads the feature tool package manifest and peer/optional dependencies',
  {
    ...zero,
    [join(FEATURE_OPS, 'package.json')]: JSON.stringify({
      dependencies: { '@ap/kernel': 'workspace:*' },
    }),
    [join(FEATURE_UI, 'package.json')]: JSON.stringify({
      peerDependencies: { react: '^19.0.0', '@ap/contracts': 'workspace:*' },
      optionalDependencies: { '@ap/http-adapter': 'workspace:*' },
    }),
  },
  false,
  [
    `${FEATURE_OPS}/package.json: dependencies may list only @ap/ui from the platform; @ap/kernel`,
    `${FEATURE_UI}/package.json: peerDependencies may list only @ap/ui from the platform; @ap/contracts`,
    `${FEATURE_UI}/package.json: optionalDependencies may list only @ap/ui from the platform; @ap/http-adapter`,
  ],
);

runCase(
  'frontend importing the sibling backend app fails',
  {
    ...zero,
    [join(FEATURE_FRONTEND, 'src', 'probe.ts')]:
      "import x from '../../platform-api/src/server.js';\n",
  },
  false,
  [`${FEATURE_FRONTEND}/src/probe.ts:`, 'must not import apps/platform-api'],
);

runCase(
  'backend importing the sibling frontend app fails',
  {
    ...zero,
    [join(FEATURE_BACKEND, 'src', 'probe.ts')]:
      "import x from '../../feature-screens/src/main.js';\n",
  },
  false,
  [`${FEATURE_BACKEND}/src/probe.ts:`, 'apps/feature-screens'],
);

// ADR-0097 partially supersedes rule 11 only for the core server.
runCase(
  'server contract-schemas runtime is permitted',
  {
    [join(FEATURE_BACKEND, 'src/port.ts')]:
      "import { x } from '@ap/contract-schemas'; const y = require('@ap/contract-schemas/wire');",
    [join(FEATURE_BACKEND, 'package.json')]: JSON.stringify({
      dependencies: {
        '@ap/contract-schemas': 'workspace:*',
        '@ap/feature-shared': 'workspace:*',
      },
    }),
  },
  true,
  'boundaries: OK',
);
for (const scope of [FEATURE_FRONTEND, FEATURE_SHARED, FEATURE_UI, FEATURE_OPS]) {
  runCase(
    `${scope} cannot import server schemas`,
    {
      [join(scope, 'src/port.ts')]: "const x = require('@ap/contract-schemas');",
      [join(scope, 'package.json')]: JSON.stringify({
        optionalDependencies: { '@ap/contract-schemas': 'workspace:*' },
      }),
    },
    false,
    [
      `${scope}/src/port.ts:1`,
      `${scope}/package.json: optionalDependencies may list only @ap/ui from the platform; @ap/contract-schemas belongs in devDependencies`,
    ],
  );
}
for (const source of ['@ap/feature-shared', '@ap/feature-shared/wire']) {
  runCase(
    `own package ${source} allowed`,
    {
      [join(FEATURE_BACKEND, 'src/port.ts')]: `import { x } from '${source}';`,
    },
    true,
    'boundaries: OK',
  );
}
runCase(
  'near neighbor is not an own package',
  {
    [join(FEATURE_BACKEND, 'src/port.ts')]: "import { x } from '@ap/feature-shared-extra';",
  },
  false,
  `${FEATURE_BACKEND}/src/port.ts:1`,
);
runCase(
  'require cannot bypass runtime SDK ban',
  {
    [join(FEATURE_BACKEND, 'src/port.ts')]: "const x = require('@ap/kernel');",
  },
  false,
  `${FEATURE_BACKEND}/src/port.ts:1`,
);

// Lint-only exception (#1102): exact package-root eslint.config.js may import exactly @ap/eslint-config.
const LINT_PRESET = "export { featureServerPreset as default } from '@ap/eslint-config';\n";
runCase(
  'lint exception allows the exact root eslint.config.js of the migrated packages',
  {
    ...zero,
    [join(FEATURE_BACKEND, 'eslint.config.js')]: LINT_PRESET,
    [join(FEATURE_SHARED, 'eslint.config.js')]:
      "import { featureSharedPreset } from '@ap/eslint-config';\nexport default featureSharedPreset;\n",
    [join(FEATURE_UI, 'eslint.config.js')]: LINT_PRESET,
    [join(FEATURE_FRONTEND, 'eslint.config.js')]:
      "export { featureScreensPreset as default } from '@ap/eslint-config';\n",
  },
  true,
  'boundaries: OK',
);
runCase(
  'lint exception does not reach runtime files, nested lookalikes or other package roots',
  {
    ...zero,
    [join(FEATURE_BACKEND, 'src', 'eslint.config.js')]: LINT_PRESET,
    [join(FEATURE_UI, 'src', 'nested', 'eslint.config.js')]: LINT_PRESET,
    [join(FEATURE_BACKEND, 'src', 'lint.ts')]:
      "import { featureServerPreset } from '@ap/eslint-config';\n",
    [join(FEATURE_OPS, 'eslint.config.js')]: LINT_PRESET,
    [join(FEATURE_FRONTEND, 'src', 'eslint.config.js')]: LINT_PRESET,
    [join(FEATURE_FRONTEND, 'src', 'lint.ts')]:
      "import { featureScreensPreset } from '@ap/eslint-config';\n",
    [join(FEATURE_SHARED, 'eslint.config.ts')]: LINT_PRESET,
  },
  false,
  [
    `${FEATURE_BACKEND}/src/eslint.config.js:1`,
    `${FEATURE_UI}/src/nested/eslint.config.js:1`,
    `${FEATURE_BACKEND}/src/lint.ts:1`,
    `${FEATURE_OPS}/eslint.config.js:1`,
    `${FEATURE_FRONTEND}/src/eslint.config.js:1`,
    `${FEATURE_FRONTEND}/src/lint.ts:1`,
    `${FEATURE_SHARED}/eslint.config.ts:1`,
  ],
);
runCase(
  'lint exception names one package: subpaths and other @ap/* stay denied in the config file',
  {
    ...zero,
    [join(FEATURE_BACKEND, 'eslint.config.js')]: "export * from '@ap/eslint-config/feature';\n",
    [join(FEATURE_SHARED, 'eslint.config.js')]:
      "import { PERMISSIONS } from '@ap/contracts';\nconst k = await import('@ap/kernel');\n",
    [join(FEATURE_UI, 'eslint.config.js')]:
      "export * from '@ap/eslint-config-extra';\nconst c = require('@ap/ui/../shell');\n",
    [join(FEATURE_FRONTEND, 'eslint.config.js')]:
      "export { featureScreensPreset } from '@ap/eslint-config/feature';\nimport '@ap/kernel';\n",
  },
  false,
  [
    `${FEATURE_FRONTEND}/eslint.config.js:1`,
    `${FEATURE_FRONTEND}/eslint.config.js:2`,
    `${FEATURE_BACKEND}/eslint.config.js:1`,
    `${FEATURE_SHARED}/eslint.config.js:1`,
    `${FEATURE_SHARED}/eslint.config.js:2`,
    `${FEATURE_UI}/eslint.config.js:1`,
  ],
);

// Rule 12: approved cross-module surfaces and the shrink-only baseline.
const BASELINE = join(FEATURE_OPS, 'scripts', 'check-boundaries.baseline.json');
const baselineOf = (...pairs) => JSON.stringify({ total: pairs.length, pairs });
const OFF = `${MODULES}/tasks/service.ts -> findings/record`;

runCase(
  'rule 12 fails a new off-surface import that is not in the baseline',
  {
    ...zero,
    [join(MODULES, 'tasks', 'service.ts')]: "import { x } from '../findings/record.js';\n",
  },
  false,
  [`${MODULES}/tasks/service.ts:1`, 'not an approved surface'],
);

runCase(
  'rule 12 passes an off-surface pair frozen in the baseline',
  {
    ...zero,
    [join(MODULES, 'tasks', 'service.ts')]: "import { x } from '../findings/record.js';\n",
    [BASELINE]: baselineOf(OFF),
  },
  true,
  'boundaries: OK',
);

runCase(
  'rule 12 fails a new pair in a file that already has a baseline pair',
  {
    ...zero,
    [join(MODULES, 'tasks', 'service.ts')]:
      "import { x } from '../findings/record.js';\nimport { y } from '../surveys/results.js';\n",
    [BASELINE]: baselineOf(OFF),
  },
  false,
  [`${MODULES}/tasks/service.ts:2`],
);

runCase(
  'rule 12 fails a stale baseline pair and says to delete it',
  {
    ...zero,
    [join(MODULES, 'tasks', 'service.ts')]: "import { x } from '../findings/index.js';\n",
    [BASELINE]: baselineOf(OFF),
  },
  false,
  ['baseline pair no longer exists', OFF, 'delete the line'],
);

runCase(
  'rule 12 allows every approved surface, the module directory and same-module imports',
  {
    ...zero,
    [join(MODULES, 'tasks', 'service.ts')]: [
      "import { a } from '../findings/index.js';",
      "import { b } from '../findings';",
      "import { c } from '../findings/read-projections.js';",
      "import { d } from '../findings/read-service.js';",
      "import { e } from '../findings/authorization.js';",
      "import type { f } from '../voc/read-contract.js';",
      "import { g } from '../core/responsibility-read-projections.js';",
      "import { h } from './inner/thing.js';",
      "import { i } from '../findings/commands.js';",
      "import { j } from '../permissions/check-service.js';",
      "import { k } from '../core/audit/audit-service.js';",
      "import type { l } from '../menu-dispatch/types.js';",
    ].join('\n'),
  },
  true,
  'boundaries: OK',
);

runCase(
  'rule 12 catches re-export, dynamic import and import-type forms, and skips tests',
  {
    ...zero,
    [join(MODULES, 'tasks', 'a.ts')]: "export { x } from '../findings/record.js';\n",
    [join(MODULES, 'tasks', 'b.ts')]: "const m = await import('../findings/record.js');\n",
    [join(MODULES, 'tasks', 'c.ts')]: "type T = import('../findings/record.js').X;\n",
    [join(MODULES, 'tasks', 'd.ts')]: "import { x } from '../findings/nested/read-service.js';\n",
    [join(MODULES, 'tasks', '__tests__', 'e.test.ts')]:
      "import { x } from '../../findings/record.js';\n",
  },
  false,
  [
    `${MODULES}/tasks/a.ts:1`,
    `${MODULES}/tasks/b.ts:1`,
    `${MODULES}/tasks/c.ts:1`,
    `${MODULES}/tasks/d.ts:1`,
  ],
);

runCase(
  'rule 12 keeps .mjs and .js targets as different baseline pairs',
  {
    ...zero,
    [join(MODULES, 'tasks', 'service.ts')]:
      "import { x } from '../findings/record.js';\nimport { y } from '../findings/record.mjs';\n",
    [BASELINE]: baselineOf(OFF),
  },
  false,
  [`${MODULES}/tasks/service.ts:2`],
);

runCase(
  'rule 12 catches import-equals require',
  {
    ...zero,
    [join(MODULES, 'tasks', 'a.ts')]: "import other = require('../findings/record.cjs');\n",
  },
  false,
  [`${MODULES}/tasks/a.ts:1`],
);

runCase(
  'rule 12 fails a baseline whose total differs from its pairs',
  {
    ...zero,
    [join(MODULES, 'tasks', 'service.ts')]: "import { x } from '../findings/record.js';\n",
    [BASELINE]: JSON.stringify({ total: 2, pairs: [OFF] }),
  },
  false,
  ['total is 2'],
);

// --shrink-baseline removes stale pairs and never adds a live off-surface pair.
{
  const tmp = mkdtempSync(join(tmpdir(), 'boundary-test-'));
  try {
    const KEPT = `${MODULES}/tasks/service.ts -> findings/record`;
    const STALE = `${MODULES}/tasks/gone.ts -> findings/record`;
    const files = {
      ...zero,
      [join(MODULES, 'tasks', 'service.ts')]: "import { x } from '../findings/record.js';\n",
      [join(MODULES, 'tasks', 'new.ts')]: "import { y } from '../surveys/results.js';\n",
      [BASELINE]: baselineOf(KEPT, STALE),
    };
    for (const [rel, content] of Object.entries(files)) {
      const dest = join(tmp, rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content);
    }
    try {
      execFileSync('node', [SCRIPT, '--shrink-baseline'], {
        encoding: 'utf8',
        stdio: 'pipe',
        env: fixtureEnv(tmp),
      });
    } catch {
      // The live new pair still fails the run; the file is what this case checks.
    }
    const written = JSON.parse(readFileSync(join(tmp, BASELINE), 'utf8'));
    assert.deepEqual(written, { total: 1, pairs: [KEPT] });
    console.log('ok - rule 12 --shrink-baseline removes stale pairs and adds none');
  } catch (err) {
    failures += 1;
    console.error(`not ok - rule 12 --shrink-baseline: ${err.message}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Baseline growth against the merge-base (#1675). Each case builds a real git history: `main` holds the base files,
// `feat` the head files; FEATURE_LINT_BASE points at main.
function gitCase(
  name,
  { base, head, trailer, env = {}, expectExit0, expectOutput, headBaselineDeleted },
) {
  const tmp = mkdtempSync(join(tmpdir(), 'boundary-git-'));
  const git = (...args) =>
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
      {
        cwd: tmp,
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );
  const write = (files) => {
    for (const [rel, content] of Object.entries(files)) {
      const dest = join(tmp, rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content);
    }
  };
  try {
    git('init', '-q', '-b', 'main');
    write(base);
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    git('checkout', '-q', '-b', 'feat');
    write(head);
    if (headBaselineDeleted) rmSync(join(tmp, BASELINE));
    git('add', '-A');
    git('commit', '-q', '-m', trailer ? `change\n\n${trailer}` : 'change');
    let out = '';
    let exit = 0;
    try {
      out = execFileSync('node', [SCRIPT], {
        encoding: 'utf8',
        env: fixtureEnv(tmp, { FEATURE_LINT_BASE: 'main', ...env }),
      });
    } catch (err) {
      exit = err.status ?? 1;
      out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }
    assert.equal(exit, expectExit0 ? 0 : 1, `${name}: exit ${exit}\n${out}`);
    for (const fragment of expectOutput ?? []) {
      assert.ok(out.includes(fragment), `${name}: output missing "${fragment}"\n${out}`);
    }
    process.stdout.write(`ok - ${name}\n`);
  } catch (err) {
    failures++;
    console.error(`not ok - ${name}\n${err.message}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const SERVICE = join(MODULES, 'tasks', 'service.ts');
const baseTree = { ...zero, [BASELINE]: baselineOf() };
const grown = {
  [SERVICE]: "import { x } from '../findings/record.js';\n",
  [BASELINE]: baselineOf(OFF),
};

gitCase('rule 12 growth: an added pair with its baseline line fails and names the trailer', {
  base: baseTree,
  head: grown,
  expectExit0: false,
  expectOutput: ['pair added since the merge-base', 'Boundary-Baseline-Growth: #<issue> <reason>'],
});

gitCase('rule 12 growth: the same change passes with a Boundary-Baseline-Growth trailer', {
  base: baseTree,
  head: grown,
  trailer: 'Boundary-Baseline-Growth: #1675 tasks needs the record seam until the service split',
  expectExit0: true,
  expectOutput: ['approved by a Boundary-Baseline-Growth trailer'],
});

gitCase('rule 12 growth: a trailer without issue and reason does not count', {
  base: baseTree,
  head: grown,
  trailer: 'Boundary-Baseline-Growth: please',
  expectExit0: false,
});

gitCase('rule 12 growth: shrinking the baseline passes', {
  base: { ...zero, [SERVICE]: grown[SERVICE], [BASELINE]: baselineOf(OFF) },
  head: { [SERVICE]: 'export const x = 1;\n', [BASELINE]: baselineOf() },
  expectExit0: true,
});

gitCase('rule 12 growth: a baseline the merge-base has but the tree lacks fails', {
  base: { ...zero, [SERVICE]: grown[SERVICE], [BASELINE]: baselineOf(OFF) },
  head: {},
  headBaselineDeleted: true,
  expectExit0: false,
  expectOutput: ['missing here'],
});

gitCase('rule 12 growth: a push event skips the comparison', {
  base: baseTree,
  head: grown,
  env: { GITHUB_EVENT_NAME: 'push' },
  expectExit0: true,
});

gitCase('rule 12 growth: a manual release run skips the comparison', {
  base: baseTree,
  head: grown,
  env: { GITHUB_EVENT_NAME: 'workflow_dispatch' },
  expectExit0: true,
});

gitCase('rule 12 growth: a pull_request event compares', {
  base: baseTree,
  head: grown,
  env: { GITHUB_EVENT_NAME: 'pull_request' },
  expectExit0: false,
  expectOutput: ['pair added since the merge-base'],
});

gitCase('rule 12 growth: an unresolvable base fails under CI', {
  base: baseTree,
  head: grown,
  env: { CI: 'true', FEATURE_LINT_BASE: 'no-such-ref' },
  expectExit0: false,
  expectOutput: ['no merge-base'],
});

gitCase('rule 12 growth: an unresolvable base is skipped locally with a note', {
  base: baseTree,
  head: grown,
  env: { FEATURE_LINT_BASE: 'no-such-ref' },
  expectExit0: true,
  expectOutput: ['growth check skipped'],
});

gitCase('rule 12 growth: a merge-base without a baseline file compares nothing', {
  base: zero,
  head: grown,
  expectExit0: true,
});

gitCase(
  'rule 12 growth: new recovery-read, recorder and provider-types imports need no baseline change',
  {
    base: baseTree,
    head: {
      [join(MODULES, 'tasks', 'a.ts')]: "import { r } from '../voc/recovery-read.js';\n",
      [join(MODULES, 'voc', 'b.ts')]: "import { r } from '../findings/recovery-read.js';\n",
      [join(MODULES, 'voc', 'c.ts')]: "import { r } from '../dashboard/recorder.js';\n",
      [join(MODULES, 'voc', 'd.ts')]:
        "import type { p } from '../entity-links/provider-types.js';\n",
    },
    expectExit0: true,
  },
);

if (failures > 0) {
  console.error(`\n${failures} test case(s) failed`);
  process.exit(1);
}
process.stdout.write('\ncheck-boundaries tests: OK\n');
