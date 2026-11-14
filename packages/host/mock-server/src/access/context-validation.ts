/** Runtime shape rules shared by projected menu queries and Selection evaluation. No axis vocabulary. */
export function contextShapeError(context: Record<string, unknown>): string | null {
  const condition = context.condition;
  if ('condition' in context && condition !== null) {
    if (typeof condition !== 'object' || condition === undefined || Array.isArray(condition)) return 'invalid_condition';
    const prototype = Object.getPrototypeOf(condition);
    if (prototype !== Object.prototype && prototype !== null) return 'invalid_condition';
    const entries = Object.entries(condition);
    if (!entries.length || entries.some(([axis, values]) => !axis.trim() || axis === 'axis' || !validIds(values) || values.length === 0)) return 'invalid_condition';
  }
  for (const key of ['roomNames', 'lineNames', 'prcGroups', 'selection', 'lotIds', 'recipeIds']) {
    if (key in context && context[key] !== null && !validIds(context[key])) return 'invalid request context';
  }
  const basis = context.membershipBasis;
  if ('membershipBasis' in context && basis !== null && basis !== 'asOf') return 'invalid_membership_basis';
  if (basis === 'asOf' && condition == null && context.prcGroups == null) return 'membership_basis_pair';
  return null;
}

function validIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(id => typeof id === 'string' && id.trim().length > 0);
}
