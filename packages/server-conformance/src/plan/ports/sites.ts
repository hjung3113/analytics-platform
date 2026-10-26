import type { ConformanceCheck, ServerConformanceHarness } from '../../types';
import { UNKNOWN_SITE } from '../../helpers';

export function planSiteChecks(harness: ServerConformanceHarness): ConformanceCheck[] {
  const { adapter, ports } = harness;
  const checks: ConformanceCheck[] = [];
  checks.push({
    id: 'port · session() returns the same object until the session changes',
    uses: ['session'],
    mode: 'granted',
    nonEnvelope: true,
    run: async () => (Object.is(adapter.session(), adapter.session())
      ? null
      : 'session() must return the same object while the session is unchanged — the kernel compares identity to decide re-validation'),
  });
  checks.push({
    id: 'port · session lists the granted sites and not the foreign one',
    uses: ['session'],
    needsSites: true,
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      const ids = adapter.session().scopes.map(s => s.id);
      if (!ids.includes(harness.context.scopeId) || !ids.includes(ports.otherGrantedScopeId)) {
        return `session().scopes must list the granted sites ${harness.context.scopeId} and ${ports.otherGrantedScopeId}, got [${ids.join(', ')}]`;
      }
      if (ids.includes(harness.foreignScopeId)) {
        return `session().scopes must not list the foreign site ${harness.foreignScopeId} — a site with no grant is not an option`;
      }
      return null;
    },
  });
  checks.push({
    id: 'port · subscribe returns an unsubscribe function',
    uses: ['subscribe'],
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      const unsubscribe = adapter.subscribe(() => {});
      if (typeof unsubscribe !== 'function') return 'subscribe must return an unsubscribe function';
      // Called once, never twice: adapter.ts requires `subscribe` to return a cleanup function — it does not
      // require the cleanup to be idempotent, so a one-shot unsubscribe is conforming (#152 round D).
      try {
        unsubscribe();
      } catch (error) {
        return `unsubscribing threw: ${String(error)}`;
      }
      return null;
    },
  });
  checks.push({
    id: 'port · validateScope(granted site) → valid with its rooms',
    uses: ['validateScope'],
    needsSites: true,
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      const check = await adapter.validateScope(harness.context.scopeId);
      if (check.status !== 'valid') return `expected valid for the granted site ${harness.context.scopeId}, got ${check.status}`;
      if (check.grantedRooms.length === 0) return 'a valid site must list its granted rooms';
      return null;
    },
  });
  checks.push({
    id: 'port · validateScope(second granted site) → valid',
    uses: ['validateScope'],
    needsSites: true,
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      const check = await adapter.validateScope(ports.otherGrantedScopeId);
      if (check.status !== 'valid') return `expected valid for the second granted site ${ports.otherGrantedScopeId}, got ${check.status}`;
      if (check.grantedRooms.length === 0) return 'a valid site must list its granted rooms';
      return null;
    },
  });
  checks.push({
    id: 'port · validateScope(foreign site) → forbidden with no rooms',
    uses: ['validateScope'],
    needsSites: true,
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      const check = await adapter.validateScope(harness.foreignScopeId);
      if (check.status !== 'forbidden') return `expected forbidden for the foreign site ${harness.foreignScopeId}, got ${check.status}`;
      if (check.grantedRooms.length > 0) return `a forbidden site must not list rooms — got [${check.grantedRooms.join(', ')}] (room leak)`;
      return null;
    },
  });
  checks.push({
    id: 'port · validateScope(unknown site) → unknown_scope',
    uses: ['validateScope'],
    needsSites: true,
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      const check = await adapter.validateScope(UNKNOWN_SITE);
      if (check.status !== 'unknown_scope') return `expected unknown_scope for ${UNKNOWN_SITE}, got ${check.status}`;
      if (check.grantedRooms.length > 0) return `an unknown site must not list rooms — got [${check.grantedRooms.join(', ')}]`;
      return null;
    },
  });
  return checks;
}
