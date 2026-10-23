import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

/** Repo-relative menu package folders, including legacy packages so callers can reject them. */
export function menuFolders(root: string): string[] {
  const menus = join(root, 'menus');
  if (!existsSync(menus)) return [];
  const folders: string[] = [];
  for (const space of readdirSync(menus, { withFileTypes: true })) {
    if (!space.isDirectory() && !space.isSymbolicLink()) continue;
    const parent = join(menus, space.name);
    if (!existsSync(parent) || !statSync(parent).isDirectory()) continue;
    if (existsSync(join(parent, 'package.json')) || existsSync(join(parent, 'src/index.ts'))) {
      folders.push(space.name);
      continue;
    }
    for (const group of readdirSync(parent, { withFileTypes: true })) {
      if (group.isDirectory() || (group.isSymbolicLink() && existsSync(join(parent, group.name)) && statSync(join(parent, group.name)).isDirectory())) folders.push(`${space.name}/${group.name}`);
    }
  }
  return folders;
}

const SPACE_ID = /^[a-z][a-z0-9-]*$/;

/** The id an app declaration writes: a string literal or the brand constructor around one (`groupId('x')`, `spaceId('x')`, ADR-0072). Anything else is unreadable. */
export function idLiteral(expr: ts.Expression, constructor: 'groupId' | 'spaceId'): string | undefined {
  if (ts.isStringLiteral(expr)) return expr.text;
  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === constructor && expr.arguments.length === 1) {
    const [arg] = expr.arguments;
    if (arg !== undefined && ts.isStringLiteral(arg)) return arg.text;
  }
  return undefined;
}
export const spaceFolder = (space: string | null): string => space ?? '_global';

/** Read only exported literal arrays. GROUPS rows must be single lines before their marker. */
export function groupSpaces(text: string): Map<string, string | null> {
  const sf = ts.createSourceFile('menus.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  // `[...] satisfies readonly SpaceDef[]` and `[...] as const` still hold a literal array.
  const unwrap = (expr: ts.Expression): ts.Expression => (ts.isSatisfiesExpression(expr) || ts.isAsExpression(expr) ? unwrap(expr.expression) : expr);
  const array = (name: string): ts.ArrayLiteralExpression => {
    const found: ts.ArrayLiteralExpression[] = [];
    for (const stmt of sf.statements) {
      if (!ts.isVariableStatement(stmt) || !(stmt.declarationList.flags & ts.NodeFlags.Const) || !stmt.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      for (const decl of stmt.declarationList.declarations) {
        const init = decl.initializer === undefined ? undefined : unwrap(decl.initializer);
        if (ts.isIdentifier(decl.name) && decl.name.text === name && init && ts.isArrayLiteralExpression(init)) found.push(init);
      }
    }
    if (found.length !== 1) throw new Error(`${name} must have exactly one exported literal array`);
    return found[0] as ts.ArrayLiteralExpression;
  };
  const readable = (row: ts.Node): row is ts.ObjectLiteralExpression => ts.isObjectLiteralExpression(row) &&
    row.properties.every(p => !ts.isSpreadAssignment(p) && (!p.name || !ts.isComputedPropertyName(p.name)));
  const field = (row: ts.ObjectLiteralExpression, name: string, owner: string): ts.Expression => {
    const fields = row.properties.filter(p => p.name && ((ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === name));
    const prop = fields[0];
    if (fields.length !== 1 || !prop || !ts.isPropertyAssignment(prop)) throw new Error(`${owner}: missing or duplicate ${name}`);
    return prop.initializer;
  };
  const spaces = new Set<string>();
  const spacesArray = array('SPACES');
  const marker = text.indexOf('// </gen:menu-groups>');
  if (marker < 0 || spacesArray.getStart(sf) <= marker) throw new Error('SPACES must be below the GROUPS marker');
  for (const row of spacesArray.elements) {
    if (!readable(row)) throw new Error('SPACES has an unreadable row');
    const id = field(row, 'id', 'SPACES');
    const spaceName = idLiteral(id, 'spaceId');
    if (spaceName === undefined || !SPACE_ID.test(spaceName) || spaces.has(spaceName)) throw new Error('SPACES has an invalid or duplicate id');
    spaces.add(spaceName);
  }
  const groups = array('GROUPS');
  if (groups.getStart(sf) >= marker || groups.end <= marker) throw new Error('GROUPS marker must be inside GROUPS');
  const result = new Map<string, string | null>();
  for (const row of groups.elements) {
    if (!readable(row) || row.end > marker || /[\r\n]/.test(row.getText(sf))) throw new Error('GROUPS requires one literal row per line before its marker');
    const id = field(row, 'id', 'GROUPS');
    const space = field(row, 'space', 'GROUPS');
    const groupName = idLiteral(id, 'groupId');
    if (groupName === undefined || result.has(groupName)) throw new Error('GROUPS has an unreadable or duplicate id');
    const spaceName = space.kind === ts.SyntaxKind.NullKeyword ? null : idLiteral(space, 'spaceId');
    if (spaceName === null) result.set(groupName, null);
    else if (spaceName !== undefined && spaces.has(spaceName)) result.set(groupName, spaceName);
    else throw new Error(`GROUPS '${groupName}' has an unreadable or unregistered space`);
  }
  return result;
}
