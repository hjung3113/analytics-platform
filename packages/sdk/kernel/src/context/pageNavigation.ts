export type PageFocus = 'drill' | 'return' | 'page';

/** `focus` query value, or null when the key is absent. An empty value is present. */
function focusKeyOf(href: string): string | null {
  const query = href.split('?')[1]?.split('#')[0] ?? '';
  return new URLSearchParams(query).get('focus');
}

/** Provider-owned handoff: only explicit navigation owns a focus request.
 * Kernel default writes belong to that same generation, even during a slow lazy load.
 * A page/return arrival (and the initial URL) that carries `focus=` does not claim the
 * detail close button. A same-screen open, drill, or history step that changes `focus` does.
 */
export function createPageNavigation(initialUrl: string, isBlocked: () => boolean = () => false, canonicalHref: (href: string) => string = href => href) {
  let generation = 0;
  let url = initialUrl;
  let pending: { generation: number; path: string; focus: PageFocus } | null = null;
  // A page request kept for a mounted blocked screen belongs to the screens subscribed at that moment (owners).
  // It survives their own re-subscription (StrictMode effect replay, same-screen URL rewrite) and ends once
  // none of them is subscribed when it would be read: another screen in their place never inherits it.
  let keepers: Set<unknown> | null = null;
  let seenFocus = focusKeyOf(initialUrl);
  let claimsDetail = seenFocus === null;
  const listeners = new Map<() => void, unknown>();
  const keeperGone = () => keepers !== null && ![...listeners.values()].some(owner => keepers!.has(owner));
  const pathOf = (href: string) => href.split('?')[0];
  const rememberFocus = (next: string, focus?: PageFocus) => {
    const nextFocus = focusKeyOf(next);
    if (focus === 'page' || focus === 'return') claimsDetail = nextFocus === null;
    else if (focus === 'drill' || nextFocus !== seenFocus) claimsDetail = true;
    seenFocus = nextFocus;
  };
  return {
    advance(next: string, focus?: PageFocus) {
      rememberFocus(next, focus);
      generation += 1;
      url = next;
      pending = focus ? { generation, path: pathOf(next), focus } : null;
      keepers = null;
    },
    materialize(next: string) {
      if (pathOf(next) !== pathOf(url)) { generation += 1; pending = null; keepers = null; }
      url = next;
      // A kernel rewrite is not the user opening the panel. Keep the claim, but see the new key.
      seenFocus = focusKeyOf(next);
    },
    /** The alias entry was replaced by its canonical address (ADR-0093): same arrival, new path. Keeps a pending request. */
    redirect(next: string) {
      url = next;
      if (pending) pending = { ...pending, path: pathOf(next) };
      seenFocus = focusKeyOf(next);
    },
    requestReturn(href: string) {
      // A legacy-form `returnTo` still names the current page: compare in canonical form.
      const target = canonicalHref(href);
      pending = target === canonicalHref(url) ? { generation, path: pathOf(target), focus: 'return' } : null;
      keepers = null;
      if (pending) claimsDetail = focusKeyOf(target) === null;
    },
    // A mounted blocked main screen subscribes for its title's arrival. Without a consumer, even page focus must expire.
    cancel(preservePage = false) {
      if (preservePage && pending?.focus === 'page' && listeners.size > 0 && !keeperGone()) keepers ??= new Set(listeners.values());
      else { pending = null; keepers = null; }
    },
    notify() { listeners.forEach((_owner, listener) => listener()); },
    /** `owner` names the screen instance across its own re-subscriptions; without one, each listener is its own owner. */
    subscribe(listener: () => void, owner: unknown = listener) {
      listeners.set(listener, owner);
      return () => { listeners.delete(listener); };
    },
    consume(path: string): PageFocus | null {
      if (pending?.focus === 'page' && isBlocked()) return null;
      const request = keeperGone() ? null : pending;
      pending = null;
      keepers = null;
      return request?.generation === generation && request.path === path ? request.focus : null;
    },
    claimsDetailFocus() { return claimsDetail; },
  };
}
export type PageNavigation = Pick<ReturnType<typeof createPageNavigation>, 'requestReturn' | 'consume' | 'subscribe' | 'claimsDetailFocus'>;
