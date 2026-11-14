// #2174: user-visible copy lives in a message table (the Kernel dictionary or the package's `messages.ts`, values typed
// `Text` = `{ ko, en }`), never in a `lang === 'ko' ? '…' : '…'` ternary scattered through a component. A table keeps one
// translation per phrase, lets the type system catch a missing language, and lets the copy be reviewed in one place.
//
// Reported: a conditional expression whose test compares anything to the string literal 'ko' or 'en' (==, ===, !=, !==,
// either side, through `!`), or whose test is a local constant initialised with such a comparison (`const ko = lang === 'ko'`
// followed by `ko ? … : …`). Not reported: a ternary whose two branches are both language codes or locale tags
// (`=== 'en' ? 'en' : 'ko'`, `=== 'ko' ? 'ko-KR' : 'en-US'`) — that switches the language value itself, not copy.
// A branch that is not copy (a date format, a grammar particle) takes an eslint-disable-next-line with its reason.
const LANGS = new Set(['ko', 'en']);
const COMPARISON_OPERATORS = new Set(['==', '===', '!=', '!==']);
const LANGUAGE_VALUE = /^(ko|en)(-[A-Z]{2})?$/;

const isLangLiteral = node => node?.type === 'Literal' && typeof node.value === 'string' && LANGS.has(node.value);

function isLangComparison(node) {
  if (node?.type === 'UnaryExpression' && node.operator === '!') return isLangComparison(node.argument);
  return node?.type === 'BinaryExpression' && COMPARISON_OPERATORS.has(node.operator)
    && (isLangLiteral(node.left) || isLangLiteral(node.right));
}

const isLanguageValue = node => node?.type === 'Literal' && typeof node.value === 'string' && LANGUAGE_VALUE.test(node.value);

function findVariable(scope, name) {
  for (let s = scope; s; s = s.upper) {
    const variable = s.set.get(name);
    if (variable) return variable;
  }
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'keep ko/en copy in a message table instead of a language ternary' },
    messages: {
      noLangTernary: 'Move this ko/en copy into a message table (the Kernel dictionary or this package\'s messages.ts, values typed Text) and read it with the current language instead of a language ternary.',
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode;
    function isLangTest(node, scopeNode) {
      if (node?.type === 'UnaryExpression' && node.operator === '!') return isLangTest(node.argument, scopeNode);
      if (isLangComparison(node)) return true;
      if (node?.type !== 'Identifier') return false;
      const variable = findVariable(sourceCode.getScope(scopeNode), node.name);
      const def = variable?.defs.length === 1 ? variable.defs[0] : null;
      return def?.type === 'Variable' && def.parent.kind === 'const' && isLangComparison(def.node.init);
    }
    return {
      ConditionalExpression(node) {
        if (!isLangTest(node.test, node)) return;
        if (isLanguageValue(node.consequent) && isLanguageValue(node.alternate)) return;
        context.report({ node, messageId: 'noLangTernary' });
      },
    };
  },
};
