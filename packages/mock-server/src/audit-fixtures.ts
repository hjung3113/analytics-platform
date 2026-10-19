/**
 * Synthetic audit store (issue #50). One array feeds both the console read (auditTrail) and the destination
 * read (entityAudit). Deterministic: equipment events are seeded from the EQUIPMENT array order, never from
 * validity segments, shift or parseDateTime — `at` is not validFrom/validTo/updatedAt. Not parser data and
 * not the FeedbackOps audit log (a different record; do not merge). Equipment only: metric events are the
 * metrics menu's audit seeds, handed in by the app's mock assembly (`createMockAdapter({ auditEvents })`, ADR-0048).
 */
import type { AuditEvent } from '@ap/contracts';
import { EQUIPMENT } from './world';

const ORIGIN = Date.parse('2026-01-01T00:00:00.000Z');
const DAY = 86_400_000;
const KIND_OFFSET = { create: 0, update: 3_600_000, retire: 7_200_000, sync: 10_800_000 } as const;

export const AUDIT_EVENTS: readonly AuditEvent[] = (() => {
  const events: AuditEvent[] = [];
  EQUIPMENT.forEach((row, index) => {
    const at = (kind: keyof typeof KIND_OFFSET) => new Date(ORIGIN + index * DAY + KIND_OFFSET[kind]).toISOString();
    // `row.site`, never `id.split('-')[0]` (ADR-0004). The `-V1` chamber value is a synthetic prior
    // snapshot so the diff has something to show — not a validity segment; the validity tab is unchanged.
    const target = { type: 'equipment', id: row.equipmentId, scopeId: row.site };
    events.push(
      { id: `equipment:${row.equipmentId}:create`, at: at('create'), actor: 'master-sync', action: 'create', source: 'system', target, changes: { equipmentId: [null, row.equipmentId], chamberType: [null, row.chamberType] } },
      { id: `equipment:${row.equipmentId}:update`, at: at('update'), actor: 'master-sync', action: 'update', source: 'system', target, changes: { chamberType: [`${row.chamberType}-V1`, row.chamberType] } },
      { id: `equipment:${row.equipmentId}:sync`, at: at('sync'), actor: row.updatedBy, action: 'sync', source: 'system', target },
    );
    if (row.validTo !== null) {
      // Naive field snapshot — the validity tab owns "when the interval was"; this row owns who committed.
      events.push({ id: `equipment:${row.equipmentId}:retire`, at: at('retire'), actor: row.updatedBy, action: 'retire', source: 'user', target, changes: { validTo: [null, row.validTo] } });
    }
  });
  return events;
})();
