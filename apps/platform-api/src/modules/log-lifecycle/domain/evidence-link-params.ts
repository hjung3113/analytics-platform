// Params of the reverse lookup of an evidence location (#1470): `(fileRef, line, fileSha256)` plus a 0-based page. Pure and DB-free.
// A refused value is described by its field name, never echoed (a file reference is a customer path).

import { unsafeText } from '../../../lib/text-safety.js';
import { FILE_REF_MAX } from './sample-set.js';

export const EVIDENCE_LINK_PARAM_KEYS = ['fileRef', 'line', 'fileSha256', 'page', 'pageSize'] as const;
export const EVIDENCE_LINK_PAGE_SIZE_DEFAULT = 50;
export const EVIDENCE_LINK_PAGE_SIZE_MAX = 100;

export interface EvidenceLinkQuery {
  fileRef: string;
  line: number;
  fileSha256: string;
  page: number;
  pageSize: number;
}
export type EvidenceLinkParse = { ok: true; value: EvidenceLinkQuery } | { ok: false; message: string };

const SHA256 = /^[0-9a-f]{64}$/;
function hasControl(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) return true;
  }
  return false;
}
const fail = (message: string): EvidenceLinkParse => ({ ok: false, message: `invalid params: ${message}` });

export function parseEvidenceLinkParams(params: Record<string, unknown>): EvidenceLinkParse {
  const { fileRef, line, fileSha256 } = params;
  if (typeof fileRef !== 'string' || [...fileRef].length < 1 || [...fileRef].length > FILE_REF_MAX || unsafeText(fileRef) || hasControl(fileRef)) {
    return fail(`fileRef: must be a text of 1..${FILE_REF_MAX} characters without control characters`);
  }
  if (typeof line !== 'number' || !Number.isInteger(line) || line < 1 || line > Number.MAX_SAFE_INTEGER) return fail('line: must be an integer >= 1');
  if (typeof fileSha256 !== 'string' || !SHA256.test(fileSha256)) return fail('fileSha256: must be 64 lowercase hex characters');
  const page = params.page ?? 0;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 0 || page > 1_000_000) return fail('page: must be a non-negative integer (0-based)');
  const pageSize = params.pageSize ?? EVIDENCE_LINK_PAGE_SIZE_DEFAULT;
  if (typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > EVIDENCE_LINK_PAGE_SIZE_MAX) {
    return fail(`pageSize: must be an integer from 1 to ${EVIDENCE_LINK_PAGE_SIZE_MAX}`);
  }
  return { ok: true, value: { fileRef, line, fileSha256, page, pageSize } };
}
