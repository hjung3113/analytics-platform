// Header recognition of a model import sheet (#1195 b2, ADR-0107 decision 2 supplement). The sheet carries names
// only: 메이커명, 모델명 and the optional 공정명 (several process names split by `,`). The aliases below are compared
// after trim and NFKC. The old code headers stay accepted as optional columns. At upload the server maps the
// recognized headers itself, so no mapping step is needed. Pure.

import type { HeaderFailure } from './import-file.js';

/** Field → accepted header texts (compared after `headerKey`). Order is the order a duplicate is reported in. */
export const MODEL_HEADER_ALIASES: Readonly<Record<string, readonly string[]>> = {
  vendor_name: ['메이커명', '메이커', '제조사', 'vendor_name'],
  model_name: ['모델명', '모델', 'model_name'],
  process_names: ['공정명', '공정', 'process_names'],
  vendor_code: ['vendor_code'],
  model_code: ['model_code'],
  process_codes: ['process_codes'],
};

/** The names a missing required header is reported as. */
export const REQUIRED_MODEL_HEADERS = { vendor: '메이커명', model: '모델명' } as const;

export const headerKey = (header: string): string => header.normalize('NFKC').trim();

const FIELD_OF_HEADER: ReadonlyMap<string, string> = new Map(
  Object.entries(MODEL_HEADER_ALIASES).flatMap(([field, names]) => names.map((n) => [headerKey(n), field] as const)),
);

export type ModelHeaderRecognition =
  | { kind: 'none' }
  | { kind: 'mapped'; mapping: Record<string, string> }
  | ({ kind: 'failed' } & HeaderFailure);

/**
 * `none`: no header is recognized, so the job waits for `importMap` (an API client's own headers). `failed`: two
 * headers resolve to one field (`duplicate_header`, the header texts named) or a required one is absent
 * (`missing_header`: 메이커명 and/or 모델명; a `vendor_code`/`model_code` column stands in for its name column).
 */
export function recognizeModelHeaders(headers: readonly string[]): ModelHeaderRecognition {
  const byField = new Map<string, string[]>();
  for (const header of headers) {
    const field = FIELD_OF_HEADER.get(headerKey(header));
    if (field === undefined) continue;
    byField.set(field, [...(byField.get(field) ?? []), header]);
  }
  if (byField.size === 0) return { kind: 'none' };
  const dup = [...byField.values()].find((list) => list.length > 1);
  if (dup) return { kind: 'failed', code: 'duplicate_header', headers: dup };
  const missing: string[] = [];
  if (!byField.has('vendor_name') && !byField.has('vendor_code')) missing.push(REQUIRED_MODEL_HEADERS.vendor);
  if (!byField.has('model_name') && !byField.has('model_code')) missing.push(REQUIRED_MODEL_HEADERS.model);
  if (missing.length > 0) return { kind: 'failed', code: 'missing_header', headers: missing };
  return { kind: 'mapped', mapping: Object.fromEntries([...byField].map(([field, list]) => [field, list[0] as string])) };
}

/** The parser callback: only a failure refuses the file. */
export const modelHeaderFailure = (headers: string[]): HeaderFailure | null => {
  const r = recognizeModelHeaders(headers);
  return r.kind === 'failed' ? { code: r.code, headers: r.headers } : null;
};
