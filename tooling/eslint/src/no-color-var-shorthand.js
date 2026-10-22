// A theme color reached through Tailwind's CSS-variable shorthand (`bg-(--color-red-500)`) passes both
// shadcn/no-raw-colors and shadcn/no-arbitrary-values, so it bypasses the token contract (DESIGN.md). Every
// --color-* token already has a utility class (`bg-<token>`); local layout variables (`w-(--rail-width)`) stay allowed.
const COLOR_VAR_SHORTHAND = /(?:^|[\s:"'`])!?[a-z][\w-]*-\(--color-[\w-]+\)/;

function check(context, node, text) {
  if (typeof text === 'string' && COLOR_VAR_SHORTHAND.test(text)) context.report({ node, messageId: 'shorthand' });
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'use the token utility class instead of a --color-* variable shorthand' },
    messages: {
      shorthand: 'Use the token utility class (e.g. bg-<token>) instead of a -(--color-*) shorthand; it bypasses the design-system color rules.',
    },
    schema: [],
  },
  create(context) {
    return {
      Literal: (node) => check(context, node, node.value),
      TemplateElement: (node) => check(context, node, node.value.cooked),
    };
  },
};
