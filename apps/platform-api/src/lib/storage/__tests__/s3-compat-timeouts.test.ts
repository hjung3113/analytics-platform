// #1266 b4: a stalled object store fails as StorageUnavailableError within the
// configured request deadline instead of hanging the upload.

import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { parseStorageEnv } from '../factory.js';
import { StorageUnavailableError } from '../index.js';
import { S3CompatStorageBackend } from '../s3-compat.js';

const BASE_ENV = {
  STORAGE_S3_ENDPOINT: 'http://localhost:9000',
  STORAGE_S3_REGION: 'us-east-1',
  STORAGE_S3_BUCKET: 'b',
  STORAGE_S3_ACCESS_KEY_ID: 'x',
  STORAGE_S3_SECRET_ACCESS_KEY: 'y',
};

describe('storage timeouts (#1266 b4)', () => {
  let server: Server | undefined;

  afterEach(async () => {
    server?.closeAllConnections();
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
  });

  it('defaults to a 30 s request timeout and a 5 s connect timeout', () => {
    const cfg = parseStorageEnv(BASE_ENV);
    expect(cfg.requestTimeoutMs).toBe(30_000);
    expect(cfg.connectTimeoutMs).toBe(5_000);
  });

  it('reads STORAGE_S3_REQUEST_TIMEOUT_MS and STORAGE_S3_CONNECT_TIMEOUT_MS', () => {
    const cfg = parseStorageEnv({
      ...BASE_ENV,
      STORAGE_S3_REQUEST_TIMEOUT_MS: '1500',
      STORAGE_S3_CONNECT_TIMEOUT_MS: '700',
    });
    expect(cfg.requestTimeoutMs).toBe(1500);
    expect(cfg.connectTimeoutMs).toBe(700);
  });

  it.each(['0', '-5', 'abc', '1.5'])('rejects STORAGE_S3_REQUEST_TIMEOUT_MS=%s', (value) => {
    expect(() => parseStorageEnv({ ...BASE_ENV, STORAGE_S3_REQUEST_TIMEOUT_MS: value })).toThrow(
      /STORAGE_S3_REQUEST_TIMEOUT_MS/,
    );
  });

  it('put() against a server that never answers rejects with StorageUnavailableError', async () => {
    server = createServer(() => {
      /* accept the request, never respond */
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const backend = new S3CompatStorageBackend({
      endpoint: `http://127.0.0.1:${port}`,
      region: 'us-east-1',
      bucket: 'b',
      accessKeyId: 'x',
      secretAccessKey: 'y',
      forcePathStyle: true,
      requestTimeoutMs: 150,
      connectTimeoutMs: 150,
    });
    const started = Date.now();
    await expect(
      backend.put({ key: 'w/a/f.png', bytes: Buffer.from('x'), mimeType: 'image/png' }),
    ).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 20_000);
});
