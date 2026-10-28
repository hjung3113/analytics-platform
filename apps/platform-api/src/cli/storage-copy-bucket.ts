// Bucket rename helper (#1100 b): copy every object of the old attachment bucket into the new one and verify the
// copy before an operator switches STORAGE_S3_BUCKET. Attachment rows store object keys, not bucket names, so the
// copy keeps every key unchanged and no database row is touched.
//
// Usage (connection and destination come from the same STORAGE_S3_* variables the server reads; the destination
// bucket is STORAGE_S3_BUCKET and must already exist, e.g. via storage-bootstrap.ts):
//   pnpm --filter @ap/platform-api exec tsx src/cli/storage-copy-bucket.ts copy   --source fops-attachments
//   pnpm --filter @ap/platform-api exec tsx src/cli/storage-copy-bucket.ts verify --source fops-attachments
//
// Boundaries: the source bucket is only listed and read. Nothing is deleted and no bucket policy or other bucket
// setting is changed. An existing destination object is never overwritten: a byte-identical one is kept (a resumed
// run copies only the missing keys) and a different one aborts `copy` before any write. Stop attachment writes
// before the final copy + verify; the source bucket stays available until it is retired by a separate, explicit step.
// `verify` compares the key inventory and the SHA-256 and length of every object and exits non-zero on any
// difference, so a green `verify` is the condition for switching the configuration.

import { createHash } from 'node:crypto';

import { GetObjectCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

import { parseStorageEnv } from '../lib/storage/factory.js';
import { S3CompatStorageBackend } from '../lib/storage/s3-compat.js';

export interface CopyResult {
  copied: number;
  bytes: number;
}

export interface VerifyResult {
  sourceKeys: number;
  destinationKeys: number;
  missing: string[];
  extra: string[];
  mismatched: string[];
}

export async function listKeys(client: S3Client, bucket: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    );
    for (const object of page.Contents ?? []) {
      if (object.Key !== undefined) keys.push(object.Key);
    }
    token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
  } while (token !== undefined);
  return keys.sort();
}

async function digest(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<{ sha256: string; length: number }> {
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const hash = createHash('sha256');
  let length = 0;
  for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
    hash.update(chunk);
    length += chunk.byteLength;
  }
  return { sha256: hash.digest('hex'), length };
}

function assertDistinct(source: string, destination: string): void {
  if (source === destination) throw new Error('source and destination bucket must differ');
}

export class DestinationConflictError extends Error {
  constructor(readonly keys: string[]) {
    super(
      `destination already holds different bytes for ${keys.length} key(s); nothing was written: ${keys.join(', ')}`,
    );
    this.name = 'DestinationConflictError';
  }
}

/**
 * Copies the source keys that the destination lacks. A destination key that already exists is never replaced:
 * identical bytes are kept (reported through `onKept`), different bytes abort the whole copy before any write.
 */
export async function copyBucket(
  client: S3Client,
  source: string,
  destination: string,
  onKept?: (key: string) => void,
): Promise<CopyResult> {
  assertDistinct(source, destination);
  const present = new Set(await listKeys(client, destination));
  const sourceKeys = await listKeys(client, source);
  const kept: string[] = [];
  const conflicts: string[] = [];
  for (const key of sourceKeys.filter((candidate) => present.has(candidate))) {
    const [from, to] = await Promise.all([
      digest(client, source, key),
      digest(client, destination, key),
    ]);
    if (from.sha256 === to.sha256 && from.length === to.length) kept.push(key);
    else conflicts.push(key);
  }
  if (conflicts.length > 0) throw new DestinationConflictError(conflicts);
  for (const key of kept) onKept?.(key);
  const result: CopyResult = { copied: 0, bytes: 0 };
  for (const key of sourceKeys.filter((candidate) => !present.has(candidate))) {
    const object = await client.send(new GetObjectCommand({ Bucket: source, Key: key }));
    await new Upload({
      client,
      params: {
        Bucket: destination,
        Key: key,
        Body: object.Body as NonNullable<typeof object.Body>,
        ContentType: object.ContentType,
        Metadata: object.Metadata,
      },
    }).done();
    result.copied += 1;
    result.bytes += object.ContentLength ?? 0;
  }
  return result;
}

export async function verifyBuckets(
  client: S3Client,
  source: string,
  destination: string,
): Promise<VerifyResult> {
  assertDistinct(source, destination);
  const sourceKeys = await listKeys(client, source);
  const destinationKeys = await listKeys(client, destination);
  const inDestination = new Set(destinationKeys);
  const inSource = new Set(sourceKeys);
  const missing = sourceKeys.filter((key) => !inDestination.has(key));
  const extra = destinationKeys.filter((key) => !inSource.has(key));
  const mismatched: string[] = [];
  for (const key of sourceKeys.filter((candidate) => inDestination.has(candidate))) {
    const [from, to] = await Promise.all([
      digest(client, source, key),
      digest(client, destination, key),
    ]);
    if (from.sha256 !== to.sha256 || from.length !== to.length) mismatched.push(key);
  }
  return {
    sourceKeys: sourceKeys.length,
    destinationKeys: destinationKeys.length,
    missing,
    extra,
    mismatched,
  };
}

export function parseArgs(argv: string[]): { mode: 'copy' | 'verify'; source: string } {
  const [mode, flag, source, ...rest] = argv;
  if ((mode !== 'copy' && mode !== 'verify') || flag !== '--source' || !source || rest.length > 0) {
    throw new Error('usage: storage-copy-bucket.ts <copy|verify> --source <old-bucket>');
  }
  return { mode, source };
}

async function main(): Promise<void> {
  const { mode, source } = parseArgs(process.argv.slice(2));
  const backend = new S3CompatStorageBackend(parseStorageEnv(process.env));
  if (mode === 'copy') {
    let kept = 0;
    const result = await copyBucket(backend.client, source, backend.bucket, () => {
      kept += 1;
    });
    console.info(
      `copied ${result.copied} objects (${result.bytes} bytes), kept ${kept} identical existing: ${source} -> ${backend.bucket}`,
    );
    return;
  }
  const result = await verifyBuckets(backend.client, source, backend.bucket);
  console.info(
    `source ${result.sourceKeys} keys, destination ${result.destinationKeys} keys, missing ${result.missing.length}, extra ${result.extra.length}, mismatched ${result.mismatched.length}`,
  );
  if (result.missing.length + result.extra.length + result.mismatched.length > 0) {
    for (const key of result.missing) console.error(`missing: ${key}`);
    for (const key of result.extra) console.error(`extra: ${key}`);
    for (const key of result.mismatched) console.error(`mismatched: ${key}`);
    process.exit(1);
  }
}

const invokedAsScript =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('storage-copy-bucket.ts') === true ||
  process.argv[1]?.endsWith('storage-copy-bucket.js') === true;

if (invokedAsScript) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`storage-copy-bucket failed: ${msg}`);
    process.exit(1);
  });
}
