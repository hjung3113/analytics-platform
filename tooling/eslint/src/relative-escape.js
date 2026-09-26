import fs from 'node:fs';
import path from 'node:path';

import { PACKAGE_PREFIX } from './prefix.js';

/**
 * Nearest package.json whose `name` starts with the package prefix, walking
 * up from `startDir`. Lexical only: no realpath/symlink resolution.
 * Returns null when no owning package root exists (bad filePath must not pass).
 */
function findOwningPackage(startDir) {
  let dir = startDir;
  for (;;) {
    const manifest = path.join(dir, 'package.json');
    if (fs.existsSync(manifest)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        if (typeof pkg.name === 'string' && pkg.name.startsWith(PACKAGE_PREFIX)) {
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

/** The source literal of import/export expressions, when it is a relative string. */
function relativeSourceLiteral(node) {
  const source = node.source;
  if (!source || source.type !== 'Literal' || typeof source.value !== 'string') return null;
  return source.value.startsWith('.') ? source : null;
}

const noRelativePackageEscape = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow relative imports and exports that leave the owning workspace package',
    },
    schema: [],
    messages: {
      escape:
        "Relative path '{{source}}' escapes package '{{pkg}}'. Import the package entry ('{{pkg}}') instead.",
      noRoot:
        "No owning package found (no package.json whose name starts with the workspace prefix) for '{{file}}'.",
    },
  },
  create(context) {
    const fileDir = path.dirname(context.filename);
    const owner = findOwningPackage(fileDir);

    const check = (node) => {
      const source = relativeSourceLiteral(node);
      if (!source) return;
      if (!owner) {
        context.report({
          node: source,
          messageId: 'noRoot',
          data: { file: context.filename },
        });
        return;
      }
      const resolved = path.resolve(fileDir, source.value);
      if (resolved !== owner.root && !resolved.startsWith(owner.root + path.sep)) {
        context.report({
          node: source,
          messageId: 'escape',
          data: { source: source.value, pkg: owner.name },
        });
      }
    };

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};

export default noRelativePackageEscape;
