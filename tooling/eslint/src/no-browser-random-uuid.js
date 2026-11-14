// #2017: `crypto.randomUUID` is missing outside a secure context (plain HTTP on a non-localhost origin), so a direct
// browser call throws a TypeError and the write never leaves. Only the browser *call* is reported: the global receivers
// `crypto`, `globalThis.crypto` and `window.crypto` invoking `.randomUUID()`. Safe uses stay legal — feature detection
// (`crypto.randomUUID === undefined`, `typeof crypto.randomUUID`) is not a call, and other objects (`nodeCrypto.randomUUID()`
// in a Node-only test) are not a browser global. The one guarded call everyone else must go through is `mintIdempotencyKey()` /
// `randomUuidV4()` of `@/lib/api/idempotency`.
const BROWSER_RECEIVERS = new Set(['crypto', 'globalThis.crypto', 'window.crypto']);

// The dotted spelling of a plain member chain of identifiers (`globalThis.crypto`); undefined when any link is computed or
// non-identifier (`foo['crypto']`, `getCrypto().crypto`), which this rule cannot vouch for.
function dottedReceiver(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
    const base = dottedReceiver(node.object);
    return base === undefined ? undefined : `${base}.${node.property.name}`;
  }
  return undefined;
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'call randomUuidV4()/mintIdempotencyKey() instead of crypto.randomUUID(), which is missing outside a secure context' },
    messages: {
      insecure: "crypto.randomUUID is missing on plain HTTP. Use mintIdempotencyKey() for an Idempotency-Key, randomUuidV4() for any other id ('@/lib/api/idempotency').",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression' || callee.computed) return;
        if (callee.property.type !== 'Identifier' || callee.property.name !== 'randomUUID') return;
        if (BROWSER_RECEIVERS.has(dottedReceiver(callee.object))) context.report({ node: callee, messageId: 'insecure' });
      },
    };
  },
};
