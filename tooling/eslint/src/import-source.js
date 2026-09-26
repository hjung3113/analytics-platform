import { PACKAGE_PREFIX } from './prefix.js';

// Applies the same import decision as the preset's no-restricted-imports
// (same options object, built from the same restriction data in index.js)
// to literal sources of dynamic import, TS import types, and require calls:
//   - ImportExpression  import('x')
//   - TSImportType      import('x').T
//   - CallExpression    require('x')
// Relative sources are owned by ap/no-relative-package-escape and ignored here.

/**
 * Decide whether a string source is restricted for this layer.
 * Returns the violation message, or null when the import is allowed.
 * Mirrors no-restricted-imports pattern semantics: deep subpaths are always
 * banned; `allow: null` means every package entry is allowed; mockAllowed
 * exempts exactly the mock-server entry (never its subpaths).
 */
function makeEvaluate(opts) {
  const allow = 'allow' in opts ? opts.allow : null;
  return (source) => {
    if (typeof source !== 'string') return null;
    if (source.startsWith(PACKAGE_PREFIX)) {
      const rest = source.slice(PACKAGE_PREFIX.length);
      const slash = rest.indexOf('/');
      const name = slash === -1 ? rest : rest.slice(0, slash);
      if (slash !== -1) return opts.deepMessage;
      if (name === 'mock-server') return opts.mockAllowed ? null : opts.mockMessage;
      if (opts.allow === null) return null;
      return allow.includes(name) ? null : opts.layerMessage;
    }
    if (
      opts.denyReact &&
      (source === 'react' ||
        source === 'react-dom' ||
        source.startsWith('react/') ||
        source.startsWith('react-dom/'))
    ) {
      return opts.reactMessage;
    }
    return null;
  };
}

const restrictedImportSource = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Apply the preset import restrictions to literal dynamic imports, TS import() types, and require() calls',
    },
    schema: [{ type: 'object' }],
    messages: {
      restricted: '{{message}}',
    },
  },
  create(context) {
    const evaluate = makeEvaluate(context.options[0] ?? {});
    const checkLiteral = (node) => {
      if (!node || node.type !== 'Literal' || typeof node.value !== 'string') return;
      const message = evaluate(node.value);
      if (message) context.report({ node, messageId: 'restricted', data: { message } });
    };
    return {
      ImportExpression: (node) => checkLiteral(node.source),
      // typescript-estree <8 names the string `argument`, >=8 names it `source`.
      TSImportType: (node) => checkLiteral(node.source ?? node.argument),
      CallExpression: (node) => {
        if (
          node.callee &&
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require'
        ) {
          checkLiteral(node.arguments[0]);
        }
      },
    };
  },
};

export default restrictedImportSource;
