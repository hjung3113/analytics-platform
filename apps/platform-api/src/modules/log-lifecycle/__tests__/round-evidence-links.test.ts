// The Gate read port (#1466): a Round's 수동 검증 첨부 links with the Round's own visibility. No DB: reads are stubs.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '../../../db/client.js';

const holdsPlatformPermission = vi.fn();
const roundInWorkspace = vi.fn();
const selectActiveLinksForEndpoint = vi.fn();
const listAttachmentsByParent = vi.fn();

vi.mock('../../platform-port/permissions.js', () => ({ holdsPlatformPermission: (...a: unknown[]) => holdsPlatformPermission(...a) }));
vi.mock('../repositories/lifecycle-read.js', () => ({ roundInWorkspace: (...a: unknown[]) => roundInWorkspace(...a) }));
vi.mock('../../entity-links/index.js', () => ({ selectActiveLinksForEndpoint: (...a: unknown[]) => selectActiveLinksForEndpoint(...a) }));
vi.mock('../../attachments/index.js', () => ({ listAttachmentsByParent: (...a: unknown[]) => listAttachmentsByParent(...a) }));

const { readRoundEvidenceLinks } = await import('../round-evidence-links.js');

const WS = '11111111-1111-4111-8111-111111111111';
const ROUND = '33333333-3333-4333-8333-333333333333';
const actor = { actor_id: '44444444-4444-4444-8444-444444444444', workspace_id: WS, role_level: 'user' };
const deps = { db: {} as Db, checkService: {} as never };
const link = (id: string, sourceId: string, over: Record<string, unknown> = {}) => ({
  id,
  source_type: 'manual_validation_attachment',
  source_id: sourceId,
  relation_type: 'evidence_of',
  created_by: 'creator',
  created_at: new Date('2026-11-08T00:00:00Z'),
  ...over,
});
const attachment = (id: string) => ({ id, name: `${id}.txt`, sizeBytes: 5, mimeType: 'text/plain', uploadedByActorId: 'creator', linkedAt: '2026-11-08T00:00:00.000Z' });

beforeEach(() => {
  for (const fn of [holdsPlatformPermission, roundInWorkspace, selectActiveLinksForEndpoint, listAttachmentsByParent]) fn.mockReset();
  holdsPlatformPermission.mockResolvedValue(true);
  roundInWorkspace.mockResolvedValue(true);
  selectActiveLinksForEndpoint.mockResolvedValue([]);
  listAttachmentsByParent.mockResolvedValue([]);
});

describe('readRoundEvidenceLinks', () => {
  it('returns exactly the visible links: oldest first, only attachments still active under the Round', async () => {
    // The endpoint read is newest first; l3 points at an archived/unlinked attachment, l4 is another relation.
    selectActiveLinksForEndpoint.mockResolvedValue([
      link('l4', 'a1', { relation_type: 'related_to' }),
      link('l3', 'gone'),
      link('l2', 'a2'),
      link('l1', 'a1'),
    ]);
    listAttachmentsByParent.mockResolvedValue([attachment('a1'), attachment('a2')]);
    const result = await readRoundEvidenceLinks(deps, actor, ROUND);
    expect(result?.map((l) => [l.linkId, l.attachmentId])).toEqual([
      ['l1', 'a1'],
      ['l2', 'a2'],
    ]);
    expect(result?.[0]).toEqual({
      linkId: 'l1',
      attachmentId: 'a1',
      name: 'a1.txt',
      sizeBytes: 5,
      mimeType: 'text/plain',
      linkedByActorId: 'creator',
      linkedAt: '2026-11-08T00:00:00.000Z',
    });
    expect(selectActiveLinksForEndpoint).toHaveBeenCalledWith(deps.db, {
      workspaceId: WS,
      endpointType: 'validation_round',
      endpointId: ROUND,
      side: 'target',
    });
  });

  it('answers null (not an empty list) without platform:view, and reads nothing', async () => {
    holdsPlatformPermission.mockResolvedValue(false);
    await expect(readRoundEvidenceLinks(deps, actor, ROUND)).resolves.toBeNull();
    expect(selectActiveLinksForEndpoint).not.toHaveBeenCalled();
  });

  it('answers null for an unknown or other-workspace Round, the same as an unreadable one', async () => {
    roundInWorkspace.mockResolvedValue(false);
    await expect(readRoundEvidenceLinks(deps, actor, ROUND)).resolves.toBeNull();
    expect(roundInWorkspace).toHaveBeenCalledWith(deps.db, WS, ROUND);
    expect(selectActiveLinksForEndpoint).not.toHaveBeenCalled();
  });

  it('returns an empty list for a visible Round with no links', async () => {
    await expect(readRoundEvidenceLinks(deps, actor, ROUND)).resolves.toEqual([]);
  });
});
