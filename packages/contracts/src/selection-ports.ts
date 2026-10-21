import type { Condition, IdSet } from './url.js';

export type PortErrorCode = 'invalid_input' | 'unknown_axis' | 'invalid_cursor' | 'invalid_period' | 'membership_basis_unsupported' | 'unknown_scope' | 'scope_forbidden' | 'room_forbidden';
/** Judged non-envelope port failure; transport/timeout failures may reject with any other error. */
export class PortError extends Error {
  constructor(readonly code: PortErrorCode, message: string, readonly field?: string) {
    super(message);
    this.name = 'PortError';
  }
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
