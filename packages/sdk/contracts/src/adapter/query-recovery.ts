import { isRecord } from '../guards.js';
import { normalizeSet } from '../links/url.js';
import type { QueryRecovery } from './response.js';

/** Keeps only well-formed recovery fields from an adapter reply, with set ordering independent of the wire order. */
export function readQueryRecovery(value: unknown): QueryRecovery | undefined {
  if (!isRecord(value)) return undefined;
  const { affectedEquipmentIds, authorizedEquipmentIds, maxHours, retryable, deniedScope } = value;
  const ids = (input: unknown): string[] | undefined => {
    if (!Array.isArray(input) || input.length === 0 || !input.every(id => typeof id === 'string')) return undefined;
    try { return normalizeSet(input); } catch { return undefined; }
  };
  const affected = ids(affectedEquipmentIds);
  const authorized = ids(authorizedEquipmentIds);
  const droppedEquipment = (Object.hasOwn(value, 'affectedEquipmentIds') && affected === undefined) ||
    (Object.hasOwn(value, 'authorizedEquipmentIds') && authorized === undefined);
  let target: QueryRecovery['deniedScope'];
  if (isRecord(deniedScope) && typeof deniedScope.site === 'string' && ids([deniedScope.site])) {
    if (deniedScope.kind === 'site' && Object.keys(deniedScope).every(key => key === 'kind' || key === 'site')) target = { kind: 'site', site: deniedScope.site };
    if (deniedScope.kind === 'site_room' && Object.keys(deniedScope).every(key => key === 'kind' || key === 'site' || key === 'room') && typeof deniedScope.room === 'string' && ids([deniedScope.room])) {
      target = { kind: 'site_room', site: deniedScope.site, room: deniedScope.room };
    }
  }
  const result: QueryRecovery = {};
  if (affected) result.affectedEquipmentIds = affected;
  if (authorized) result.authorizedEquipmentIds = authorized;
  if (typeof maxHours === 'number' && Number.isSafeInteger(maxHours) && maxHours > 0) result.maxHours = maxHours;
  // A dropped equipment list can hide the evidence that the query was refused.
  if (retryable === false || (retryable === true && !droppedEquipment)) result.retryable = retryable;
  if (target) result.deniedScope = target;
  return Object.keys(result).length ? result : undefined;
}
