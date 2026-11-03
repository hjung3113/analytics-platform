import { describe, expect, it } from 'vitest';

import { CAPABILITIES, CAPABILITY_META } from '../../enums/capabilities.js';
import {
  publicVocAttachmentSchema,
  publicVocListItemSchema,
  publicVocListQuerySchema,
  publicVocViewSchema,
} from '../public-view.js';

const ID = '00000000-0000-4000-8000-000000000001';
const TS = '2026-11-03T10:00:00.000Z';
const ATTACHMENT = {
  id: ID,
  name: 'shot.png',
  size_bytes: 10,
  mime_type: 'image/png',
  created_at: TS,
  linked_at: TS,
};
const LIST_ITEM = {
  id: ID,
  display_id: 'VOC-1',
  title: 't',
  reporter_facing_status: 'received',
  managed_system: { id: ID, name: 'MS' },
  created_at: TS,
  updated_at: TS,
  mine: false,
};
const VIEW = {
  ...LIST_ITEM,
  description_rich_content: { type: 'doc', content: [] },
  entries: [
    {
      id: ID,
      kind: 'public_update',
      body_rich_content: { type: 'doc', content: [] },
      created_at: TS,
      attachments: [ATTACHMENT],
    },
  ],
  attachments: [ATTACHMENT],
};

describe('public VOC allowlist schemas (exact key sets)', () => {
  it('list item keys', () => {
    expect(Object.keys(publicVocListItemSchema.parse(LIST_ITEM)).sort()).toEqual(
      [
        'id',
        'display_id',
        'title',
        'reporter_facing_status',
        'managed_system',
        'created_at',
        'updated_at',
        'mine',
      ].sort(),
    );
  });

  it('detail keys, entry keys and attachment keys', () => {
    const parsed = publicVocViewSchema.parse(VIEW);
    expect(Object.keys(parsed).sort()).toEqual(
      [
        'id',
        'display_id',
        'title',
        'description_rich_content',
        'reporter_facing_status',
        'managed_system',
        'created_at',
        'updated_at',
        'mine',
        'entries',
        'attachments',
      ].sort(),
    );
    expect(Object.keys(parsed.managed_system).sort()).toEqual(['id', 'name']);
    expect(Object.keys(parsed.entries[0] ?? {}).sort()).toEqual(
      ['id', 'kind', 'body_rich_content', 'created_at', 'attachments'].sort(),
    );
    expect(Object.keys(parsed.attachments[0] ?? {}).sort()).toEqual(
      ['id', 'name', 'size_bytes', 'mime_type', 'created_at', 'linked_at'].sort(),
    );
  });

  it.each([
    'reporter_id',
    'owner_user_id',
    'severity',
    'triage_state',
    'primary_managed_system_id',
    'similar',
    'links',
    'linked_execution',
    'permission_decisions',
    'conversation_timeline',
  ])('detail rejects the operator key %s', (key) => {
    expect(() => publicVocViewSchema.parse({ ...VIEW, [key]: 1 })).toThrow();
  });

  it.each(['reporter_id', 'severity', 'attachment_count', 'owner_user_id'])(
    'list item rejects the operator key %s',
    (key) => {
      expect(() => publicVocListItemSchema.parse({ ...LIST_ITEM, [key]: 1 })).toThrow();
    },
  );

  it.each(['reporter_reply', 'internal_comment'])('entries never carry kind %s', (kind) => {
    const entries = [{ ...VIEW.entries[0], kind }];
    expect(() => publicVocViewSchema.parse({ ...VIEW, entries })).toThrow();
  });

  it.each(['actor_id', 'visibility', 'reporter_facing_status_after'])(
    'entries reject the key %s',
    (key) => {
      const entries = [{ ...VIEW.entries[0], [key]: 'x' }];
      expect(() => publicVocViewSchema.parse({ ...VIEW, entries })).toThrow();
    },
  );

  it.each(['storage_key', 'storage_uri', 'uploaded_by_actor_id'])(
    'attachments reject the key %s',
    (key) => {
      expect(() => publicVocAttachmentSchema.parse({ ...ATTACHMENT, [key]: 'x' })).toThrow();
    },
  );
});

describe('publicVocListQuerySchema', () => {
  it('defaults', () => {
    expect(publicVocListQuerySchema.parse({})).toEqual({ mine: false, limit: 20 });
  });

  it('parses mine, system, q and limit', () => {
    expect(
      publicVocListQuerySchema.parse({ mine: 'true', managed_system_id: ID, q: ' hi ', limit: '50' }),
    ).toEqual({ mine: true, managed_system_id: ID, q: 'hi', limit: 50 });
  });

  it.each([{ limit: '51' }, { limit: '0' }, { q: 'x'.repeat(101) }, { mine: 'yes' }, { managed_system_id: 'all' }])(
    'rejects %j',
    (query) => {
      expect(publicVocListQuerySchema.safeParse(query).success).toBe(false);
    },
  );
});

describe('voc.read_public capability', () => {
  it('is registered, non-sensitive, with no admin module bypass', () => {
    expect(CAPABILITIES).toContain('voc.read_public');
    expect(CAPABILITY_META['voc.read_public']).toEqual({
      sensitive: false,
      adminModuleBypass: 'none',
    });
  });
});
