/** The 설비 온보딩 reads (#1658), answered like the server: a scope or id with no file answers `empty` (data null); a malformed id is an error. */
import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';
import {
  EQUIPMENT_ID_PATTERN, REVISION_PATTERN, WINDOW_HEX_PATTERN, aliasRulesEndpoint, baselineInventoryEndpoint, bindingsEndpoint, bundledTemplatesEndpoint,
  equipmentScopesEndpoint, fleetEndpoint, mappingVersionEndpoint, mappingVersionsEndpoint, observedInventoryEndpoint, sampleWindowsEndpoint, typeDictionaryEndpoint,
  type FleetRowDto, type ScopeLevel,
} from '../endpoints';
import { bundledTemplates, equipmentById, hexOf, onboarding, scopeKey } from './onboarding-store';

const LEVELS: readonly ScopeLevel[] = ['global', 'maker', 'model', 'equipment'];
const equipmentMessage = (id: unknown): string | null => (typeof id === 'string' && EQUIPMENT_ID_PATTERN.test(id) ? null : 'equipmentId must be an equipment id');
const scopeMessage = (params: { level: ScopeLevel; vendorId?: string; modelId?: string; equipmentId?: string }): string | null =>
  !LEVELS.includes(params.level) ? 'level must be global, maker, model or equipment' : scopeKey(params) === null ? `level ${params.level} needs its ids` : null;
const versioned = (entry: { document: Record<string, unknown>; version: number } | undefined) => (entry ? { document: structuredClone(entry.document), version: String(entry.version) } : null);

export const onboardingReadsMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(aliasRulesEndpoint, {
    mart: false,
    validate: ({ params }) => scopeMessage(params),
    isEmpty: (data) => data === null,
    handle: ({ params }) => versioned(onboarding().rules.get(scopeKey(params)!)),
  }),
  defineMockEndpoint(typeDictionaryEndpoint, {
    mart: false,
    validate: ({ params }) => (params.level === 'equipment' ? 'a Type Dictionary has no equipment level' : scopeMessage(params)),
    isEmpty: (data) => data === null,
    handle: ({ params }) => versioned(onboarding().dictionaries.get(scopeKey(params)!)),
  }),
  defineMockEndpoint(equipmentScopesEndpoint, {
    mart: false,
    validate: ({ params }) => equipmentMessage(params.equipmentId),
    isEmpty: (data) => data === null,
    handle: ({ params }) => {
      const found = equipmentById(params.equipmentId);
      return found ? { equipmentId: found.equipmentId, vendorId: found.vendorId, modelId: found.modelId } : null;
    },
  }),
  defineMockEndpoint(mappingVersionsEndpoint, {
    mart: false,
    validate: ({ params }) => equipmentMessage(params.equipmentId),
    handle: ({ params }) => ({
      rows: [...(onboarding().mappings.get(params.equipmentId)?.values() ?? [])]
        .map(({ document, layoutRevision, publishedAt }) => ({ hash: document.hash, layoutId: document.layoutId, layoutRevision, entryCount: document.entries.length, publishedAt }))
        .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0)),
    }),
  }),
  defineMockEndpoint(mappingVersionEndpoint, {
    mart: false,
    validate: ({ params }) => equipmentMessage(params.equipmentId) ?? (REVISION_PATTERN.test(params.hash) ? null : 'hash must be sha256:<64 hex>'),
    isEmpty: (data) => data === null,
    handle: ({ params }) => {
      const found = onboarding().mappings.get(params.equipmentId)?.get(params.hash);
      return found ? structuredClone(found.document) : null;
    },
  }),
  defineMockEndpoint(bindingsEndpoint, {
    mart: false,
    validate: ({ params }) => equipmentMessage(params.equipmentId),
    handle: ({ params }) => {
      const bindings = onboarding().bindings.get(params.equipmentId) ?? [];
      return { schemaVersion: '0.4', equipmentId: params.equipmentId, bindings: structuredClone(bindings), version: String(bindings.length) };
    },
  }),
  defineMockEndpoint(baselineInventoryEndpoint, {
    mart: false,
    validate: ({ params }) => equipmentMessage(params.equipmentId) ?? (REVISION_PATTERN.test(params.mappingHash) ? null : 'mappingHash must be sha256:<64 hex>'),
    isEmpty: (data) => data === null,
    handle: ({ params }) => {
      const found = onboarding().baselines.get(`${params.equipmentId}/${params.mappingHash}`);
      return found ? structuredClone(found) : null;
    },
  }),
  defineMockEndpoint(fleetEndpoint, {
    mart: false,
    handle: () => ({
      rows: onboarding().equipment.map(({ status, coverage, unmappedReferences, ...identity }): FleetRowDto => {
        const latest = [...(onboarding().windows.get(identity.equipmentId) ?? [])].filter((w) => w.state === 'active').sort((a, b) => (a.from < b.from ? 1 : -1))[0];
        return { ...identity, status, coverage, unmappedReferences, latestWindow: latest ? { hash: latest.hash, from: latest.from, to: latest.to } : null };
      }),
    }),
  }),
  defineMockEndpoint(sampleWindowsEndpoint, {
    mart: false,
    validate: ({ params }) => equipmentMessage(params.equipmentId),
    handle: ({ params }) => ({ rows: structuredClone(onboarding().windows.get(params.equipmentId) ?? []) }),
  }),
  defineMockEndpoint(observedInventoryEndpoint, {
    mart: false,
    validate: ({ params }) => equipmentMessage(params.equipmentId) ?? (WINDOW_HEX_PATTERN.test(params.windowHash) ? null : 'windowHash must be 64 hex digits'),
    isEmpty: (data) => data === null,
    handle: ({ params }) => {
      const listed = onboarding().windows.get(params.equipmentId)?.some((w) => hexOf(w.hash) === params.windowHash);
      const found = listed ? onboarding().inventories.get(params.windowHash) : undefined;
      return found ? structuredClone(found) : null;
    },
  }),
  defineMockEndpoint(bundledTemplatesEndpoint, {
    mart: false,
    handle: () => ({ rows: structuredClone(bundledTemplates()) }),
  }),
];
