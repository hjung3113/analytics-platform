import type { Condition, IdSet } from '../links/url.js';

export const PORT_ERROR_CODES = ['invalid_input', 'unknown_axis', 'invalid_cursor', 'invalid_period', 'membership_basis_unsupported', 'unknown_scope', 'scope_forbidden', 'room_forbidden'] as const;
export type PortErrorCode = typeof PORT_ERROR_CODES[number];
/** Judged failures of the non-envelope metadata ports; transport/timeout failures may reject with any other error. Test with `isPortError`, not `instanceof` (an adapter may bundle its own contracts copy). */
export class PortError extends Error {
  constructor(readonly code: PortErrorCode, message: string, readonly field?: string) {
    super(message);
    this.name = 'PortError';
  }
}
/** Structural check: `name === 'PortError'` and a known `code`; holds across contracts copies. */
export function isPortError(e: unknown): e is PortError {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'PortError'
    && (PORT_ERROR_CODES as readonly unknown[]).includes((e as { code?: unknown }).code);
}
export type MembershipPeriod = { from: string; to: string };
export type AxisOptionsInput = {
  scopeId: string; axisId: string; query?: string;
  parents?: Readonly<Record<string, readonly string[]>>;
  membershipBasis?: 'asOf' | null; period?: MembershipPeriod | null;
  cursor?: string | null; limit: number;
};
export type AxisOption = { id: string; label: string };
export type AxisOptionsPage = { items: AxisOption[]; nextCursor: string | null };
export type EquipmentSummary = { equipmentId: string; room: string; axes: Readonly<Record<string, readonly string[]>> };
export type EquipmentSearchInput = {
  scopeId: string; roomNames: IdSet; lineNames: IdSet; prcGroups: IdSet;
  condition: Condition | null; membershipBasis: 'asOf' | null;
  period?: MembershipPeriod | null; query?: string; cursor?: string | null; limit: number;
};
export type EquipmentSearchPage = { items: EquipmentSummary[]; nextCursor: string | null; total?: number };
export type SelectionResolveInput = { scopeId: string; ids: readonly string[] };
export type SelectionResolution = { id: string; status: 'ok'; summary: EquipmentSummary } | { id: string; status: 'forbidden' | 'not_found' };
export type SelectionResolveResult = { items: SelectionResolution[] };
