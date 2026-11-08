import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

// The files Playwright runs, per config: `playwright.config.ts` (testDir `tests`) uses Playwright's default testMatch
// (`*.spec.*` and `*.test.*`); `playwright.real.config.ts` / `playwright.real-down.config.ts` (testDir `tests-real`) run
// `*.real.spec.ts` only, so the node tests next to them (this guard included) are not Playwright files.
const RUNNER_MATCH: Readonly<Record<string, RegExp>> = {
  tests: /\.(?:spec|test)\.[cm]?[jt]sx?$/,
  'tests-real': /\.real\.spec\.ts$/,
};

function specs(directory: string, match: RegExp): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? specs(path, match) : match.test(entry.name) ? [path] : [];
  });
}

const RECORDING = ['trace', 'screenshot', 'video'];
const UNSAFE = '<not a string literal>';

// Inspect syntax, so comments and settings inside individual tests cannot satisfy the guard.
function settings(statements: ts.NodeArray<ts.Statement>) {
  let noCopyPrompt = false;
  const recording = new Map<string, string>();
  for (const statement of statements) {
    if (!ts.isExpressionStatement(statement)) continue;
    const expression = statement.expression;
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && expression.left.getText() === 'process.env.PLAYWRIGHT_NO_COPY_PROMPT'
      && ts.isStringLiteral(expression.right) && expression.right.text === '1') noCopyPrompt = true;
    if (!ts.isCallExpression(expression) || expression.expression.getText() !== 'test.use') continue;
    const options = expression.arguments[0];
    // Anything the guard cannot read as a literal is unsafe and must not inherit an outer 'off': a non-object
    // argument, a spread, a computed key, or a value other than a string literal (`{ mode: 'on' }`, a variable).
    if (!options || !ts.isObjectLiteralExpression(options)) {
      for (const option of RECORDING) recording.set(option, UNSAFE);
      continue;
    }
    for (const property of options.properties) {
      if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) {
        for (const option of RECORDING) recording.set(option, UNSAFE);
        continue;
      }
      const name = property.name.getText().replace(/['"]/g, '');
      if (!RECORDING.includes(name)) continue;
      recording.set(name, ts.isStringLiteralLike(property.initializer) ? property.initializer.text : UNSAFE);
    }
  }
  return { noCopyPrompt, recording };
}

test('every credential spec disables copy prompts and all automatic recording at file/describe scope', () => {
  const root = new URL('../', import.meta.url).pathname;
  let checked = 0;
  for (const path of Object.entries(RUNNER_MATCH).flatMap(([dir, match]) => specs(join(root, dir), match))) {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node, scopes: ReturnType<typeof settings>[]) => {
      if (ts.isCallExpression(node) && /^test\.describe(?:\.(?:serial|parallel|only|skip|fixme))?$/.test(node.expression.getText())) {
        const callback = node.arguments.find(argument => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument));
        if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && ts.isBlock(callback.body)) {
          visit(callback.body, [...scopes, settings(callback.body.statements)]);
          return;
        }
      }
      if ((ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) && /token-secret|한 번만 표시|\/api-tokens/.test(node.getText())) {
        checked++;
        const recording = new Map(scopes.flatMap(scope => [...scope.recording]));
        assert.ok(scopes.some(scope => scope.noCopyPrompt), `${path}: missing scoped PLAYWRIGHT_NO_COPY_PROMPT=1`);
        for (const option of RECORDING) {
          assert.equal(recording.get(option), 'off', `${path}: missing scoped ${option}: 'off'`);
        }
      }
      ts.forEachChild(node, child => visit(child, scopes));
    };
    visit(source, [settings(source.statements)]);
  }
  assert.ok(checked > 0, 'credential spec discovery must not be empty');
});
