// attachments-orphans CLI (#1266 b4): inventory of bucket objects no
// voc.voc_attachments row references. Real DB for the reference check, an
// in-memory bucket for the objects.

import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  type BucketObject,
  type OrphanStorage,
  findOrphans,
  orphanIdentifier,
  parseOrphansArgs,
} from '../attachments-orphans.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const runIntegration = Boolean(APP_URL);

const HOUR = 3_600_000;
const NOW = new Date('2026-11-03T12:00:00Z');
const SENSITIVE = 'patient-ssn-123-45-6789.png';

class MemoryBucket implements OrphanStorage {
  objects = new Map<string, Date>();
  deleted: string[] = [];
  failDelete = new Set<string>();

  put(key: string, ageHours: number): void {
    this.objects.set(key, new Date(NOW.getTime() - ageHours * HOUR));
  }

  async *listObjects(): AsyncIterable<BucketObject> {
    for (const [key, lastModified] of this.objects) yield { key, lastModified };
  }

  async delete(key: string): Promise<void> {
    if (this.failDelete.has(key)) throw new Error(`boom ${key}`);
    this.deleted.push(key);
    this.objects.delete(key);
  }
}

const workspace = randomUUID();
const newKey = (name = 'file.png') => `${workspace}/${randomUUID()}/${name}`;

describe('parseOrphansArgs', () => {
  it('defaults to a 24 h dry run limited to 500', () => {
    expect(parseOrphansArgs([])).toEqual({ apply: false, minAgeHours: 24, limit: 500 });
  });

  it('accepts --apply, --min-age-hours and --limit', () => {
    expect(parseOrphansArgs(['--apply', '--min-age-hours', '48', '--limit', '5000'])).toEqual({
      apply: true,
      minAgeHours: 48,
      limit: 5000,
    });
  });

  it.each([['--limit', '5001'], ['--limit', '0'], ['--limit', 'x'], ['--min-age-hours', '-1'], ['--nope']])(
    'rejects %s',
    (...argv) => {
      expect(() => parseOrphansArgs(argv)).toThrow();
    },
  );
});

describe('orphanIdentifier', () => {
  it('is workspace/attachment UUIDs for a well-formed key and never the filename', () => {
    const attachment = randomUUID();
    const id = orphanIdentifier(`${workspace}/${attachment}/${SENSITIVE}`);
    expect(id).toBe(`${workspace}/${attachment}`);
    expect(id).not.toContain('ssn');
  });

  it('is a one-way digest for any other key shape', () => {
    const id = orphanIdentifier(`legacy/${SENSITIVE}`);
    expect(id).toMatch(/^sha256:[0-9a-f]{16}$/);
    expect(id).not.toContain('ssn');
  });
});

describe.skipIf(!runIntegration)('findOrphans', () => {
  let pool: pg.Pool;
  let actorId = '';
  let bucket: MemoryBucket;

  async function reference(key: string, extra?: { archived?: boolean }): Promise<void> {
    await pool.query(
      `insert into voc.voc_attachments
         (id, name, size_bytes, mime_type, storage_key, uploaded_by_actor_id, archived_at)
       values (gen_random_uuid(), 'ref', 1, 'image/png', $1, $2, $3)`,
      [key, actorId, extra?.archived ? new Date() : null],
    );
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: APP_URL, max: 2 });
    const actor = await pool.query<{ id: string }>('select id from core.actors limit 1');
    actorId = actor.rows[0]?.id ?? '';
    if (!actorId) throw new Error('no seeded actor');
  });

  afterAll(async () => {
    await pool.query('delete from voc.voc_attachments where name = $1', ['ref']);
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('delete from voc.voc_attachments where name = $1', ['ref']);
    bucket = new MemoryBucket();
  });

  it('dry run reports old unreferenced objects and deletes nothing', async () => {
    const orphan = newKey(SENSITIVE);
    bucket.put(orphan, 48);
    const summary = await findOrphans(pool, bucket, { apply: false, minAgeHours: 24, limit: 500 }, NOW);
    expect(summary).toMatchObject({ mode: 'dry-run', orphans: 1, deleted: 0, scanned: 1 });
    expect(bucket.deleted).toEqual([]);
    expect(bucket.objects.has(orphan)).toBe(true);
  });

  it('never reports or deletes an object a row references, including an archived claim', async () => {
    const live = newKey();
    const claimed = newKey();
    bucket.put(live, 100);
    bucket.put(claimed, 100);
    await reference(live);
    await reference(claimed, { archived: true });
    const summary = await findOrphans(pool, bucket, { apply: true, minAgeHours: 24, limit: 500 }, NOW);
    expect(summary.orphans).toBe(0);
    expect(bucket.deleted).toEqual([]);
    expect(bucket.objects.size).toBe(2);
  });

  it('skips objects younger than --min-age-hours', async () => {
    const young = newKey();
    const old = newKey();
    bucket.put(young, 23);
    bucket.put(old, 25);
    const summary = await findOrphans(pool, bucket, { apply: true, minAgeHours: 24, limit: 500 }, NOW);
    expect(summary.orphans).toBe(1);
    expect(bucket.deleted).toEqual([old]);
    expect(bucket.objects.has(young)).toBe(true);
  });

  it('--apply deletes exactly the orphans and keeps referenced objects', async () => {
    const orphanA = newKey();
    const orphanB = newKey();
    const kept = newKey();
    bucket.put(orphanA, 30);
    bucket.put(orphanB, 30);
    bucket.put(kept, 30);
    await reference(kept);
    const summary = await findOrphans(pool, bucket, { apply: true, minAgeHours: 24, limit: 500 }, NOW);
    expect(summary).toMatchObject({ mode: 'apply', orphans: 2, deleted: 2, delete_failures: 0 });
    expect(bucket.deleted.sort()).toEqual([orphanA, orphanB].sort());
    expect(bucket.objects.has(kept)).toBe(true);
  });

  it('--limit caps the orphans handled and flags truncation', async () => {
    for (let i = 0; i < 5; i += 1) bucket.put(newKey(), 30);
    const summary = await findOrphans(pool, bucket, { apply: true, minAgeHours: 24, limit: 3 }, NOW);
    expect(summary).toMatchObject({ orphans: 3, deleted: 3, truncated: true });
    expect(bucket.objects.size).toBe(2);
  });

  it('counts a failed delete without aborting the rest', async () => {
    const bad = newKey();
    const good = newKey();
    bucket.put(bad, 30);
    bucket.put(good, 30);
    bucket.failDelete.add(bad);
    const summary = await findOrphans(pool, bucket, { apply: true, minAgeHours: 24, limit: 500 }, NOW);
    expect(summary).toMatchObject({ orphans: 2, deleted: 1, delete_failures: 1 });
    expect(bucket.deleted).toEqual([good]);
  });

  it('emits no raw key, filename or content anywhere in the summary', async () => {
    bucket.put(newKey(SENSITIVE), 30);
    bucket.put(`legacy/${SENSITIVE}`, 30);
    const failing = newKey(SENSITIVE);
    bucket.put(failing, 30);
    bucket.failDelete.add(failing);
    const summary = await findOrphans(pool, bucket, { apply: true, minAgeHours: 24, limit: 500 }, NOW);
    const blob = JSON.stringify(summary);
    expect(blob).not.toContain('ssn');
    expect(blob).not.toContain('patient');
    expect(blob).not.toContain('file.png');
    expect(blob).not.toContain('legacy/');
    expect(summary.ids).toHaveLength(3);
  });
});
