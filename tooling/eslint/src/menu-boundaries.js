import path from 'node:path';

import { findOwningPackage } from './relative-escape.js';
import { PACKAGE_PREFIX } from './prefix.js';

function repoRelative(filePath, root) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function sourceLiteral(node) {
  const source = node?.source;
  return source?.type === 'Literal' && typeof source.value === 'string' ? source : null;
}

function importTypeLiteral(node) {
  const candidate = node.source ?? node.argument;
  if (!candidate) return null;
  const literal = candidate.type === 'TSLiteralType' ? candidate.literal : candidate;
  return literal?.type === 'Literal' && typeof literal.value === 'string' ? literal : null;
}

function isInsideMock(relativeFile) {
  return relativeFile === 'src/mock' || relativeFile.startsWith('src/mock/');
}

function resolvesIntoMock(source, fileDir, packageRoot) {
  if (!source.value.startsWith('.')) return false;
  const resolved = path.resolve(fileDir, source.value);
  const mockRoot = path.join(packageRoot, 'src', 'mock');
  return resolved === mockRoot || resolved.startsWith(`${mockRoot}${path.sep}`);
}

// Mock handlers form a closed dependency graph: their relative imports may resolve only
// into the mock subtree or this menu's endpoints module (the step-5 pages allowance closed
// with the cycle-time move, #127). Anything else — `../pages`, `../api`, `../index`,
// `../../package.json`, `../styles.css` — would pull menu internals into the handler graph.
const MOCK_RELATIVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'];

function mockRelativeAllowed(source, fileDir, packageRoot) {
  const resolved = path.resolve(fileDir, source.value);
  const inside = (root) => resolved === root || resolved.startsWith(`${root}${path.sep}`);
  const endpointsModule = path.join(packageRoot, 'src', 'endpoints');
  return (
    inside(path.join(packageRoot, 'src', 'mock')) ||
    resolved === endpointsModule ||
    MOCK_RELATIVE_EXTENSIONS.some((extension) => resolved === `${endpointsModule}${extension}`)
  );
}

const noMenuMockImport = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Mock handlers are importable only via the menu mock subpath, and their own relative imports stay inside the mock allowlist',
    },
    schema: [],
    messages: {
      outsideMock:
        "Menu pages must not import mock handlers; the app registers them via '{{mockSubpath}}'.",
      mockRelative: `Mock handlers may relatively import only src/mock/** and this menu's src/endpoints — not '{{source}}'. Mock handlers import '${PACKAGE_PREFIX}mock-server' and '${PACKAGE_PREFIX}contracts' directly, not menu internals like ../api.`,
    },
  },
  create(context) {
    const owner = findOwningPackage(path.dirname(context.filename));
    if (!owner) return {};

    const relativeFile = repoRelative(context.filename, owner.root);
    const fileDir = path.dirname(context.filename);
    const menuName = owner.name.slice(PACKAGE_PREFIX.length);

    // One visitor set for both directions so static, re-export, export *, dynamic
    // import(), require, typeof import, and import-equals can never drift apart.
    const visitors = (check) => ({
      ImportDeclaration: (node) => check(sourceLiteral(node)),
      ExportNamedDeclaration: (node) => check(sourceLiteral(node)),
      ExportAllDeclaration: (node) => check(sourceLiteral(node)),
      ImportExpression: (node) => check(node.source?.type === 'Literal' ? node.source : null),
      CallExpression(node) {
        if (node.callee?.type !== 'Identifier' || node.callee.name !== 'require') return;
        const source = node.arguments[0];
        check(source?.type === 'Literal' && typeof source.value === 'string' ? source : null);
      },
      TSImportType: (node) => check(importTypeLiteral(node)),
      TSImportEqualsDeclaration(node) {
        const ref = node.moduleReference;
        const source = ref?.type === 'TSExternalModuleReference' ? ref.expression : null;
        check(source?.type === 'Literal' && typeof source.value === 'string' ? source : null);
      },
    });

    // Inside src/mock/**: relative imports must resolve into the mock allowlist.
    if (isInsideMock(relativeFile)) {
      const check = (source) => {
        if (!source || !source.value.startsWith('.')) return;
        if (mockRelativeAllowed(source, fileDir, owner.root)) return;
        context.report({ node: source, messageId: 'mockRelative', data: { source: source.value } });
      };
      return visitors(check);
    }

    // Everywhere else: nothing may reach src/mock/**; the app registers handlers
    // through the menu mock subpath.
    const check = (source) => {
      if (!source || !resolvesIntoMock(source, fileDir, owner.root)) return;
      context.report({
        node: source,
        messageId: 'outsideMock',
        data: { mockSubpath: `${PACKAGE_PREFIX}${menuName}/mock` },
      });
    };
    return visitors(check);
  },
};

export { noMenuMockImport };
