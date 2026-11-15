import { describe, expect, it } from 'vitest';
import { patchFindingResponseSchema } from '../index.js';

const metadata = { id: '00000000-0000-4000-8000-000000000001', updated_at: '2026-11-15T00:00:00.000Z' };

describe('Finding mutation metadata response', () => {
  it('accepts a metadata-only successful write', () => {
    expect(patchFindingResponseSchema.parse(metadata)).toEqual(metadata);
  });
  it('rejects partial private Finding data rather than stripping it into metadata', () => {
    expect(patchFindingResponseSchema.safeParse({ ...metadata, title: 'Synthetic private title' }).success).toBe(false);
  });
});
