const QUERY_PATTERN = /[?&]/;

function literalMatches(node) {
  return typeof node.value === 'string' && QUERY_PATTERN.test(node.value);
}

/**
 * Walk only the expressions that actually construct the URL. Approved URL
 * builders (linkTo calls, identifiers, member reads) stop the walk, so data
 * handed to them — including query-like keys and localized text with `?` or
 * `&` — is never reported. Condition tests and logical left sides are not
 * part of the URL and are skipped.
 */
function walk(node, report) {
  if (!node) return;
  switch (node.type) {
    case 'Literal':
      if (literalMatches(node)) report(node);
      return;
    case 'TemplateLiteral': {
      // Quasis are the URL text; expressions are values the builder encodes.
      for (const quasi of node.quasis) {
        if (QUERY_PATTERN.test(quasi.value.raw)) {
          report(node);
          return;
        }
      }
      return;
    }
    case 'BinaryExpression':
      if (node.operator === '+') {
        walk(node.left, report);
        walk(node.right, report);
      }
      return;
    case 'ConditionalExpression':
      walk(node.consequent, report);
      walk(node.alternate, report);
      return;
    case 'LogicalExpression':
      walk(node.right, report);
      return;
    case 'TSAsExpression':
    case 'TSNonNullExpression':
    case 'ParenthesizedExpression':
      walk(node.expression, report);
      return;
    default:
      return;
  }
}

function isNavigateCallee(callee) {
  if (!callee) return false;
  if (callee.type === 'Identifier') return callee.name === 'navigate';
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'navigate'
  );
}

const noHandBuiltUrl = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow hand-built query strings in menu href attributes and navigate() targets',
    },
    schema: [{ type: 'object' }],
    messages: {
      handBuilt: '{{message}}',
    },
  },
  create(context) {
    const message = (context.options[0] ?? {}).message ?? '';
    const report = (node) => context.report({ node, messageId: 'handBuilt', data: { message } });
    return {
      JSXAttribute: (node) => {
        if (!node.name || node.name.type !== 'JSXIdentifier' || node.name.name !== 'href') return;
        const value = node.value;
        if (!value) return;
        if (value.type === 'Literal') {
          if (literalMatches(value)) report(value);
          return;
        }
        if (value.type === 'JSXExpressionContainer') walk(value.expression, report);
      },
      CallExpression: (node) => {
        if (!isNavigateCallee(node.callee)) return;
        walk(node.arguments[0], report);
      },
    };
  },
};

export default noHandBuiltUrl;
