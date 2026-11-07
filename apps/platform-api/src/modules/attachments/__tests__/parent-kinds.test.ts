// #1451 — the attachment parent-kind seam, DB-free: kind derivation, registry, and the download entitlement's
// default-deny / isolation between kinds (the real service over a stubbed db and storage).

import { Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { HttpError } from '../../../lib/errors.js';
import {
  type AttachmentLinkRow,
  type AttachmentParentReader,
  attachmentParentKindOf,
  createAttachmentParentRegistry,
} from '../parent-kinds.js';
import { createAttachmentsService } from '../service.js';

const WS = '11111111-1111-4111-8111-111111111111';
const ME = '22222222-2222-4222-8222-222222222222';
const PARENT = '33333333-3333-4333-8333-333333333333';
const ATT = '44444444-4444-4444-8444-444444444444';

const link = (over: Partial<AttachmentLinkRow> = {}): AttachmentLinkRow => ({
  voc_id: null,
  comment_id: null,
  comment_kind: null,
  parent_kind: null,
  parent_id: null,
  uploaded_by_actor_id: ME,
  ...over,
});

describe('attachmentParentKindOf', () => {
  it.each([
    ['unlinked', link(), null],
    ['explicit voc', link({ parent_kind: 'voc', voc_id: PARENT }), 'voc'],
    ['legacy VOC row (parent_kind NULL, voc_id set)', link({ voc_id: PARENT }), 'voc'],
    ['legacy comment row (parent_kind NULL, comment_id set)', link({ comment_id: PARENT, comment_kind: 'public_update' }), 'voc'],
    ['validation round', link({ parent_kind: 'validation_round', parent_id: PARENT }), 'validation_round'],
    ['NULL kind with parent_id (malformed)', link({ parent_id: PARENT }), 'unresolved'],
  ])('%s', (_label, row, kind) => {
    expect(attachmentParentKindOf(row)).toBe(kind);
  });
});

describe('createAttachmentParentRegistry', () => {
  const reader = (kind: AttachmentParentReader['kind']): AttachmentParentReader => ({ kind, assertCanRead: async () => {} });
  it('indexes readers by kind and refuses a duplicate kind', () => {
    expect([...createAttachmentParentRegistry([reader('voc'), reader('validation_round')]).keys()]).toEqual(['voc', 'validation_round']);
    expect(() => createAttachmentParentRegistry([reader('voc'), reader('voc')])).toThrow(/registered twice/);
  });
});

describe('download entitlement by parent kind', () => {
  function build(row: Partial<AttachmentLinkRow>, parents?: AttachmentParentReader[]) {
    const vocReadService = { getVocDetail: vi.fn(), canReadConversationEntry: vi.fn() };
    const vocPublicAttachmentReader = { canReadPublicAttachment: vi.fn() };
    const stored = {
      id: ATT,
      name: 'a.png',
      size_bytes: 3,
      mime_type: 'image/png',
      storage_key: `${WS}/${ATT}/a.png`,
      ...link(row),
    };
    const service = createAttachmentsService({
      storage: {
        put: vi.fn(),
        get: vi.fn(async () => ({ stream: Readable.from(['abc']), mimeType: 'image/png', size: 3 })),
        delete: vi.fn(),
        exists: vi.fn(),
      },
      auditService: {} as never,
      db: { execute: vi.fn(async () => ({ rows: [stored] })) } as never,
      idempotencyService: {} as never,
      vocReadService: vocReadService as never,
      vocPublicAttachmentReader,
      ...(parents ? { parents } : {}),
    });
    const download = (actorId = 'someone-else') =>
      service.downloadAttachment({ actor: { actor_id: actorId, workspace_id: WS, role_level: 'admin' }, id: ATT });
    return { download, vocReadService, vocPublicAttachmentReader };
  }

  it('denies a linked row whose kind has no registered reader, without asking VOC', async () => {
    const t = build({ parent_kind: 'validation_round', parent_id: PARENT });
    await expect(t.download()).rejects.toMatchObject({ code: 'permission.denied' });
    expect(t.vocReadService.getVocDetail).not.toHaveBeenCalled();
    expect(t.vocReadService.canReadConversationEntry).not.toHaveBeenCalled();
    expect(t.vocPublicAttachmentReader.canReadPublicAttachment).not.toHaveBeenCalled();
  });

  it('denies an unknown kind even with other readers registered', async () => {
    const other: AttachmentParentReader = { kind: 'validation_round', assertCanRead: vi.fn(async () => {}) };
    const t = build({ parent_kind: 'surprise', parent_id: PARENT }, [other]);
    await expect(t.download()).rejects.toBeInstanceOf(HttpError);
    expect(other.assertCanRead).not.toHaveBeenCalled();
  });

  it('judges a validation_round row by its own reader only; VOC rights never apply', async () => {
    const reader: AttachmentParentReader = { kind: 'validation_round', assertCanRead: vi.fn(async () => {}) };
    const t = build({ parent_kind: 'validation_round', parent_id: PARENT }, [reader]);
    await expect(t.download()).resolves.toMatchObject({ filename: 'a.png' });
    expect(reader.assertCanRead).toHaveBeenCalledTimes(1);
    expect(t.vocReadService.getVocDetail).not.toHaveBeenCalled();
  });

  it('a reader denial stays a denial (no public-read arm for a non-VOC kind)', async () => {
    const reader: AttachmentParentReader = {
      kind: 'validation_round',
      assertCanRead: async () => {
        throw new HttpError('permission.denied', 'no');
      },
    };
    const t = build({ parent_kind: 'validation_round', parent_id: PARENT }, [reader]);
    await expect(t.download()).rejects.toMatchObject({ code: 'permission.denied' });
    expect(t.vocPublicAttachmentReader.canReadPublicAttachment).not.toHaveBeenCalled();
  });

  it('a VOC row is never judged by a registered non-VOC reader', async () => {
    const reader: AttachmentParentReader = { kind: 'validation_round', assertCanRead: vi.fn(async () => {}) };
    const t = build({ voc_id: PARENT }, [reader]);
    t.vocReadService.getVocDetail.mockResolvedValue({ kind: 'full' });
    await expect(t.download()).resolves.toBeDefined();
    expect(reader.assertCanRead).not.toHaveBeenCalled();
  });

  it('an unlinked row stays readable by its uploader only', async () => {
    await expect(build({}).download('someone-else')).rejects.toMatchObject({ code: 'permission.denied' });
    await expect(build({}).download(ME)).resolves.toBeDefined();
  });

  it.each([
    ['the uploader', ME],
    ['another actor', 'someone-else'],
  ])('denies a NULL-kind row carrying parent_id for %s, with or without a reader, consulting none', async (_label, actorId) => {
    const reader: AttachmentParentReader = { kind: 'validation_round', assertCanRead: vi.fn(async () => {}) };
    for (const parents of [undefined, [reader]]) {
      const t = build({ parent_id: PARENT }, parents);
      await expect(t.download(actorId)).rejects.toMatchObject({ code: 'permission.denied' });
      expect(t.vocReadService.getVocDetail).not.toHaveBeenCalled();
    }
    expect(reader.assertCanRead).not.toHaveBeenCalled();
  });

  it('a registration of a second voc reader is refused at construction', () => {
    expect(() => build({}, [{ kind: 'voc', assertCanRead: async () => {} }])).toThrow(/registered twice/);
  });
});
