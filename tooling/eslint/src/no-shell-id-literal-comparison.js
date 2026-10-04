const ID_OWNERS = new Set(['group', 'menu']);
const COMPARISON_OPERATORS = new Set(['==', '===', '!=', '!==']);

function isGroupOrMenuId(node) {
  return node?.type === 'MemberExpression'
    && node.computed === false
    && node.object.type === 'Identifier'
    && ID_OWNERS.has(node.object.name)
    && node.property.type === 'Identifier'
    && node.property.name === 'id';
}

function isStringLiteral(node) {
  return node?.type === 'Literal' && typeof node.value === 'string';
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'keep shell behavior independent of hard-coded group and menu ids' },
    messages: {
      noIdLiteral: 'Use Registry declarations instead of comparing {{member}} to a string literal.',
    },
    schema: [],
  },
  create(context) {
    return {
      BinaryExpression(node) {
        if (!COMPARISON_OPERATORS.has(node.operator)) return;
        const member = isGroupOrMenuId(node.left) && isStringLiteral(node.right)
          ? node.left
          : isGroupOrMenuId(node.right) && isStringLiteral(node.left)
            ? node.right
            : null;
        if (!member) return;

        const owner = member.object.name;
        context.report({
          node,
          messageId: 'noIdLiteral',
          data: { member: `${owner}.id` },
        });
      },
    };
  },
};
