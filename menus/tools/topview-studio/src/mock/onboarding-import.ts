/**
 * Sample Window import and equipment registration of the 설비 온보딩 mock (#1658), answered the way the server will: the import reads the
 * uploaded `*.batch.json` by id as the uploader (`readUpload`, ADR-0140 §6) and judges it with the dev tool's own code, `@eqv/core`
 * `checkSampleWindowImport` and `buildInventory`. Mock code may not import `@eqv/core`, so the app's mock assembly hands both in with
 * `setSampleWindowImport`; without them the import answers `error`.
 */
import { MockActionInvalid, defineMockAction, defineMockAsyncAction, type AnyMockAction } from '@ap/mock-server';
import type { FieldError } from '@ap/contracts';
import {
  EQUIPMENT_ID_MAX, EQUIPMENT_ID_PATTERN, EQUIPMENT_LABEL_MAX, importSampleWindow, registerEquipment, type JsonDocument, type SampleWindowRow,
} from '../endpoints';
import { equipmentById, hexOf, onboarding } from './onboarding-store';

type WindowRef = { from: string; to: string; hash: string; timeDomain: string };
/** The shapes of `@eqv/core` the mock reads (method syntax, so core's stricter types are accepted where the app passes them in). */
export type SampleWindowImportHooks = {
  check(raw: unknown, ctx: { equipmentId: string; existing: WindowRef[]; sameRangeReplaces: boolean }): Promise<
    | { ok: true; batch: unknown; summary: { from: string; to: string; timeDomain: string; dataGeneration: string; occurrences: number; hash: string }; same: WindowRef | null; replaces: WindowRef[] }
    | { ok: false; issues: { code: string; path: (string | number)[] }[] }
  >;
  inventory(batch: unknown): JsonDocument;
};

let hooks: SampleWindowImportHooks | null = null;
export function setSampleWindowImport(next: SampleWindowImportHooks): void { hooks = next; }

const err = (path: string[], code: string): FieldError => ({ path, code });
/** A Fleet label is printable text, like the server's equipment id rule. */
const CONTROL = /[\u0000-\u001f\u007f]/;

export const onboardingImportMock: readonly AnyMockAction[] = [
  defineMockAsyncAction(importSampleWindow, {
    validate: (input) => [
      ...(typeof input.equipmentId === 'string' && EQUIPMENT_ID_PATTERN.test(input.equipmentId) && equipmentById(input.equipmentId) ? [] : [err(['equipmentId'], 'not_found')]),
      ...(typeof input.uploadId === 'string' && input.uploadId !== '' ? [] : [err(['uploadId'], 'invalid')]),
    ],
    handle: async ({ input, readUpload }) => {
      const upload = readUpload?.(input.uploadId) ?? null;
      if (upload === null) throw new MockActionInvalid([err(['uploadId'], 'not_found')]);
      if (hooks === null) throw new Error('setSampleWindowImport was not called');
      let raw: unknown;
      try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(upload.bytes)); } catch { throw new MockActionInvalid([err(['file'], 'not_json')]); }
      const rows = onboarding().windows.get(input.equipmentId) ?? [];
      const existing = rows.filter((w) => w.state !== 'retired').map(({ from, to, hash, timeDomain }) => ({ from, to, hash, timeDomain }));
      const verdict = await hooks.check(raw, { equipmentId: input.equipmentId, existing, sameRangeReplaces: true });
      if (!verdict.ok) throw new MockActionInvalid(verdict.issues.map(({ code, path }) => err(['file', ...path.map(String)], code)));
      const known = rows.find((w) => w.hash === verdict.summary.hash);
      if (known) return { data: structuredClone(known), version: null };
      // EV#105: a reprocessed generation of an active window's exact range waits as `staged` until `replaceSampleWindow`.
      const active = verdict.replaces.map((ref) => rows.find((w) => w.hash === ref.hash)).find((w) => w?.state === 'active') ?? null;
      if (active && rows.some((w) => w.state === 'staged' && w.counterpart === active.hash)) throw new MockActionInvalid([err(['file'], 'staged_exists')]);
      const { summary } = verdict;
      const row: SampleWindowRow = {
        hash: summary.hash, from: summary.from, to: summary.to, dataGeneration: summary.dataGeneration, timeDomain: summary.timeDomain,
        occurrences: summary.occurrences, state: active ? 'staged' : 'active', counterpart: active?.hash ?? null, mappingCount: 0,
      };
      // The mock keeps no alias metadata, so the Inventory is built from the batch alone (the server adds the equipment's metadata).
      onboarding().inventories.set(hexOf(row.hash), hooks.inventory(verdict.batch));
      onboarding().windows.set(input.equipmentId, [...rows, row]);
      const equipment = equipmentById(input.equipmentId)!;
      if (equipment.status === 'no-observations') {
        const ruled = [`equipment/${equipment.equipmentId}`, `model/${equipment.vendorId}/${equipment.modelId}`].some((key) => onboarding().rules.has(key));
        equipment.status = ruled ? 'draft' : 'unstarted';
      }
      return { data: structuredClone(row), version: null };
    },
  }),
  defineMockAction(registerEquipment, {
    validate: (input) => {
      const errors: FieldError[] = [];
      if (typeof input.equipmentId !== 'string' || input.equipmentId.length > EQUIPMENT_ID_MAX || !EQUIPMENT_ID_PATTERN.test(input.equipmentId)) errors.push(err(['equipmentId'], 'invalid'));
      const label = typeof input.label === 'string' ? input.label.trim() : '';
      if (label === '' || label.length > EQUIPMENT_LABEL_MAX || CONTROL.test(label)) errors.push(err(['label'], 'invalid'));
      for (const key of ['vendorId', 'modelId'] as const) if (typeof input[key] !== 'string' || input[key] === '') errors.push(err([key], 'invalid'));
      return errors;
    },
    handle: ({ input }) => {
      const state = onboarding();
      const id = input.equipmentId.toLowerCase();
      if (state.equipment.some((e) => e.equipmentId.toLowerCase() === id)) throw new MockActionInvalid([err(['equipmentId'], 'exists')]);
      // The Hub vendors and models the mock knows are the ones its equipment use.
      const vendor = state.equipment.find((e) => e.vendorId === input.vendorId);
      if (!vendor) throw new MockActionInvalid([err(['vendorId'], 'not_found')]);
      const model = state.equipment.find((e) => e.vendorId === input.vendorId && e.modelId === input.modelId);
      if (!model) throw new MockActionInvalid([err(['modelId'], 'not_found')]);
      state.equipment.push({
        equipmentId: input.equipmentId, label: input.label.trim(), vendorId: vendor.vendorId, vendorName: vendor.vendorName, modelId: model.modelId, modelName: model.modelName,
        status: 'no-observations', coverage: null, unmappedReferences: null,
      });
      return { data: { equipmentId: input.equipmentId }, version: null };
    },
  }),
];
