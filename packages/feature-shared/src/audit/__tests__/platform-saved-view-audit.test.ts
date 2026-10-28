import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_DETAIL_SCHEMAS } from '../../enums/audit-events.js';

const id = '11111111-1111-4111-8111-111111111111';

describe('platform saved-view audit detail schemas (ADR-0099)', () => {
  it.each([
    ['saved_view_official_requested', { view_id: id, version: 2 }],
    ['saved_view_official_approved', { view_id: id, version: 3 }],
    ['saved_view_official_rejected', { view_id: id, version: 3 }],
    ['saved_view_official_revoked', { view_id: id, version: 4 }],
    [
      'saved_view_visibility_changed',
      { view_id: id, version: 2, visibility: 'people', target_count: 2 },
    ],
    ['saved_view_group_created', { group_id: id, member_count: 3 }],
    ['saved_view_group_updated', { group_id: id, added_ids: [id], removed_ids: [], renamed: true }],
    [
      'saved_view_import_submitted',
      { imported: 1, already_imported: 0, rejected: 2, view_ids: [id] },
    ],
  ] as const)('%s accepts ids/counts only', (type, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(true);
  });

  it.each([
    ['saved_view_official_requested', { view_id: id, version: 2, name: 'secret title' }],
    ['saved_view_official_approved', { view_id: 'not-a-uuid', version: 3 }],
    ['saved_view_official_revoked', { view_id: id, version: 0 }],
    [
      'saved_view_visibility_changed',
      { view_id: id, version: 2, visibility: 'official', target_count: 0 },
    ],
    ['saved_view_group_created', { group_id: id, member_count: 1, name: 'team' }],
    [
      'saved_view_group_updated',
      { group_id: id, added_ids: ['x'], removed_ids: [], renamed: false },
    ],
    [
      'saved_view_import_submitted',
      { imported: 1, already_imported: 0, rejected: 0, view_ids: [id], payload: {} },
    ],
  ] as const)('%s rejects payload, titles and non-ids', (type, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(false);
  });
});
