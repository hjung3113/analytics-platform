/**
 * Synthetic "my VOC" rows (issue #60). Not the FeedbackOps seed and not parser data. UUIDs so a row id is a
 * valid deep-link vocId. Per-actor buckets, because FeedbackOps `view=my` is `reporter_id = actor` — an admin
 * sees only their own tickets, never the engineer's. One shared primary managed system, and no Site id
 * anywhere: a row's managed system is a FeedbackOps uuid, not a platform scopeId, and is never linked.
 */
import type { MyVocItem } from '@ap/contracts';
import type { RoleId } from './world';

/** Server-owned page size; small so a test can turn a page without 50 rows (a real adapter would send limit=50). */
export const MY_VOC_PAGE_SIZE = 2;

const MANAGED_SYSTEM_ID = '11111111-1111-4111-8111-111111111111';

/** Sorted `openedAt` desc, then `id` asc. `updatedAt` differs from `openedAt` only on VOC-M-1001. Titles stay untranslated. */
export const MY_VOC_ROWS: Record<RoleId, readonly MyVocItem[]> = {
  engineer: [
    { id: 'e1111111-1111-4111-8111-111111111111', displayId: 'VOC-M-1001', title: 'Overlay drift (mock)', status: 'progress', openedAt: '2026-09-26T02:00:00.000Z', updatedAt: '2026-09-26T06:00:00.000Z', managedSystemId: MANAGED_SYSTEM_ID },
    { id: 'e2222222-2222-4222-8222-222222222222', displayId: 'VOC-M-1002', title: 'Recipe note (mock)', status: 'received', openedAt: '2026-09-24T02:00:00.000Z', updatedAt: '2026-09-24T02:00:00.000Z', managedSystemId: MANAGED_SYSTEM_ID },
    { id: 'e3333333-3333-4333-8333-333333333333', displayId: 'VOC-M-1003', title: 'Chamber clean (mock)', status: 'resolved', openedAt: '2026-09-20T02:00:00.000Z', updatedAt: '2026-09-20T02:00:00.000Z', managedSystemId: MANAGED_SYSTEM_ID },
  ],
  admin: [
    { id: 'a4444444-4444-4444-8444-444444444444', displayId: 'VOC-M-2001', title: 'Admin-only ticket (mock)', status: 'closed', openedAt: '2026-09-22T02:00:00.000Z', updatedAt: '2026-09-22T02:00:00.000Z', managedSystemId: MANAGED_SYSTEM_ID },
  ],
  viewer: [],
};
