// Pure judgments of the eqv writes. `@eqv/core`'s `validateLayout` is the final verdict (EV ADR-0010): nothing is stored before it
// passes, and only the validated `result.layout` is hashed and stored (never the raw input). zod 4 of `@eqv/core` stays inside this
// file: its issue objects are mapped to plain field errors and never leave the module (ADR-0135).
import { BUNDLED_TEMPLATE_IDS, idSchema, validateLayout, type EquipmentLayoutDocument } from '@eqv/core';

import type { FieldError } from '../../menu-dispatch/types.js';

export const REVISION_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ISSUES_MAX = 20;
const NAME_MAX = 200;

export const isLayoutId = (value: unknown): value is string => typeof value === 'string' && idSchema.safeParse(value).success;

export type CheckedLayout = { ok: true; layout: EquipmentLayoutDocument } | { ok: false; errors: FieldError[] };

/** Validates a document the way the Studio did, then the two carried-over refusals: `id` equals the layout id, `kind` is `equipment-layout`. */
export function checkEquipmentLayout(layoutId: string, document: unknown, prefix: readonly string[] = ['document']): CheckedLayout {
  const result = validateLayout(document);
  if (!result.ok) {
    return {
      ok: false,
      errors: result.issues.slice(0, ISSUES_MAX).map((issue) => ({ path: [...prefix, ...issue.path.map(String)], code: issue.code })),
    };
  }
  const { layout } = result;
  if (layout.kind !== 'equipment-layout') return { ok: false, errors: [{ path: [...prefix, 'kind'], code: 'kind_not_equipment_layout' }] };
  if (layout.id !== layoutId) return { ok: false, errors: [{ path: [...prefix, 'id'], code: 'id_mismatch' }] };
  return { ok: true, layout };
}

export const isBundledTemplateId = (templateId: string): boolean => BUNDLED_TEMPLATE_IDS.includes(templateId);

export const nameProblem = (name: unknown): FieldError | null =>
  typeof name === 'string' && name.trim() !== '' && name.length <= NAME_MAX ? null : { path: ['name'], code: 'invalid' };
