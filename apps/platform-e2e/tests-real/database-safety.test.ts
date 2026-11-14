import assert from 'node:assert/strict';
import test from 'node:test';
import { globSync, readFileSync } from 'node:fs';
import { matchesGlob } from 'node:path';
import ts from 'typescript';
import { requireSafeRealDatabaseEnv } from './database-safety.ts';

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
const url = (
  role: string,
  database: string,
  tail = '',
  host = 'localhost',
  port = '5439',
  password = 'pw',
) => `postgres://${role}:${password}@${host}:${port}/${database}${tail}`;
const env = (overrides: Record<string, string> = {}) => ({
  DATABASE_URL: url('platform_app', 'platform_wave'),
  DATABASE_URL_MIGRATE: url('platform_migrate', 'platform_wave'),
  WORKSPACE_ID,
  ...overrides,
});

test('accepts the platform roles on a platform_<name> clone at localhost:5439', () => {
  const safe = requireSafeRealDatabaseEnv(env());
  assert.equal(safe.database, 'platform_wave');
  assert.equal(safe.app.username, 'platform_app');
  assert.equal(safe.migrate.username, 'platform_migrate');
  assert.equal(safe.app.port, 5439);
});

test('refuses the old role names and the old clone prefix', () => {
  assert.throws(
    () => requireSafeRealDatabaseEnv(env({ DATABASE_URL: url('fops_app', 'platform_wave') })),
    /platform_app role/,
  );
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(
        env({ DATABASE_URL_MIGRATE: url('fops_migrate', 'platform_wave') }),
      ),
    /platform_migrate role/,
  );
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(
        env({
          DATABASE_URL: url('platform_app', 'feedbackops_wave'),
          DATABASE_URL_MIGRATE: url('platform_migrate', 'feedbackops_wave'),
        }),
      ),
    /platform_<name> database/,
  );
});

test('refuses the platform template, mismatched databases and swapped roles', () => {
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(
        env({
          DATABASE_URL: url('platform_app', 'platform'),
          DATABASE_URL_MIGRATE: url('platform_migrate', 'platform'),
        }),
      ),
    /template is refused/,
  );
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(
        env({ DATABASE_URL_MIGRATE: url('platform_migrate', 'platform_other') }),
      ),
    /same platform_<name> database/,
  );
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(env({ DATABASE_URL: url('platform_migrate', 'platform_wave') })),
    /platform_app role/,
  );
});

test('keeps the host, port, password and override protections', () => {
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(
        env({ DATABASE_URL: url('platform_app', 'platform_wave', '', 'db.example') }),
      ),
    /localhost only/,
  );
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(
        env({ DATABASE_URL: url('platform_app', 'platform_wave', '', 'localhost', '5434') }),
      ),
    /development port 5434/,
  );
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(
        env({ DATABASE_URL: url('platform_app', 'platform_wave', '', 'localhost', '5432') }),
      ),
    /port 5439/,
  );
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(
        env({ DATABASE_URL: url('platform_app', 'platform_wave', '', 'localhost', '5439', '') }),
      ),
    /non-empty password/,
  );
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(
        env({ DATABASE_URL: url('platform_app', 'platform_wave', '?host=other') }),
      ),
    /query or fragment/,
  );
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(env({ DATABASE_URL: ` ${url('platform_app', 'platform_wave')}` })),
    /whitespace/,
  );
  assert.throws(
    () => requireSafeRealDatabaseEnv(env({ DATABASE_URL: '' })),
    /DATABASE_URL is required/,
  );
});


// Read declarations without importing configs: importing the real config requires database environment values.
test('every real spec is selected by exactly one real Playwright project', () => {
  const root = new URL('../', import.meta.url);
  const property = (object: ts.ObjectLiteralExpression, name: string) => object.properties.find(
    (node): node is ts.PropertyAssignment => ts.isPropertyAssignment(node) && node.name.getText().replace(/['"]/g, '') === name,
  )?.initializer;
  const literal = (node: ts.Expression | undefined): string => {
    assert.ok(node && ts.isStringLiteral(node), 'testMatch/testIgnore must remain auditable string literals');
    return node.text;
  };
  const projects: { config: string; match: string; project: string; ignore?: string }[] = [];
  for (const config of globSync('playwright.real*.config.ts', { cwd: root })) {
    const source = ts.createSourceFile(config, readFileSync(new URL(config, root), 'utf8'), ts.ScriptTarget.Latest, true);
    const statement = source.statements.find(ts.isExportAssignment);
    assert.ok(statement && ts.isCallExpression(statement.expression));
    const options = statement.expression.arguments[0];
    assert.ok(options && ts.isObjectLiteralExpression(options));
    assert.equal(literal(property(options, 'testDir')), './tests-real');
    const ignoreNode = property(options, 'testIgnore');
    const ignore = ignoreNode ? literal(ignoreNode) : undefined;
    const declared = property(options, 'projects');
    if (!declared) {
      projects.push({ config, project: 'default', match: literal(property(options, 'testMatch')), ignore });
      continue;
    }
    assert.ok(ts.isArrayLiteralExpression(declared));
    for (const project of declared.elements) {
      assert.ok(ts.isObjectLiteralExpression(project));
      projects.push({ config, project: literal(property(project, 'name')), match: literal(property(project, 'testMatch')), ignore });
    }
  }
  const specs = globSync('**/*.real.spec.ts', { cwd: new URL('tests-real/', root) });
  assert.ok(projects.length > 0 && specs.length > 0, 'project and spec discovery must be nonempty');
  for (const spec of specs) {
    const matches = projects.filter(project => matchesGlob(spec, project.match) && (!project.ignore || !matchesGlob(spec, project.ignore)));
    assert.equal(matches.length, 1, `${spec}: expected exactly one project, got ${JSON.stringify(matches)}`);
  }
});
