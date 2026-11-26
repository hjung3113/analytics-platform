/**
 * Releases a "this node had focus" flag after a blur, once the commit has settled. A blur without a destination may come from the node being
 * removed (it stays disconnected: keep the flag for focus recovery) or from a programmatic restore that focuses the same node, or a node inside
 * it, again in the same task (it holds focus again: keep the flag). Only a node that is still connected and no longer holds focus releases
 * (#3072).
 */
export function releaseFocusLater(node: Element, release: () => void): void {
  queueMicrotask(() => {
    if (node.isConnected && !node.contains(node.ownerDocument.activeElement)) release();
  });
}
