// Unit test for the bucket copy/verify helper (#1100 b) against a mocked S3 client: every key is copied once with
// its content type, the source is never written or deleted, and verify fails closed on a missing, extra or
// differing object.

import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';

import { copyBucket, listKeys, parseArgs, verifyBuckets } from '../storage-copy-bucket.js';

const SRC = 'fops-attachments';
const DST = 'platform-attachments';

describe('storage-copy-bucket CLI', () => {
  const client = new S3Client({ region: 'us-east-1' });
  const mock = mockClient(client);
  let objects: Record<string, Record<string, string>>;

  beforeEach(() => {
    mock.reset();
    objects = { [SRC]: { 'a/1.png': 'one', 'b/2.pdf': 'two-two' }, [DST]: {} };
    mock.on(ListObjectsV2Command).callsFake(({ Bucket, ContinuationToken }) => {
      const keys = Object.keys(objects[Bucket as string] ?? {}).sort();
      // two keys per page to exercise the continuation token
      const start = ContinuationToken ? Number(ContinuationToken) : 0;
      const page = keys.slice(start, start + 1);
      const more = start + 1 < keys.length;
      return {
        Contents: page.map((Key) => ({ Key })),
        IsTruncated: more,
        NextContinuationToken: more ? String(start + 1) : undefined,
      };
    });
    mock.on(GetObjectCommand).callsFake(({ Bucket, Key }) => {
      const body = objects[Bucket as string]?.[Key as string];
      if (body === undefined) throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
      return {
        Body: Readable.from([Buffer.from(body)]),
        ContentLength: body.length,
        ContentType: 'x/y',
      };
    });
    mock.on(PutObjectCommand).callsFake(({ Bucket, Key, Body, ContentType }) => {
      expect(ContentType).toBe('x/y');
      (objects[Bucket as string] as Record<string, string>)[Key as string] = Buffer.from(
        Body as Buffer,
      ).toString();
      return {};
    });
  });

  it('lists every page', async () => {
    expect(await listKeys(client, SRC)).toEqual(['a/1.png', 'b/2.pdf']);
  });

  it('copies every key unchanged and never writes or deletes the source', async () => {
    const result = await copyBucket(client, SRC, DST);
    expect(result).toEqual({ copied: 2, bytes: 10 });
    expect(objects[DST]).toEqual(objects[SRC]);
    expect(mock.commandCalls(DeleteObjectCommand)).toHaveLength(0);
    expect(mock.commandCalls(PutObjectCommand).every((c) => c.args[0].input.Bucket === DST)).toBe(
      true,
    );
  });

  it('refuses a conflicting existing destination key without changing the destination or source', async () => {
    objects[DST] = { 'a/1.png': 'DIFFERENT', 'z/9': 'only-in-destination' };
    const before = structuredClone(objects);
    await expect(copyBucket(client, SRC, DST)).rejects.toThrow(/a\/1\.png/);
    expect(objects).toEqual(before);
    expect(mock.commandCalls(PutObjectCommand)).toHaveLength(0);
    expect(mock.commandCalls(DeleteObjectCommand)).toHaveLength(0);
  });

  it('keeps byte-identical destination objects on a resumed run and copies only the missing keys', async () => {
    objects[DST] = { 'a/1.png': 'one' };
    const skipped: string[] = [];
    const result = await copyBucket(client, SRC, DST, (key) => skipped.push(key));
    expect(result).toEqual({ copied: 1, bytes: 7 });
    expect(skipped).toEqual(['a/1.png']);
    expect(objects[DST]).toEqual(objects[SRC]);
    expect(mock.commandCalls(PutObjectCommand).map((c) => c.args[0].input.Key)).toEqual([
      'b/2.pdf',
    ]);
  });

  it('verify passes after a copy and fails closed on missing, extra and differing objects', async () => {
    await copyBucket(client, SRC, DST);
    expect(await verifyBuckets(client, SRC, DST)).toMatchObject({
      sourceKeys: 2,
      destinationKeys: 2,
      missing: [],
      extra: [],
      mismatched: [],
    });
    const { 'b/2.pdf': _removed, ...kept } = objects[DST] as Record<string, string>;
    objects[DST] = { ...kept, 'c/3': 'x', 'a/1.png': 'ONE' };
    expect(await verifyBuckets(client, SRC, DST)).toMatchObject({
      missing: ['b/2.pdf'],
      extra: ['c/3'],
      mismatched: ['a/1.png'],
    });
  });

  it('refuses identical buckets and malformed arguments', async () => {
    await expect(copyBucket(client, SRC, SRC)).rejects.toThrow(/differ/);
    expect(parseArgs(['verify', '--source', SRC])).toEqual({ mode: 'verify', source: SRC });
    for (const bad of [[], ['copy'], ['delete', '--source', SRC], ['copy', '--source', SRC, 'x']]) {
      expect(() => parseArgs(bad)).toThrow(/usage/);
    }
  });
});
