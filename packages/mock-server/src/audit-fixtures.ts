/**
 * Synthetic audit store (issue #50). One array feeds both the console read (auditTrail) and the destination
 * read (entityAudit). Deterministic: equipment events are seeded from the EQUIPMENT array order, never from
 * validity segments, shift or parseDateTime — `at` is not validFrom/validTo/updatedAt. Not parser data and
 * not the FeedbackOps audit log (a different record; do not merge). The three metric rows are hand-written
 * so the console can show and link a metric row; they will not equal the metric menu's language-dependent
 * history (follow-up A) — do not assert that they do.
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
  events.push(
    { id: 'metric:cycle_time:update', at: '2026-09-26T02:00:00.000Z', actor: 'park.seo', action: 'update', source: 'user', target: { type: 'metric', id: 'cycle_time', scopeId: null }, changes: { publicationState: ['draft', 'published'] }, reason: '게시 확정. mart 재계산 완료가 아닙니다.' },
    { id: 'metric:cycle_time:create', at: '2026-09-20T02:00:00.000Z', actor: 'park.seo', action: 'create', source: 'user', target: { type: 'metric', id: 'cycle_time', scopeId: null }, changes: { metricVersion: [null, '4'] }, reason: '공정 구간으로 grain 설명 수정. 게시 포인터.' },
    { id: 'metric:wafer_move_count:retire', at: '2026-04-02T02:00:00.000Z', actor: 'choi.min', action: 'retire', source: 'user', target: { type: 'metric', id: 'wafer_move_count', scopeId: null }, changes: { publicationState: ['published', 'deprecated'] }, reason: '폐기. 기존 참조는 유지하고 최신으로 대체하지 않습니다.' },
  );
  return events;
})();
