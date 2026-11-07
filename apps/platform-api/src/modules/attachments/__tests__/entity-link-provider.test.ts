// ADR-0123 (#1466): the attachment end of the 수동 검증 첨부 link reads through the parent kind's AttachmentParentReader
// (the download path's judge), and denies when no reader is registered. No DB: the row lookup is a stub.
import { describe, expect, it, vi } from 'vitest';

import type { Db } from '../../../db/client.js';
import { HttpError } from '../../../lib/errors.js';
import { manualValidationAttachmentEntityLinkProvider } from '../entity-link-provider.js';
import type { AttachmentParentReader } from '../parent-kinds.js';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '99999999-9999-4999-8999-999999999999';
const ROUND = '33333333-3333-4333-8333-333333333333';
const actor = { actor_id: '44444444-4444-4444-8444-444444444444', workspace_id: WS, role_level: 'user' as const };
const deps = { db: {} as Db, checkService: {} as never };
const subject = { workspace_id: WS, managed_system_id: null, reporter_id: null, parent: { kind: 'validation_round', id: ROUND } };

const reader = (assertCanRead: AttachmentParentReader['assertCanRead']): AttachmentParentReader => ({ kind: 'validation_round', assertCanRead });
const dbWith = (rows: unknown[]) => ({ execute: vi.fn(async () => ({ rows })) }) as unknown as Db;

describe('manual validation attachment Entity Link provider', () => {
  it('resolves an active round attachment of the workspace with no Managed System and its parent pointer', async () => {
    const provider = manualValidationAttachmentEntityLinkProvider([]);
    await expect(provider.assertExists(dbWith([{ parent_id: ROUND }]), WS, 'att')).resolves.toEqual({
      workspace_id: WS,
      managed_system_id: null,
      reporter_id: null,
      parent: { kind: 'validation_round', id: ROUND },
    });
    await expect(provider.getPermissionSubject(dbWith([]), WS, 'att')).resolves.toBeNull();
  });

  it('is readable when the registered reader allows, passing the row the download path would', async () => {
    const assertCanRead = vi.fn(async () => undefined);
    const provider = manualValidationAttachmentEntityLinkProvider([reader(assertCanRead)]);
    await expect(provider.canRead(deps, actor, subject)).resolves.toBe(true);
    expect(assertCanRead).toHaveBeenCalledWith({
      actor,
      row: expect.objectContaining({ parent_kind: 'validation_round', parent_id: ROUND, voc_id: null, comment_id: null }),
    });
  });

  it('is not readable when the reader denies', async () => {
    const provider = manualValidationAttachmentEntityLinkProvider([
      reader(async () => {
        throw new HttpError('permission.denied', 'no');
      }),
    ]);
    await expect(provider.canRead(deps, actor, subject)).resolves.toBe(false);
  });

  it('rethrows anything other than a denial', async () => {
    const provider = manualValidationAttachmentEntityLinkProvider([
      reader(async () => {
        throw new Error('db down');
      }),
    ]);
    await expect(provider.canRead(deps, actor, subject)).rejects.toThrow('db down');
  });

  it.each([
    ['no reader registered for the kind', manualValidationAttachmentEntityLinkProvider([]), subject],
    ['an attachment of another workspace', manualValidationAttachmentEntityLinkProvider([reader(async () => undefined)]), { ...subject, workspace_id: OTHER_WS }],
    ['a subject without a parent pointer', manualValidationAttachmentEntityLinkProvider([reader(async () => undefined)]), { ...subject, parent: undefined }],
  ])('denies %s', async (_label, provider, row) => {
    await expect(provider.canRead(deps, actor, row)).resolves.toBe(false);
  });
});
