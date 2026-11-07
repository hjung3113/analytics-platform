// The sample set of a validation round (design §3, start values recorded in docs/architecture/platform-api/api/
// log-lifecycle.md): `{ files: [{ fileRef, order, sha256 }], sourceOwner }`, strict. Pure and DB-free: the parser the
// `roundOpen` validation and handler share, and the manifest digest the node d request reuses as `input_manifest_digest`.
// `fileRef` is an opaque external location string: nothing is resolved, normalised or fetched here.

import { createHash } from 'node:crypto';

import { unsafeText } from '../../../lib/text-safety.js';
import type { FieldError } from '../../menu-dispatch/types.js';

export const SAMPLE_FILES_MAX = 1000;
export const FILE_REF_MAX = 1024;
export const SOURCE_OWNER_MAX = 200;

export interface SampleFile {
  fileRef: string;
  order: number;
  sha256: string;
}
export interface SampleSet {
  files: SampleFile[];
  sourceOwner: string;
}

export type SampleSetParse = { ok: true; value: SampleSet } | { ok: false; errors: FieldError[] };

const SHA256 = /^[0-9a-f]{64}$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** C0, DEL and C1 control characters (and NUL / lone surrogates through `unsafeText`). */
function hasControl(value: string): boolean {
  if (unsafeText(value)) return true;
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) return true;
  }
  return false;
}

/**
 * Codes (path under `sampleSet`): `required` (missing / wrong type), `malformed` (unknown key, bad value),
 * `too_many`, `too_long`, `duplicate` (a `fileRef` twice), `order_invalid` (`order` is not each of 1..n once).
 * The files keep the user's order; nothing is sorted by time or by name.
 */
export function parseSampleSet(raw: unknown): SampleSetParse {
  const err = (path: (string | number)[], code: string): SampleSetParse => ({
    ok: false,
    errors: [{ path: ['sampleSet', ...path.map(String)], code }],
  });
  if (raw === undefined || raw === null) return err([], 'required');
  if (!isRecord(raw)) return err([], 'malformed');
  for (const key of Object.keys(raw)) if (key !== 'files' && key !== 'sourceOwner') return err([key], 'malformed');

  const files = raw.files;
  if (files === undefined) return err(['files'], 'required');
  if (!Array.isArray(files)) return err(['files'], 'malformed');
  if (files.length === 0) return err(['files'], 'required');
  if (files.length > SAMPLE_FILES_MAX) return err(['files'], 'too_many');

  const sourceOwner = raw.sourceOwner;
  if (typeof sourceOwner !== 'string') return err(['sourceOwner'], 'required');
  const owner = sourceOwner.trim();
  if (owner === '') return err(['sourceOwner'], 'required');
  if (hasControl(owner)) return err(['sourceOwner'], 'malformed');
  if ([...owner].length > SOURCE_OWNER_MAX) return err(['sourceOwner'], 'too_long');

  const parsed: SampleFile[] = [];
  const seenRefs = new Set<string>();
  const seenOrders = new Set<number>();
  for (let i = 0; i < files.length; i += 1) {
    const file: unknown = files[i];
    if (!isRecord(file)) return err(['files', i], 'malformed');
    for (const key of Object.keys(file)) if (key !== 'fileRef' && key !== 'order' && key !== 'sha256') return err(['files', i, key], 'malformed');
    const { fileRef, order, sha256 } = file;
    if (typeof fileRef !== 'string') return err(['files', i, 'fileRef'], 'required');
    const ref = fileRef.trim();
    if (ref === '') return err(['files', i, 'fileRef'], 'required');
    if (hasControl(ref)) return err(['files', i, 'fileRef'], 'malformed');
    if ([...ref].length > FILE_REF_MAX) return err(['files', i, 'fileRef'], 'too_long');
    if (seenRefs.has(ref)) return err(['files', i, 'fileRef'], 'duplicate');
    seenRefs.add(ref);
    if (typeof order !== 'number' || !Number.isInteger(order)) return err(['files', i, 'order'], 'order_invalid');
    if (order < 1 || order > files.length || seenOrders.has(order)) return err(['files', i, 'order'], 'order_invalid');
    seenOrders.add(order);
    if (typeof sha256 !== 'string' || !SHA256.test(sha256)) return err(['files', i, 'sha256'], 'malformed');
    parsed.push({ fileRef: ref, order, sha256 });
  }
  return { ok: true, value: { files: parsed, sourceOwner: owner } };
}

/**
 * SHA-256 hex of the canonical serialisation `{"files":[{"order","fileRef","sha256"}…],"sourceOwner"}` with the files
 * sorted by `order` and the keys in exactly this sequence. Reordering the files changes it; the same input never does.
 */
export function sampleManifestDigest(set: SampleSet): string {
  const files = [...set.files]
    .sort((a, b) => a.order - b.order)
    .map((f) => ({ order: f.order, fileRef: f.fileRef, sha256: f.sha256 }));
  return createHash('sha256').update(JSON.stringify({ files, sourceOwner: set.sourceOwner }), 'utf8').digest('hex');
}
