// Pure judgments of the Sample Window and equipment-registration actions (#1658 Sample Window·Fleet PR, ADR-0139 amendment). The verdict of a
// window file is `@eqv/core`'s `checkSampleWindowImport`; its issue objects are mapped to `{ path, code }` here (core messages can quote the
// uploaded text and never leave the module). A stored window is addressed by the 64 hex digits of its `sha256:` hash.
import { checkSampleWindowImport, type SampleWindowImportCheck } from '@eqv/core';

import type { FieldError } from '../../menu-dispatch/types.js';
import { isUuid } from './mapping-checks.js';

const ISSUES_MAX = 20;
export const WINDOW_HEX_PATTERN = /^[0-9a-f]{64}$/;
/** The id an equipment may be registered under (the `equipmentRecordSchema` name rule) and its length cap. */
export const REGISTER_EQUIPMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const EQUIPMENT_ID_MAX = 200;
export const EQUIPMENT_LABEL_MAX = 120;
// eslint-disable-next-line no-control-regex -- a Fleet label is printable text; control characters are refused
const CONTROL = /[\u0000-\u001f\u007f]/;

export const isWindowHex = (value: unknown): value is string => typeof value === 'string' && WINDOW_HEX_PATTERN.test(value);
export const windowHashOf = (hex: string): string => `sha256:${hex}`;

export type WindowState = 'active' | 'staged' | 'replaced' | 'retired';
export type WindowRef = { from: string; to: string; hash: string; timeDomain: string };

/** The upload bytes as JSON; null for anything that is not strict UTF-8 JSON. */
export function parseUploadJson(bytes: Uint8Array): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown };
  } catch {
    return { ok: false };
  }
}

export type CheckedWindowFile =
  | { ok: true; check: Extract<SampleWindowImportCheck, { ok: true }> }
  | { ok: false; errors: FieldError[] };

/** `checkSampleWindowImport` with `sameRangeReplaces`: a reprocessed Data Generation of an exact range is not an overlap (EV#105). */
export async function checkWindowFile(raw: unknown, equipmentId: string, existing: WindowRef[]): Promise<CheckedWindowFile> {
  const verdict = await checkSampleWindowImport(raw, { equipmentId, existing, sameRangeReplaces: true });
  if (verdict.ok) return { ok: true, check: verdict };
  return { ok: false, errors: verdict.issues.slice(0, ISSUES_MAX).map(({ code, path }) => ({ path: ['file', ...path.map(String)], code })) };
}

export type RegisterInput = { equipmentId: string; label: string; vendorId: string; modelId: string };

/** The shape of a registration; existence of the ids is judged in the action against the Hub and the table. */
export function registerErrors(input: Record<string, unknown>): FieldError[] {
  const errors: FieldError[] = [];
  const id = input.equipmentId;
  if (typeof id !== 'string' || id.length > EQUIPMENT_ID_MAX || !REGISTER_EQUIPMENT_ID_PATTERN.test(id)) errors.push({ path: ['equipmentId'], code: 'invalid' });
  const label = typeof input.label === 'string' ? input.label.trim() : '';
  if (label === '' || label.length > EQUIPMENT_LABEL_MAX || CONTROL.test(label)) errors.push({ path: ['label'], code: 'invalid' });
  if (!isUuid(input.vendorId)) errors.push({ path: ['vendorId'], code: 'invalid' });
  if (!isUuid(input.modelId)) errors.push({ path: ['modelId'], code: 'invalid' });
  return errors;
}
