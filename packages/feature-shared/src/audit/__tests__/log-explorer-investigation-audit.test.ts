import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_DETAIL_SCHEMAS } from '../../enums/audit-events.js';

const ID = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';

describe('log explorer audit detail schemas (#1468 b)', () => {
  it.each([
    ['explorer.investigation.created', { origin: 'standalone', roundId: null, fileCount: 2, filterKeys: ['level', 'text'] }],
    ['explorer.investigation.created', { origin: 'round', roundId: ID, fileCount: 0, filterKeys: [] }],
    ['explorer.investigation.updated', { changed: ['title', 'filters'], filterKeys: ['level'] }],
    ['explorer.investigation.archived', { evidenceCount: 3 }],
    ['explorer.evidence.added', { evidenceCount: 1, noteLength: 0 }],
    ['explorer.evidence.removed', { evidenceCount: 0 }],
  ] as const)('%s accepts its detail', (type, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(true);
  });

  it.each([
    ['explorer.investigation.created', 'a filter value in place of a key', { origin: 'standalone', roundId: null, fileCount: 1, filterKeys: ['level = ERROR'] }],
    ['explorer.investigation.created', 'a file location', { origin: 'standalone', roundId: null, fileCount: 1, filterKeys: [], fileRef: 's3://x' }],
    ['explorer.investigation.updated', 'no changed field', { changed: [], filterKeys: [] }],
    ['explorer.investigation.updated', 'filter values', { changed: ['filters'], filterKeys: [], filters: { level: 'ERROR' } }],
    ['explorer.evidence.added', 'the note text', { evidenceCount: 1, noteLength: 4, note: 'text' }],
    ['explorer.evidence.added', 'a hash', { evidenceCount: 1, noteLength: 0, fileSha256: 'x' }],
  ] as const)('%s rejects %s', (type, _label, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(false);
  });
});
