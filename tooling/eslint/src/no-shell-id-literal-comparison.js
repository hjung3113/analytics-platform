// #201: the shell renders whatever the Registry declares; it never branches on a hard-coded group or menu id.
// Any member access whose property is an id-like key (`x.id`, `x.group`, `x.menuId`, optional chains included) is
// treated as a Registry identifier regardless of the local variable name, and comparing it to a string/template
// literal — by ==/===/!=/!==, a switch case, or `[...literals].includes(member)` — is reported, as is a literal
// argument to `groupById` / `menuById`. The complementary source scan (packages/shell/src/no-group-id-literals.test.ts)
// catches GroupId literals in any other syntax.
const ID_KEYS = new Set(['id', 'group', 'menuId']);
const COMPARISON_OPERATORS = new Set(['==', '===', '!=', '!==']);
const LOOKUPS = new Set(['groupById', 'menuById']);

function unwrap(node) {
  return node?.type === 'ChainExpression' ? node.expression : node;
}

function idMember(node) {
  const n = unwrap(node);
  if (n?.type !== 'MemberExpression' || n.computed) return null;
  return n.property.type === 'Identifier' && ID_KEYS.has(n.property.name) ? n : null;
}

function isStringLike(node) {
  return (node?.type === 'Literal' && typeof node.value === 'string')
    || (node?.type === 'TemplateLiteral' && node.expressions.length === 0);
}

function describe(member) {
  const object = member.object.type === 'Identifier' ? member.object.name : '…';
  return `${object}.${member.property.name}`;
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'keep shell behavior independent of hard-coded group and menu ids' },
    messages: {
      noIdLiteral: 'Use Registry declarations instead of comparing {{member}} to a string literal.',
      noIdLookupLiteral: 'Use Registry declarations instead of looking up a hard-coded id with {{lookup}}().',
    },
    schema: [],
  },
  create(context) {
    const report = (node, member) => context.report({ node, messageId: 'noIdLiteral', data: { member: describe(member) } });
    return {
      BinaryExpression(node) {
        if (!COMPARISON_OPERATORS.has(node.operator)) return;
        const left = idMember(node.left);
        const right = idMember(node.right);
        if (left && isStringLike(node.right)) report(node, left);
        else if (right && isStringLike(node.left)) report(node, right);
      },
      SwitchStatement(node) {
        const member = idMember(node.discriminant);
        if (member && node.cases.some(c => isStringLike(c.test))) report(node, member);
      },
      CallExpression(node) {
        const callee = unwrap(node.callee);
        if (callee?.type !== 'MemberExpression' || callee.computed || callee.property.type !== 'Identifier') return;
        const name = callee.property.name;
        if (name === 'includes' && callee.object.type === 'ArrayExpression'
          && callee.object.elements.some(isStringLike)) {
          const member = idMember(node.arguments[0]);
          if (member) report(node, member);
        } else if (LOOKUPS.has(name) && isStringLike(node.arguments[0])) {
          context.report({ node, messageId: 'noIdLookupLiteral', data: { lookup: name } });
        }
      },
    };
  },
};
