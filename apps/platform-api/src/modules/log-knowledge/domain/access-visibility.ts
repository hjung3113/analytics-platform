// The visibility rule of the log knowledge objects (#1504 S-a, ADR-0124, design log-knowledge-search §3.4), as a pure
// function. It is the TypeScript twin of `repositories/access-visibility.ts` (the SQL every read and write uses): the unit
// tests pin the rule here, the integration tests pin that the SQL agrees.
//
// An object is visible to an actor iff NO level of its chain (Model → SW version → Item, as far as the object goes) holds an
// active deny for that actor AND every level of the chain is `internal` or holds an active allow for that actor. Hence a
// restricted parent hides all descendants, a child's allow never lifts a parent's restriction, and a deny beats an allow.
// A rule counts only while it is not revoked and not past `validUntil`. There is no admin or service-actor shortcut.

export const ACCESS_MODES = ['internal', 'restricted'] as const;
export type AccessMode = (typeof ACCESS_MODES)[number];

export const ACCESS_TARGET_KINDS = ['model', 'software', 'item'] as const;
export type AccessTargetKind = (typeof ACCESS_TARGET_KINDS)[number];

export const ACCESS_EFFECTS = ['allow', 'deny'] as const;
export type AccessEffect = (typeof ACCESS_EFFECTS)[number];

/** One rule that names the viewing actor on one level. */
export interface AccessRuleFact {
  effect: AccessEffect;
  validUntil: Date | null;
  revokedAt: Date | null;
}

/** One level of a chain: its mode and the rules that name the viewer on it. */
export interface AccessLevel {
  mode: AccessMode;
  rules: readonly AccessRuleFact[];
}

/** Not revoked and not expired at `now` (`validUntil` is the first instant the rule no longer counts). */
export function ruleIsActive(rule: AccessRuleFact, now: Date): boolean {
  if (rule.revokedAt !== null) return false;
  return rule.validUntil === null || rule.validUntil.getTime() > now.getTime();
}

export function levelVisible(level: AccessLevel, now: Date): boolean {
  const active = level.rules.filter((rule) => ruleIsActive(rule, now));
  if (active.some((rule) => rule.effect === 'deny')) return false;
  return level.mode === 'internal' || active.some((rule) => rule.effect === 'allow');
}

/** `chain` runs from the Model down to the object itself; an empty chain is not an object, so it is not visible. */
export function chainVisible(chain: readonly AccessLevel[], now: Date): boolean {
  return chain.length > 0 && chain.every((level) => levelVisible(level, now));
}

export const isAccessMode = (value: unknown): value is AccessMode => (ACCESS_MODES as readonly unknown[]).includes(value);
