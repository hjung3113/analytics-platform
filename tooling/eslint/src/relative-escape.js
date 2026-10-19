import fs from 'node:fs';
import path from 'node:path';

import { PACKAGE_PREFIX } from './prefix.js';

/**
 * Nearest package.json whose `name` starts with the package prefix, walking
 * up from `startDir`. Lexical only: no realpath/symlink resolution.
 * With `anyName`, any named package.json owns the file (an external module keeps its own scope).
 * Returns null when no owning package root exists (bad filePath must not pass).
 */
function findOwningPackage(startDir, anyName = false) {
  let dir = startDir;
  for (;;) {
    const manifest = path.join(dir, 'package.json');
    if (fs.existsSync(manifest)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        if (typeof pkg.name === 'string' && (anyName || pkg.name.startsWith(PACKAGE_PREFIX))) {
          return { root: dir, name: pkg.name };
        }
      } catch {
        // Unreadable/malformed manifest: keep walking.
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The string a Literal or a substitution-free template names (a template is the same static source), else null. */
function staticString(node) {
  if (!node) return null;
  if (node.type === 'Literal') return typeof node.value === 'string' ? node.value : null;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked ?? null;
  return null;
}

/** The source of import/export expressions, when it is a relative static string. */
function relativeSourceLiteral(node) {
  const source = node.source;
  return staticString(source)?.startsWith('.') ? source : null;
}

const noRelativePackageEscape = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow relative imports and exports that leave the owning workspace package',
    },
    schema: [{ type: 'object', properties: { anyPackageName: { type: 'boolean' }, root: { type: 'string' } }, additionalProperties: false }],
    messages: {
      escape:
        "Relative path '{{source}}' escapes package '{{pkg}}'. Import the package entry ('{{pkg}}') instead.",
      noRoot:
        "No owning package found (no package.json whose name starts with the workspace prefix) for '{{file}}'.",
    },
  },
  create(context) {
    const fileDir = path.dirname(context.filename);
    // `root` (relative to the lint cwd) makes a directory the boundary, for a module that is not its own package.
    const root = context.options[0]?.root;
    const owner = root === undefined
      ? findOwningPackage(fileDir, context.options[0]?.anyPackageName === true)
      : { root: path.resolve(context.cwd, root), name: root };

    const checkLiteral = (source) => {
      if (!source) return;
      if (!owner) {
        context.report({
          node: source,
          messageId: 'noRoot',
          data: { file: context.filename },
        });
        return;
      }
      const value = staticString(source);
      const resolved = path.resolve(fileDir, value);
      if (resolved !== owner.root && !resolved.startsWith(owner.root + path.sep)) {
        context.report({
          node: source,
          messageId: 'escape',
          data: { source: value, pkg: owner.name },
        });
      }
    };

    // import ... from '...' / export ... from '...' / import('...')
    const checkNode = (node) => checkLiteral(relativeSourceLiteral(node));

    // require('<relative>')
    const checkRequire = (node) => {
      if (!node.callee || node.callee.type !== 'Identifier' || node.callee.name !== 'require') {
        return;
      }
      const arg = node.arguments[0];
      if (!staticString(arg)?.startsWith('.')) return;
      checkLiteral(arg);
    };

    // typeof import('<relative>') / type T = import('<relative>').X
    // typescript-estree <8 puts the string in `argument` (as a TSLiteralType
    // or Literal), >=8 in `source` (Literal).
    const checkImportType = (node) => {
      const candidate = node.source ?? node.argument;
      if (!candidate) return;
      const literal =
        candidate.type === 'Literal'
          ? candidate
          : candidate.type === 'TSLiteralType'
            ? candidate.literal
            : null;
      if (
        literal &&
        literal.type === 'Literal' &&
        typeof literal.value === 'string' &&
        literal.value.startsWith('.')
      ) {
        checkLiteral(literal);
      }
    };

    // import x = require('<relative>')
    const checkImportEquals = (node) => {
      const ref = node.moduleReference;
      if (!ref || ref.type !== 'TSExternalModuleReference') return;
      const expression = ref.expression;
      if (
        expression &&
        expression.type === 'Literal' &&
        typeof expression.value === 'string' &&
        expression.value.startsWith('.')
      ) {
        checkLiteral(expression);
      }
    };

    return {
      ImportDeclaration: checkNode,
      ExportNamedDeclaration: checkNode,
      ExportAllDeclaration: checkNode,
      ImportExpression: checkNode,
      CallExpression: checkRequire,
      TSImportType: checkImportType,
      TSImportEqualsDeclaration: checkImportEquals,
    };
  },
};

export { findOwningPackage, noRelativePackageEscape as default };
