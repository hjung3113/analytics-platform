// Focused test for the cross-module-repo-import rule in check-boundaries.mjs.
// Builds throwaway fixture trees laid out by the path map (ops/platform-api/paths.mjs), runs the checker against each
// tree through FO_PATHS_REPO_ROOT, and removes the tree afterwards.
// Run: node ops/platform-api/scripts/check-boundaries.test.mjs

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FO_BACKEND, FO_FRONTEND, FO_OPS, FO_SHARED, FO_UI } from '../paths.mjs';

const SCRIPT = fileURLToPath(new URL('check-boundaries.mjs', import.meta.url));
const MODULES = join(FO_BACKEND, 'src', 'modules');

let failures = 0;

function runCase(name, files, expectExit0, expectOutput) {
  const tmp = mkdtempSync(join(tmpdir(), 'boundary-test-'));
  try {
    // The checker runs from its real location (so `typescript` resolves from this package's node_modules); the
    // fixture tree is its repository root through FO_PATHS_REPO_ROOT, isolated from the real production tree.
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
        env: { ...process.env, FO_PATHS_REPO_ROOT: tmp },
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
  `${FO_BACKEND}/src/modules/findings/record.ts:1`,
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
  `${FO_BACKEND}/src/modules/voc/jobs/purge.ts:1`,
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
  `${FO_BACKEND}/src/modules/surveys/results.ts:2`,
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
    `${FO_BACKEND}/src/modules/surveys/results.ts:2`,
    `${FO_BACKEND}/src/modules/surveys/results.ts:3`,
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
  `${FO_BACKEND}/src/modules/surveys/results.ts:2`,
);

runCase(
  'rule 8 rejects VOC hook imports through the feature alias',
  {
    ...zero,
    [join(FO_FRONTEND, 'src', 'features', 'findings', 'x.ts')]:
      "import { useThing } from '@/features/voc/hooks/useThing';\n",
  },
  false,
  `${FO_FRONTEND}/src/features/findings/x.ts:1`,
);

runCase(
  'rule 8 rejects relative VOC lib imports from src/lib',
  {
    ...zero,
    [join(FO_FRONTEND, 'src', 'lib', 'x.ts')]:
      "import { helper } from '../features/voc/lib/helper';\n",
  },
  false,
  `${FO_FRONTEND}/src/lib/x.ts:1`,
);

runCase(
  'rule 8 treats voc-cluster as a non-VOC feature',
  {
    ...zero,
    [join(FO_FRONTEND, 'src', 'features', 'voc-cluster', 'x.ts')]:
      "import { useThing } from '@/features/voc/hooks/useThing';\n",
  },
  false,
  `${FO_FRONTEND}/src/features/voc-cluster/x.ts:1`,
);

runCase(
  'rule 8 excludes frontend tests and allows VOC feature internals',
  {
    ...zero,
    [join(FO_FRONTEND, 'src', 'features', 'findings', '__tests__', 'x.test.ts')]:
      "import { useThing } from '@/features/voc/hooks/useThing';\n",
    [join(FO_FRONTEND, 'src', 'features', 'voc', 'components', 'x.tsx')]:
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
  `${FO_BACKEND}/src/modules/voc-clusters/__tests__/a.test.ts:1`,
);

runCase(
  'rule 9 rejects any cross-module seed-helper import (#574)',
  {
    ...zero,
    [join(MODULES, 'tasks', '__tests__', 'a.test.ts')]:
      "import { seed } from '../../findings/__tests__/_seed-helpers.js';\n",
  },
  false,
  `${FO_BACKEND}/src/modules/tasks/__tests__/a.test.ts:1`,
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
    [join(FO_BACKEND, 'src', 'test-support', 'seed.ts')]:
      "import { analyticsAreas } from '../db/schema/core';\n",
  },
  false,
  [`${FO_BACKEND}/src/modules/findings/creation.ts:1`, `${FO_BACKEND}/src/test-support/seed.ts:1`],
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
    `${FO_BACKEND}/src/modules/findings/creation.ts:1`,
    `${FO_BACKEND}/src/modules/tasks/service.ts:1`,
    `${FO_BACKEND}/src/modules/tasks/service.ts:2`,
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
  [`${FO_BACKEND}/src/modules/tasks/comma-join.ts:1`, `${FO_BACKEND}/src/modules/tasks/using.ts:1`],
);

runCase(
  'rule 11 allows @ap/ui in source and other @ap/* packages in tests only',
  {
    ...zero,
    [join(FO_UI, 'src', 'index.ts')]:
      "export { Button } from '@ap/ui';\nimport '@ap/ui/styles.css';\n",
    [join(MODULES, 'platform-port', '__tests__', 'conformance.test.ts')]: [
      "import { describeServerConformance } from '@ap/server-conformance';",
      "import { bootstrapHttpAdapter } from '@ap/http-adapter';",
    ].join('\n'),
    [join(FO_BACKEND, 'src', 'test-support', 'vocab.ts')]:
      "import type { Permission } from '@ap/contracts';\n",
    [join(FO_FRONTEND, 'tests', 'visual', 'probe.ts')]:
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
    [join(FO_FRONTEND, 'src', 'lib', 'shell.ts')]: "export * from '@ap/shell';\n",
    [join(FO_SHARED, 'src', 'kernel.ts')]: "const k = await import('@ap/kernel');\n",
  },
  false,
  [
    `${FO_BACKEND}/src/modules/platform-port/permissions.ts:1`,
    `${FO_FRONTEND}/src/lib/shell.ts:1`,
    `${FO_SHARED}/src/kernel.ts:1`,
  ],
);

runCase(
  'rule 11 allows @ap/ui as a runtime dependency and other @ap/* packages as devDependencies',
  {
    ...zero,
    [join(FO_FRONTEND, 'package.json')]: JSON.stringify({
      dependencies: { '@ap/ui': 'git+https://example.test/sdk.git#sdk-v0.5.0', react: '19.0.0' },
    }),
    [join(FO_BACKEND, 'package.json')]: JSON.stringify({
      dependencies: { fastify: '5.2.0' },
      devDependencies: {
        '@ap/contracts': 'link:../../../../packages/sdk/contracts',
        '@ap/http-adapter': 'link:../../../../packages/adapters/http-adapter',
        '@ap/server-conformance': 'link:../../../../packages/adapters/server-conformance',
      },
    }),
    [join(FO_SHARED, 'package.json')]: JSON.stringify({ name: '@ap/feature-shared' }),
  },
  true,
  'boundaries: OK',
);

runCase(
  'rule 11 rejects a non-ui platform package under runtime dependencies',
  {
    ...zero,
    [join(FO_BACKEND, 'package.json')]: JSON.stringify({
      dependencies: { '@ap/contracts': 'link:../../../../packages/sdk/contracts' },
    }),
    [join(FO_SHARED, 'package.json')]: JSON.stringify({
      dependencies: { '@ap/ui': '0.5.0', '@ap/kernel': '0.5.0' },
    }),
  },
  false,
  [
    `${FO_BACKEND}/package.json: dependencies may list only @ap/ui from the platform; @ap/contracts`,
    `${FO_SHARED}/package.json: dependencies may list only @ap/ui from the platform; @ap/kernel`,
  ],
);

runCase(
  'rule 11 also reads the FeedbackOps tool package manifest and peer/optional dependencies',
  {
    ...zero,
    [join(FO_OPS, 'package.json')]: JSON.stringify({
      dependencies: { '@ap/kernel': 'workspace:*' },
    }),
    [join(FO_UI, 'package.json')]: JSON.stringify({
      peerDependencies: { react: '^19.0.0', '@ap/contracts': 'workspace:*' },
      optionalDependencies: { '@ap/http-adapter': 'workspace:*' },
    }),
  },
  false,
  [
    `${FO_OPS}/package.json: dependencies may list only @ap/ui from the platform; @ap/kernel`,
    `${FO_UI}/package.json: peerDependencies may list only @ap/ui from the platform; @ap/contracts`,
    `${FO_UI}/package.json: optionalDependencies may list only @ap/ui from the platform; @ap/http-adapter`,
  ],
);

runCase(
  'frontend importing the sibling backend app fails',
  {
    ...zero,
    [join(FO_FRONTEND, 'src', 'probe.ts')]: "import x from '../../platform-api/src/server.js';\n",
  },
  false,
  [`${FO_FRONTEND}/src/probe.ts:`, 'must not import apps/platform-api'],
);

runCase(
  'backend importing the sibling frontend app fails',
  {
    ...zero,
    [join(FO_BACKEND, 'src', 'probe.ts')]: "import x from '../../feature-screens/src/main.js';\n",
  },
  false,
  [`${FO_BACKEND}/src/probe.ts:`, 'apps/feature-screens'],
);

// ADR-0097 partially supersedes rule 11 only for the core server.
runCase(
  'server contract-schemas runtime is permitted',
  {
    [join(FO_BACKEND, 'src/port.ts')]:
      "import { x } from '@ap/contract-schemas'; const y = require('@ap/contract-schemas/wire');",
    [join(FO_BACKEND, 'package.json')]: JSON.stringify({
      dependencies: { '@ap/contract-schemas': 'workspace:*', '@ap/feature-shared': 'workspace:*' },
    }),
  },
  true,
  'boundaries: OK',
);
for (const scope of [FO_FRONTEND, FO_SHARED, FO_UI, FO_OPS]) {
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
      [join(FO_BACKEND, 'src/port.ts')]: `import { x } from '${source}';`,
    },
    true,
    'boundaries: OK',
  );
}
runCase(
  'near neighbor is not an own package',
  {
    [join(FO_BACKEND, 'src/port.ts')]: "import { x } from '@ap/feature-shared-extra';",
  },
  false,
  `${FO_BACKEND}/src/port.ts:1`,
);
runCase(
  'require cannot bypass runtime SDK ban',
  {
    [join(FO_BACKEND, 'src/port.ts')]: "const x = require('@ap/kernel');",
  },
  false,
  `${FO_BACKEND}/src/port.ts:1`,
);

// Lint-only exception (#1102): exact package-root eslint.config.js may import exactly @ap/eslint-config.
const LINT_PRESET = "export { foServer as default } from '@ap/eslint-config';\n";
runCase(
  'lint exception allows the exact root eslint.config.js of the migrated packages',
  {
    ...zero,
    [join(FO_BACKEND, 'eslint.config.js')]: LINT_PRESET,
    [join(FO_SHARED, 'eslint.config.js')]:
      "import { foShared } from '@ap/eslint-config';\nexport default foShared;\n",
    [join(FO_UI, 'eslint.config.js')]: LINT_PRESET,
    [join(FO_FRONTEND, 'eslint.config.js')]:
      "export { foScreens as default } from '@ap/eslint-config';\n",
  },
  true,
  'boundaries: OK',
);
runCase(
  'lint exception does not reach runtime files, nested lookalikes or other package roots',
  {
    ...zero,
    [join(FO_BACKEND, 'src', 'eslint.config.js')]: LINT_PRESET,
    [join(FO_UI, 'src', 'nested', 'eslint.config.js')]: LINT_PRESET,
    [join(FO_BACKEND, 'src', 'lint.ts')]: "import { foServer } from '@ap/eslint-config';\n",
    [join(FO_OPS, 'eslint.config.js')]: LINT_PRESET,
    [join(FO_FRONTEND, 'src', 'eslint.config.js')]: LINT_PRESET,
    [join(FO_FRONTEND, 'src', 'lint.ts')]: "import { foScreens } from '@ap/eslint-config';\n",
    [join(FO_SHARED, 'eslint.config.ts')]: LINT_PRESET,
  },
  false,
  [
    `${FO_BACKEND}/src/eslint.config.js:1`,
    `${FO_UI}/src/nested/eslint.config.js:1`,
    `${FO_BACKEND}/src/lint.ts:1`,
    `${FO_OPS}/eslint.config.js:1`,
    `${FO_FRONTEND}/src/eslint.config.js:1`,
    `${FO_FRONTEND}/src/lint.ts:1`,
    `${FO_SHARED}/eslint.config.ts:1`,
  ],
);
runCase(
  'lint exception names one package: subpaths and other @ap/* stay denied in the config file',
  {
    ...zero,
    [join(FO_BACKEND, 'eslint.config.js')]: "export * from '@ap/eslint-config/feature';\n",
    [join(FO_SHARED, 'eslint.config.js')]:
      "import { PERMISSIONS } from '@ap/contracts';\nconst k = await import('@ap/kernel');\n",
    [join(FO_UI, 'eslint.config.js')]:
      "export * from '@ap/eslint-config-extra';\nconst c = require('@ap/ui/../shell');\n",
    [join(FO_FRONTEND, 'eslint.config.js')]:
      "export { foScreens } from '@ap/eslint-config/feature';\nimport '@ap/kernel';\n",
  },
  false,
  [
    `${FO_FRONTEND}/eslint.config.js:1`,
    `${FO_FRONTEND}/eslint.config.js:2`,
    `${FO_BACKEND}/eslint.config.js:1`,
    `${FO_SHARED}/eslint.config.js:1`,
    `${FO_SHARED}/eslint.config.js:2`,
    `${FO_UI}/eslint.config.js:1`,
  ],
);

if (failures > 0) {
  console.error(`\n${failures} test case(s) failed`);
  process.exit(1);
}
process.stdout.write('\ncheck-boundaries tests: OK\n');
