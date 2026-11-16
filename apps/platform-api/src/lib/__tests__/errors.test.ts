import { describe, expect, it } from 'vitest';
import { batchItemDetail, statusForCode } from '../errors.js';

describe('batch row details', () => {
  it('retains the conflict destination and adds the zero-based row index without mutating the source', () => {
    const detail = { request_id: 'request-1', review_route: '/admin/permissions/requests?selected=request-1' };
    expect(batchItemDetail(detail, 1)).toEqual({ ...detail, item_index: 1 });
    expect(detail).not.toHaveProperty('item_index');
    expect(batchItemDetail(undefined, 0)).toEqual({ item_index: 0 });
  });
});

describe('statusForCode — Slice 3 #13 prefixes', () => {
  it.each([
    ['voc.severity_not_user_settable', 422],
    ['rich_content.disallowed_node', 422],
    ['rich_content.external_image_forbidden', 422],
    ['validation.unexpected_field', 422],
  ] as const)('%s → %d', (code, status) => {
    expect(statusForCode(code as never)).toBe(status);
  });
});

describe('statusForCode — PLAN-22 C3a storage prefix', () => {
  it('storage.unavailable → 502', () => {
    expect(statusForCode('storage.unavailable' as never)).toBe(502);
  });

  it('attachment.too_large → 422', () => {
    expect(statusForCode('attachment.too_large' as never)).toBe(422);
  });

  it('attachment.unsupported_type → 422', () => {
    expect(statusForCode('attachment.unsupported_type' as never)).toBe(422);
  });

  it('not_implemented.todo → 501', () => {
    expect(statusForCode('not_implemented.todo' as never)).toBe(501);
  });
});

describe('statusForCode — #1266 b3 service prefix', () => {
  it('service.unavailable → 503', () => {
    expect(statusForCode('service.unavailable')).toBe(503);
  });
});
