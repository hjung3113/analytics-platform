/** Every read of one equipment's onboarding, validated at the boundary with `@eqv/core` (the dev tool's `onboarding-data.ts`, over menu reads). */
import { useMemo, useState } from 'react';
import {
  latestBinding, mappingVersionSchema, observedInventorySchema, validateAliasRules, validateBindings, validateLayout, validateTypeDictionary,
  type AliasRulesFile, type BindingsFile, type EquipmentLayoutDocument, type MappingVersion, type ObservedInventory, type TemplateDocument, type TypeDictionaryFile,
} from '@eqv/core';
import type { RuleFiles } from '@eqv/editor';
import { useMenuQuery, type QueryState } from '@ap/kernel';
import {
  aliasRulesEndpoint, baselineInventoryEndpoint, bindingsEndpoint, bundledTemplatesEndpoint, equipmentScopesEndpoint, fleetEndpoint, layoutDraftEndpoint, layoutRevisionEndpoint,
  mappingVersionEndpoint, observedInventoryEndpoint, sampleWindowsEndpoint, typeDictionaryEndpoint, type SampleWindowRow,
} from '../../endpoints';
import { NO_REVISION, dataOf, settled } from '../../model/query';
import { windowHex } from '../../model/onboarding';

const NO_HEX = '0'.repeat(64);
/** A publish moves the latest Binding: its Mapping Version, Baseline and Revision reads change params, and the page keeps showing the last answer meanwhile (ADR-0114). */
const KEEP = { keepPrevious: true } as const;
type Issue = { path: readonly PropertyKey[]; message: string };
const problems = (issues: readonly Issue[]) => issues.map(({ path, message }) => `${path.map(String).join('.') || '(root)'}: ${message}`).join('; ');

export interface EquipmentData {
  /** Hub ids (`maker` = vendor id), as the rules and the server key scopes. */
  equipment: { equipmentId: string; maker: string; model: string };
  /** What people read: the Fleet's vendor and model names, the ids until the Fleet row is known; the registered name, null until then. */
  names: { maker: string; model: string; label: string | null };
  windows: readonly SampleWindowRow[];
  /** The window the page shows: `?window=` or the latest active one; null when there is none. */
  window: SampleWindowRow | null;
  inventory: ObservedInventory | null;
  dictionaries: TypeDictionaryFile[];
  ruleFiles: RuleFiles;
  /** Concurrency versions of the editable scopes (`'0'` while the scope has no file). */
  ruleVersions: { model: string; equipment: string };
  bindings: BindingsFile | null;
  bindingsVersion: string;
  previous: MappingVersion | null;
  baseline: ObservedInventory | null;
  layoutId: string;
  draft: { layout: EquipmentLayoutDocument; version: string } | null;
  /** The latest Binding's Layout (its pinned Revision, else the draft) for Drift; with `driftProblem` when it could not be read. */
  driftLayout: EquipmentLayoutDocument | null;
  driftProblem: string | null;
  templates: TemplateDocument[];
  /**
   * #2053: a publish was refused as `mapping/changed` (rules saved since the review). `reloadRules` marks it and reads the four alias rule
   * scopes again, so the review is recomputed from the new rules; the mark outlives that recompute (the dialog remounts with the new plan)
   * until `dismissRulesChanged`.
   */
  rulesChanged: boolean;
  reloadRules(): void;
  dismissRulesChanged(): void;
}

export type EquipmentLoad =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'unknown-window'; windows: readonly SampleWindowRow[] }
  | { kind: 'error'; message: string; retry(): void }
  | { kind: 'ok'; data: EquipmentData };

type Q = QueryState<unknown>;
const failed = (q: Q) => q.response !== null && !settled(q);

export function useEquipment(equipmentId: string, windowKey: string | null): EquipmentLoad {
  const scopeQ = useMenuQuery(equipmentScopesEndpoint, { equipmentId });
  const scope = dataOf(scopeQ);
  const vendorId = scope?.vendorId ?? '';
  const modelId = scope?.modelId ?? '';
  const known = scope !== null;
  const equipment = useMemo(() => ({ equipmentId, maker: vendorId, model: modelId }), [equipmentId, vendorId, modelId]);
  const windowsQ = useMenuQuery(sampleWindowsEndpoint, { equipmentId });
  const windows = dataOf(windowsQ)?.rows ?? null;
  const usable = windows?.filter((w) => w.state === 'active' || w.state === 'replaced' || w.state === 'staged') ?? [];
  const latestActive = [...usable].filter((w) => w.state === 'active').sort((a, b) => (a.from < b.from ? 1 : a.from > b.from ? -1 : 0))[0] ?? null;
  const window = windowKey === null ? latestActive : windows?.find((w) => windowHex(w.hash) === windowKey) ?? null;
  const inventoryQ = useMenuQuery(observedInventoryEndpoint, { equipmentId, windowHash: window ? windowHex(window.hash) : NO_HEX }, window !== null);

  const dictGlobalQ = useMenuQuery(typeDictionaryEndpoint, { level: 'global' }, known);
  const dictMakerQ = useMenuQuery(typeDictionaryEndpoint, { level: 'maker', vendorId }, known);
  const dictModelQ = useMenuQuery(typeDictionaryEndpoint, { level: 'model', vendorId, modelId }, known);
  // Every rules file publish applies (global, maker, model, equipment), so the browser dry-run equals what the server stores.
  const rulesGlobalQ = useMenuQuery(aliasRulesEndpoint, { level: 'global' }, known);
  const rulesMakerQ = useMenuQuery(aliasRulesEndpoint, { level: 'maker', vendorId }, known);
  const rulesModelQ = useMenuQuery(aliasRulesEndpoint, { level: 'model', vendorId, modelId }, known);
  const rulesEquipmentQ = useMenuQuery(aliasRulesEndpoint, { level: 'equipment', equipmentId }, known);
  const [rulesChanged, setRulesChanged] = useState(false);
  const bindingsQ = useMenuQuery(bindingsEndpoint, { equipmentId });
  const bindingsRaw = dataOf(bindingsQ);
  const bindingsParsed = useMemo(() => {
    if (!bindingsRaw) return null;
    const file = bindingsRaw.document;
    return Array.isArray(file.bindings) && file.bindings.length === 0 ? { ok: true as const, file: null } : validateBindings(file);
  }, [bindingsRaw]);
  const latest = bindingsParsed?.ok && bindingsParsed.file ? latestBinding(bindingsParsed.file.bindings) ?? null : null;
  const mappingQ = useMenuQuery(mappingVersionEndpoint, { equipmentId, hash: latest?.mappingHash ?? NO_REVISION }, latest !== null, KEEP);
  const baselineQ = useMenuQuery(baselineInventoryEndpoint, { equipmentId, mappingHash: latest?.mappingHash ?? NO_REVISION }, latest !== null, KEEP);
  const layoutId = latest?.layoutId ?? `${equipmentId}-layout`;
  const draftQ = useMenuQuery(layoutDraftEndpoint, { layoutId });
  const pinnedQ = useMenuQuery(layoutRevisionEndpoint, { layoutId, revision: latest?.layoutRevision ?? NO_REVISION }, latest?.layoutRevision !== undefined && latest !== null, KEEP);
  const templatesQ = useMenuQuery(bundledTemplatesEndpoint, {});
  // Names only; the page works with ids when the Fleet read fails.
  const fleetRow = dataOf(useMenuQuery(fleetEndpoint, {}))?.rows.find((row) => row.equipmentId === equipmentId) ?? null;
  const names = useMemo(() => ({ maker: fleetRow?.vendorName ?? vendorId, model: fleetRow?.modelName ?? modelId, label: fleetRow?.label || null }), [fleetRow?.vendorName, fleetRow?.modelName, fleetRow?.label, vendorId, modelId]);

  const scopeData = [dictGlobalQ, dictMakerQ, dictModelQ, rulesGlobalQ, rulesMakerQ, rulesModelQ, rulesEquipmentQ].map(dataOf);
  const inventoryRaw = dataOf(inventoryQ);
  const mappingRaw = dataOf(mappingQ);
  const baselineRaw = dataOf(baselineQ);
  const draftRaw = dataOf(draftQ);
  const pinnedRaw = dataOf(pinnedQ);
  const templatesRaw = dataOf(templatesQ);

  const parsed = useMemo(() => {
    try {
      const [dg, dmk, dmd, rgl, rmk, rmd, req] = scopeData;
      const dictionaries = [dg, dmk, dmd].flatMap((entry) => {
        if (!entry) return [];
        const result = validateTypeDictionary(entry.document);
        if (!result.ok) throw new Error(`Type Dictionary: ${problems(result.issues)}`);
        return [result.file];
      });
      const rules = (entry: typeof rmk): AliasRulesFile | undefined => {
        if (!entry) return undefined;
        const result = validateAliasRules(entry.document);
        if (!result.ok) throw new Error(`alias-rules: ${problems(result.issues)}`);
        return result.file;
      };
      const ruleFiles: RuleFiles = {};
      const global = rules(rgl); const maker = rules(rmk); const model = rules(rmd); const equipment = rules(req);
      if (global) ruleFiles.global = global;
      if (maker) ruleFiles.maker = maker;
      if (model) ruleFiles.model = model;
      if (equipment) ruleFiles.equipment = equipment;
      let inventory: ObservedInventory | null = null;
      if (inventoryRaw) {
        const result = observedInventorySchema.safeParse(inventoryRaw);
        if (!result.success) throw new Error(`Observed Inventory: ${problems(result.error.issues)}`);
        inventory = result.data;
      }
      let draft: EquipmentData['draft'] = null;
      if (draftRaw) {
        const result = validateLayout(draftRaw.document);
        if (!result.ok || result.layout.kind !== 'equipment-layout') throw new Error(`Layout 초안 ${layoutId}을(를) 읽을 수 없습니다`);
        draft = { layout: result.layout, version: draftRaw.version };
      }
      const templates = (templatesRaw?.rows ?? []).flatMap(({ document }) => {
        const result = validateLayout(document);
        return result.ok && result.layout.kind === 'template' ? [result.layout] : [];
      });
      // Drift inputs are optional context: a bad one leaves the load ok and Drift unknown with a reason (ONBOARDING §6).
      let previous: MappingVersion | null = null;
      let baseline: ObservedInventory | null = null;
      let driftLayout: EquipmentLayoutDocument | null = null;
      let driftProblem: string | null = null;
      if (mappingRaw) {
        const result = mappingVersionSchema.safeParse(mappingRaw.document);
        if (result.success) previous = result.data; else driftProblem = `Mapping Version: ${problems(result.error.issues)}`;
      }
      if (baselineRaw) {
        const result = observedInventorySchema.safeParse(baselineRaw.document);
        if (result.success) baseline = result.data; else driftProblem = `Baseline Inventory: ${problems(result.error.issues)}`;
      }
      const pinnedDoc = latest?.layoutRevision ? pinnedRaw?.document : draftRaw?.document;
      if (pinnedDoc) {
        const result = validateLayout(pinnedDoc);
        if (result.ok && result.layout.kind === 'equipment-layout') driftLayout = result.layout; else driftProblem = `Layout ${layoutId}을(를) 읽을 수 없습니다`;
      }
      return { ok: true as const, dictionaries, ruleFiles, inventory, draft, templates, previous, baseline, driftLayout, driftProblem };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `scopeData` is rebuilt every render from the seven query answers listed here
  }, [...scopeData, inventoryRaw, draftRaw, templatesRaw, mappingRaw, baselineRaw, pinnedRaw, latest, layoutId]);

  const required: Q[] = [scopeQ, windowsQ, bindingsQ, draftQ, templatesQ, dictGlobalQ, dictMakerQ, dictModelQ, rulesGlobalQ, rulesMakerQ, rulesModelQ, rulesEquipmentQ];
  if (window !== null) required.push(inventoryQ);
  if (latest !== null) required.push(mappingQ, baselineQ);
  const retry = () => { for (const q of required) if (failed(q)) q.refetch(); };
  if (scopeQ.response?.outcome === 'empty' || bindingsQ.response?.outcome === 'empty') return { kind: 'not-found' };
  const broken = required.find(failed);
  if (broken) return { kind: 'error', message: '설비 데이터를 불러오지 못했습니다.', retry };
  if (required.some((q) => q.response === null) || (known && windows === null)) return { kind: 'loading' };
  if (windowKey !== null && window === null) return { kind: 'unknown-window', windows: windows ?? [] };
  if (bindingsParsed && !bindingsParsed.ok) return { kind: 'error', message: `bindings: ${problems(bindingsParsed.issues)}`, retry };
  if (!parsed.ok) return { kind: 'error', message: parsed.message, retry };
  const version = (q: typeof rulesModelQ) => dataOf(q)?.version ?? '0';
  return {
    kind: 'ok',
    data: {
      equipment, names,
      windows: windows ?? [], window, inventory: parsed.inventory, dictionaries: parsed.dictionaries, ruleFiles: parsed.ruleFiles,
      ruleVersions: { model: version(rulesModelQ), equipment: version(rulesEquipmentQ) },
      bindings: bindingsParsed?.ok ? bindingsParsed.file : null, bindingsVersion: bindingsRaw?.version ?? '0',
      previous: parsed.previous, baseline: parsed.baseline, layoutId, draft: parsed.draft,
      driftLayout: parsed.driftLayout, driftProblem: parsed.driftProblem, templates: parsed.templates,
      rulesChanged,
      reloadRules: () => { setRulesChanged(true); for (const q of [rulesGlobalQ, rulesMakerQ, rulesModelQ, rulesEquipmentQ]) q.refetch(); },
      dismissRulesChanged: () => setRulesChanged(false),
    },
  };
}
