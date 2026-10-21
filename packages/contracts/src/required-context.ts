import type { ContextKey, Capability } from './menu.js';
import { parseDateTime, type GlobalContext } from './url.js';

/** Capability-to-field mapping shared by client gating and server validation. Empty sets are present. */
export const CONTEXT_FIELDS: Readonly<Record<ContextKey, readonly (keyof GlobalContext)[]>> = {
  time: ['from', 'to'], roomNames: ['roomNames'], line: ['lineNames'], prcGroup: ['prcGroups'],
  condition: ['condition'], selection: ['selection'], lot: ['lotIds'], ppid: ['ppid'], recipe: ['recipeIds'], metric: ['metricId', 'metricVersion'],
};

export function missingRequiredContext(keys: readonly ContextKey[], context: Partial<GlobalContext>): ContextKey[] {
  return keys.filter(key => {
    if (CONTEXT_FIELDS[key].some(field => context[field] == null || context[field] === '')) return true;
    if (key === 'time') {
      try { return parseDateTime(context.from!, 'from') >= parseDateTime(context.to!, 'to'); } catch { return true; }
    }
    return false;
  });
}

/** Diagnostic for unusable required declarations, independent of a menu registry. */
export function requiredContextError(keys: readonly ContextKey[], capabilities: Partial<Record<ContextKey, Capability>>): string | null {
  for (const key of keys) {
    if (!Object.hasOwn(CONTEXT_FIELDS, key) || capabilities[key] !== 'apply') return `required Context ${key} must be applied`;
  }
  return null;
}
