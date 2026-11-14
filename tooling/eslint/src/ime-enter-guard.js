// #2215: the Enter that confirms a Korean (or any IME) composition must never select, add or commit. `isComposing` alone
// misses the Enter Safari fires right after `compositionend`, and some browsers report only keyCode 229, so a text field's
// Enter handler goes through `useImeEnterGuard().isComposingEnter(event)` of the ui package, the one tracker of all three.
//
// Caught: an `onKeyDown` / `onKeyDownCapture` on a text-entry element — `input` (not a checkbox, radio, button-like, file,
// range or color type), `textarea`, `Input`, `Textarea`, `SearchInput`, any element with `contentEditable`, and a non-button
// element with `role="combobox"` — whose handler mentions `'Enter'` and never calls `isComposingEnter(...)`. The handler is
// the inline function, a `useCallback(fn, deps)` around one, or a function of the same file named by an identifier (bound to
// either). A handler that checks `isComposing` or keyCode 229 by hand is caught too, with its own message: it still misses the
// Safari Enter. A guarded handler whose field and JSX ancestors carry no `onCompositionEnd` is caught as well: without it the
// Safari window never arms.
//
// Not caught (the composition never happens there, so a report would only be noise):
// - containers: table rows, buttons (including `<button role="combobox">` triggers), list items, `<form>`, `<div>`;
// - a handler passed through (`onKeyDown={props.onKeyDown}`, `onKeyDown={ime.onKeyDown}`) or built by a call;
// - a dialog or popover content that receives the Enter bubbling from a field inside it (`<DialogContent onKeyDown>` in an
//   editor): that is a review finding, not a lint one, because the rule cannot see which field the Enter came from.
const TEXT_ELEMENTS = new Set(['input', 'textarea', 'Input', 'Textarea', 'SearchInput']);
const BUTTON_ELEMENTS = new Set(['button', 'Button']);
const NON_TEXT_INPUT_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image', 'hidden']);
const HANDLER_PROPS = new Set(['onKeyDown', 'onKeyDownCapture']);
const GUARD_CALL = 'isComposingEnter';

const attribute = (opening, name) =>
  opening.attributes.find((attr) => attr.type === 'JSXAttribute' && attr.name.type === 'JSXIdentifier' && attr.name.name === name);

/** The literal string of a JSX attribute (`role="combobox"`, `type={'search'}`); undefined when it is not a plain literal. */
function literalValue(attr) {
  if (!attr?.value) return undefined;
  if (attr.value.type === 'Literal') return attr.value.value;
  if (attr.value.type === 'JSXExpressionContainer' && attr.value.expression.type === 'Literal') return attr.value.expression.value;
  return undefined;
}

function isTextEntry(opening) {
  const name = opening.name.type === 'JSXIdentifier' ? opening.name.name : undefined;
  const editable = attribute(opening, 'contentEditable');
  if (editable && literalValue(editable) !== false && literalValue(editable) !== 'false') return true;
  if (name !== undefined && TEXT_ELEMENTS.has(name)) {
    const type = literalValue(attribute(opening, 'type'));
    return !(typeof type === 'string' && NON_TEXT_INPUT_TYPES.has(type));
  }
  return literalValue(attribute(opening, 'role')) === 'combobox' && !(name !== undefined && BUTTON_ELEMENTS.has(name));
}

const isFunction = (node) => node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression' || node?.type === 'FunctionDeclaration';

/** `useCallback(fn, deps)` / `React.useCallback(fn, deps)` → `fn`; anything else unchanged. */
function unwrapCallback(node) {
  if (node?.type !== 'CallExpression') return node;
  const callee = node.callee;
  const name = callee.type === 'Identifier' ? callee.name
    : callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier' ? callee.property.name : undefined;
  return name === 'useCallback' ? node.arguments[0] : node;
}

/** The function a handler expression names: inline, `useCallback`-wrapped, or an identifier bound in this file to either. */
function resolveHandler(context, rawExpression) {
  const expression = unwrapCallback(rawExpression);
  if (isFunction(expression)) return expression;
  if (expression?.type !== 'Identifier') return undefined;
  let scope = context.sourceCode.getScope(expression);
  while (scope) {
    const variable = scope.set.get(expression.name);
    if (variable) {
      for (const def of variable.defs) {
        if (def.type === 'FunctionName' && isFunction(def.node)) return def.node;
        const init = unwrapCallback(def.node.init);
        if (def.type === 'Variable' && isFunction(init)) return init;
      }
      return undefined;
    }
    scope = scope.upper;
  }
  return undefined;
}

/** What the handler body says about Enter and composition. */
function scan(root, visitorKeys) {
  const found = { enter: false, guarded: false, handRolled: false };
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.type === 'Literal') {
      if (node.value === 'Enter') found.enter = true;
      if (node.value === 229) found.handRolled = true;
    } else if (node.type === 'Identifier' && node.name === 'isComposing') {
      found.handRolled = true;
    } else if (node.type === 'CallExpression') {
      const callee = node.callee;
      const name = callee.type === 'Identifier' ? callee.name
        : callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier' ? callee.property.name : undefined;
      if (name === GUARD_CALL) found.guarded = true;
    }
    for (const key of visitorKeys[node.type] ?? []) {
      const child = node[key];
      if (Array.isArray(child)) { for (const item of child) if (item && typeof item.type === 'string') stack.push(item); }
      else if (child && typeof child.type === 'string') stack.push(child);
    }
  }
  return found;
}

/** Whether the field or one of its JSX ancestors (a wrapping `<form>`) wires `onCompositionEnd`. */
function compositionWired(opening) {
  for (let node = opening; node; node = node.parent) {
    if (node.type === 'JSXOpeningElement' && attribute(node, 'onCompositionEnd')) return true;
    if (node.type === 'JSXElement' && node.openingElement !== opening && attribute(node.openingElement, 'onCompositionEnd')) return true;
  }
  return false;
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'a text field\'s Enter handler goes through useImeEnterGuard().isComposingEnter so a composition-confirming Enter never acts' },
    messages: {
      missing: 'This Enter handler on a text field also runs for the Enter that confirms a Korean composition. Return early when useImeEnterGuard().isComposingEnter(event) (ui package) is true, and put its onCompositionStart/onCompositionEnd on the field.',
      unwired: 'isComposingEnter(event) only sees the Safari Enter after compositionend when the guard\'s onCompositionStart/onCompositionEnd are on this field (or its form).',
      handRolled: 'isComposing / keyCode 229 checks miss the Enter Safari fires right after compositionend. Use useImeEnterGuard().isComposingEnter(event) (ui package) and put its onCompositionStart/onCompositionEnd on the field.',
    },
    schema: [],
  },
  create(context) {
    const visitorKeys = context.sourceCode.visitorKeys;
    return {
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || !HANDLER_PROPS.has(node.name.name)) return;
        if (node.value?.type !== 'JSXExpressionContainer' || !isTextEntry(node.parent)) return;
        const handler = resolveHandler(context, node.value.expression);
        if (!handler) return;
        const found = scan(handler.body, visitorKeys);
        if (!found.enter) return;
        if (!found.guarded) context.report({ node, messageId: found.handRolled ? 'handRolled' : 'missing' });
        else if (!compositionWired(node.parent)) context.report({ node, messageId: 'unwired' });
      },
    };
  },
};
