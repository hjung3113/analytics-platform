const QUERY_PATTERN = /[?&]/;

function literalMatches(node) {
  return typeof node.value === 'string' && QUERY_PATTERN.test(node.value);
}

/**
 * Walk only the expressions that actually construct the URL. Approved URL
 * builders (linkTo calls, identifiers, member reads) stop the walk, so data
 * handed to them — including query-like keys and localized text with `?` or
 * `&` — is never reported. For logical expressions both sides are value
 * positions except the guard operand of `&&`, which is a condition, not the
 * URL. Condition tests of conditionals are likewise conditions, not the URL.
 */
function walk(node, report) {
  if (!node) return;
  switch (node.type) {
    case 'Literal':
      if (literalMatches(node)) report(node);
      return;
    case 'TemplateLiteral': {
      // Raw interpolation is not encoded: quasis are URL text, and a
      // substitution can itself be the URL (or part of one), so expressions
      // go through the same walker.
      for (const quasi of node.quasis) {
        if (QUERY_PATTERN.test(quasi.value.raw)) {
          report(node);
          return;
        }
      }
      for (const expression of node.expressions) walk(expression, report);
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
      // `&&` left operand is a guard condition; both sides of `??`/`||`
      // can be the returned URL.
      if (node.operator === '&&') {
        walk(node.right, report);
        return;
      }
      walk(node.left, report);
      walk(node.right, report);
      return;
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
    case 'TSTypeAssertion':
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
