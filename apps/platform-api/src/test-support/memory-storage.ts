// An in-memory `StorageBackend` for suites that need uploads without S3 and want to look at what was stored.

import { Readable } from 'node:stream';

import type { StorageBackend, StorageGetResult, StoragePutInput } from '../lib/storage/index.js';

export function memoryStorage(): StorageBackend & { store: Map<string, { bytes: Buffer; mimeType: string }> } {
  const store = new Map<string, { bytes: Buffer; mimeType: string }>();
  return {
    store,
    async put(input: StoragePutInput) {
      store.set(input.key, { bytes: Buffer.from(input.bytes as Buffer), mimeType: input.mimeType });
      return { key: input.key };
    },
    async get(key: string): Promise<StorageGetResult> {
      const entry = store.get(key);
      if (!entry) throw Object.assign(new Error('no such key'), { name: 'NoSuchKey' });
      return { stream: Readable.from(entry.bytes), mimeType: entry.mimeType, size: entry.bytes.byteLength };
    },
    async delete(key: string) {
      store.delete(key);
    },
    async exists(key: string) {
      return store.has(key);
    },
  };
}
