import type { AuditEvent } from './audit.js';
import { instantEpochMs } from '../values/instant.js';

/** The order of the `entityAudit` port (ADR-0085, 06 §13): newest instant first, `id` ascending on a tie. Compares
 *  instants, not strings — string order is wrong once `Z` and `+09:00` both occur. A bad `at` throws (`instantEpochMs`). */
export function compareAuditEvents(a: AuditEvent, b: AuditEvent): number {
  const byAt = instantEpochMs(b.at) - instantEpochMs(a.at);
  return byAt !== 0 ? byAt : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
