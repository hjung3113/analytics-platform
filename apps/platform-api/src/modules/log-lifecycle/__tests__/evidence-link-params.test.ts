// Params of the evidence reverse lookup (#1470): DB-free.
import { describe, expect, it } from 'vitest';

import { EVIDENCE_LINK_PAGE_SIZE_DEFAULT, EVIDENCE_LINK_PAGE_SIZE_MAX, parseEvidenceLinkParams } from '../domain/evidence-link-params.js';

const SHA = 'a'.repeat(64);
const ok = { fileRef: 's3://b/f.log', line: 3, fileSha256: SHA };

describe('parseEvidenceLinkParams', () => {
  it('accepts a location and defaults the page', () => {
    expect(parseEvidenceLinkParams(ok)).toEqual({ ok: true, value: { ...ok, page: 0, pageSize: EVIDENCE_LINK_PAGE_SIZE_DEFAULT } });
  });

  it('counts code points like the sample set: 1024 astral characters pass, 1025 fail', () => {
    const astral = '\u{1F600}';
    expect(parseEvidenceLinkParams({ ...ok, fileRef: astral.repeat(1024) }).ok).toBe(true);
    expect(parseEvidenceLinkParams({ ...ok, fileRef: astral.repeat(1025) }).ok).toBe(false);
  });

  it('accepts a line above the 32-bit range, up to the safe integer limit', () => {
    expect(parseEvidenceLinkParams({ ...ok, line: 2_147_483_648 }).ok).toBe(true);
    expect(parseEvidenceLinkParams({ ...ok, line: Number.MAX_SAFE_INTEGER }).ok).toBe(true);
    expect(parseEvidenceLinkParams({ ...ok, line: Number.MAX_SAFE_INTEGER + 1 }).ok).toBe(false);
  });

  it.each([
    ['missing fileRef', { line: 1, fileSha256: SHA }, /fileRef/],
    ['empty fileRef', { ...ok, fileRef: '' }, /fileRef/],
    ['control character in fileRef', { ...ok, fileRef: 'a\u0007b' }, /fileRef/],
    ['fileRef over 1024', { ...ok, fileRef: 'x'.repeat(1025) }, /fileRef/],
    ['line zero', { ...ok, line: 0 }, /line/],
    ['fractional line', { ...ok, line: 1.5 }, /line/],
    ['string line', { ...ok, line: '3' }, /line/],
    ['uppercase hash', { ...ok, fileSha256: 'A'.repeat(64) }, /fileSha256/],
    ['short hash', { ...ok, fileSha256: 'abc' }, /fileSha256/],
    ['negative page', { ...ok, page: -1 }, /page/],
    ['page size over max', { ...ok, pageSize: EVIDENCE_LINK_PAGE_SIZE_MAX + 1 }, /pageSize/],
  ])('refuses %s without echoing the value', (_name, params, field) => {
    const parsed = parseEvidenceLinkParams(params);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.message).toMatch(field);
      expect(parsed.message).not.toContain('x'.repeat(50));
    }
  });
});
