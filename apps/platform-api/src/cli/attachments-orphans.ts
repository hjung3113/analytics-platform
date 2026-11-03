// Attachment orphan inventory (#1266 b4): bucket objects with no voc.voc_attachments row.
//
// A POST /attachments puts the object before its metadata transaction commits, so a crash or a failed best-effort
// delete can leave an object no row points at. The hourly purge job only sees rows, so this CLI covers the rest.
//
// Usage (STORAGE_S3_* and DATABASE_URL from the server environment):
//   pnpm --filter @ap/platform-api exec tsx src/cli/attachments-orphans.ts [--min-age-hours 24] [--limit 500]
//   pnpm --filter @ap/platform-api exec tsx src/cli/attachments-orphans.ts --apply [--min-age-hours 24] [--limit 500]
//
// Dry run (default) prints the orphan count and a filename-free identifier per orphan. `--apply` deletes exactly
// those objects. Only voc.voc_attachments.storage_key references bucket objects. Output never contains raw keys,
// filenames or content: an identifier is `<workspace uuid>/<attachment uuid>` when the key has the expected shape,
// otherwise a one-way digest. Exit codes: 0 ok, 1 failure, 2 usage error.

import { createHash } from 'node:crypto';

import { ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';
import pg from 'pg';

import { parseStorageEnv } from '../lib/storage/factory.js';
import { S3CompatStorageBackend } from '../lib/storage/s3-compat.js';

export const DEFAULT_MIN_AGE_HOURS = 24;
export const DEFAULT_LIMIT = 500;
export const MAX_LIMIT = 5000;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const KEY_SHAPE = new RegExp(`^(${UUID})/(${UUID})/`, 'i');

export class UsageError extends Error {}

export interface OrphansOptions {
  apply: boolean;
  minAgeHours: number;
  limit: number;
}

export interface BucketObject {
  key: string;
  lastModified: Date;
}

export interface OrphanDb {
  query<R extends pg.QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: R[] }>;
}

export interface OrphanStorage {
  listObjects(): AsyncIterable<BucketObject>;
  delete(key: string): Promise<void>;
}

export interface OrphansSummary {
  mode: 'dry-run' | 'apply';
  min_age_hours: number;
  limit: number;
  scanned: number;
  orphans: number;
  truncated: boolean;
  deleted: number;
  delete_failures: number;
  ids: string[];
}

function parseIntegerFlag(flag: string, raw: string | undefined, min: number, max: number): number {
  if (raw === undefined || !/^\d+$/.test(raw)) throw new UsageError(`${flag} needs a positive integer.`);
  const value = Number(raw);
  if (value < min || value > max) throw new UsageError(`${flag} must be between ${min} and ${max}.`);
  return value;
}

export function parseOrphansArgs(argv: string[]): OrphansOptions {
  const options: OrphansOptions = { apply: false, minAgeHours: DEFAULT_MIN_AGE_HOURS, limit: DEFAULT_LIMIT };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--apply') {
      options.apply = true;
    } else if (flag === '--min-age-hours') {
      options.minAgeHours = parseIntegerFlag(flag, argv[i + 1], 0, 24 * 365);
      i += 1;
    } else if (flag === '--limit') {
      options.limit = parseIntegerFlag(flag, argv[i + 1], 1, MAX_LIMIT);
      i += 1;
    } else {
      throw new UsageError(`Unknown or incomplete argument '${flag}'.`);
    }
  }
  return options;
}

/** Filename-free identifier for a storage key. */
export function orphanIdentifier(key: string): string {
  const match = KEY_SHAPE.exec(key);
  const [, workspaceId, attachmentId] = match ?? [];
  if (workspaceId && attachmentId) return `${workspaceId.toLowerCase()}/${attachmentId.toLowerCase()}`;
  return `sha256:${createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
}

async function referencedKeys(db: OrphanDb, keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const result = await db.query<{ storage_key: string }>(
    'select storage_key from voc.voc_attachments where storage_key = any($1::text[])',
    [keys],
  );
  return new Set(result.rows.map((row) => row.storage_key));
}

/**
 * Collects up to `limit` old unreferenced keys (held internally) and, with `apply`, deletes them. The reference
 * check runs per batch right before use, so a row committed during the scan still protects its object.
 */
export async function findOrphans(
  db: OrphanDb,
  storage: OrphanStorage,
  options: OrphansOptions,
  now: Date = new Date(),
): Promise<OrphansSummary> {
  const cutoff = now.getTime() - options.minAgeHours * 3_600_000;
  const orphanKeys: string[] = [];
  let scanned = 0;
  let truncated = false;
  let batch: string[] = [];

  const flush = async (): Promise<void> => {
    const referenced = await referencedKeys(db, batch);
    for (const key of batch) {
      if (referenced.has(key)) continue;
      if (orphanKeys.length >= options.limit) {
        truncated = true;
        break;
      }
      orphanKeys.push(key);
    }
    batch = [];
  };

  for await (const object of storage.listObjects()) {
    scanned += 1;
    if (object.lastModified.getTime() > cutoff) continue;
    batch.push(object.key);
    if (batch.length >= 500) {
      await flush();
      if (truncated) break;
    }
  }
  if (!truncated) await flush();

  let deleted = 0;
  let deleteFailures = 0;
  if (options.apply) {
    for (const key of orphanKeys) {
      try {
        await storage.delete(key);
        deleted += 1;
      } catch {
        deleteFailures += 1;
      }
    }
  }

  return {
    mode: options.apply ? 'apply' : 'dry-run',
    min_age_hours: options.minAgeHours,
    limit: options.limit,
    scanned,
    orphans: orphanKeys.length,
    truncated,
    deleted,
    delete_failures: deleteFailures,
    ids: orphanKeys.map(orphanIdentifier),
  };
}

export function s3OrphanStorage(client: S3Client, bucket: string, backend: S3CompatStorageBackend): OrphanStorage {
  return {
    async *listObjects() {
      let token: string | undefined;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
        for (const object of page.Contents ?? []) {
          if (object.Key !== undefined && object.LastModified !== undefined) {
            yield { key: object.Key, lastModified: object.LastModified };
          }
        }
        token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
      } while (token !== undefined);
    },
    delete: (key) => backend.delete(key),
  };
}

async function main(): Promise<void> {
  const options = parseOrphansArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url) throw new UsageError('DATABASE_URL is required.');
  const cfg = parseStorageEnv(process.env);
  const backend = new S3CompatStorageBackend(cfg);
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const summary = await findOrphans(pool, s3OrphanStorage(backend.client, backend.bucket, backend), options);
    console.info(JSON.stringify(summary, null, 2));
  } finally {
    await pool.end();
  }
}

const invokedAsScript =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('attachments-orphans.ts') === true ||
  process.argv[1]?.endsWith('attachments-orphans.js') === true;

if (invokedAsScript) {
  main().catch((err: unknown) => {
    if (err instanceof UsageError) {
      console.error(`attachments-orphans: ${err.message}`);
      process.exit(2);
    }
    // Error text can embed an object key (S3 messages); print the class only.
    const name = err instanceof Error ? err.name : typeof err;
    console.error(`attachments-orphans failed: ${name}`);
    process.exit(1);
  });
}
