/**
 * Mock half of the model reads (#1197 s1): `logKnowledge.exploreModels` (the catalog `models` page plus the item count) and
 * `logKnowledge.modelProfile`, answered from the catalog store like the server (`item-endpoints.ts`, `getModelProfile`).
 * There is no item store in the mock yet, so every item count is 0 (the real counts are published items).
 */
import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';
import type { PageResult } from '@ap/contracts';
import { isUuid,
  exploreModelsEndpoint, modelProfileEndpoint, type CatalogPageParams, type ExploreModelRow, type ModelProfileData, type ModelProfileParams, type ModelRow,
} from '../endpoints';
import { all, byId, processIdsOf } from './store';

export const SOFTWARE_LIST_MAX = 500;
const NO_ITEMS = 0;

/** The profile of a model, or `null` for an unknown id (or an id of another kind). Every version is listed, newest `createdAt` first, cut at 500. */
export function modelProfile(modelId: string): ModelProfileData | null {
  const rec = byId(modelId);
  if (!rec || rec.kind !== 'model') return null;
  const vendor = byId(rec.parentId)!;
  const processes = processIdsOf(rec.id).map(id => byId(id)!).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const versions = all('software').filter(s => s.parentId === rec.id)
    .sort((a, b) => (a.createdAt === b.createdAt ? b.id.localeCompare(a.id) : a.createdAt < b.createdAt ? 1 : -1));
  return {
    model: {
      id: rec.id, code: rec.code, name: rec.name, active: rec.active,
      vendor: { id: vendor.id, code: vendor.code, name: vendor.name, active: vendor.active },
      processes: processes.map(p => ({ id: p.id, code: p.code, name: p.name })), createdAt: rec.createdAt, updatedAt: rec.updatedAt,
    },
    softwareVersions: versions.slice(0, SOFTWARE_LIST_MAX).map(s => ({ id: s.id, versionLabel: s.code, name: s.name, active: s.active, itemCount: NO_ITEMS, updatedAt: s.updatedAt })),
    truncated: versions.length > SOFTWARE_LIST_MAX,
    modelItems: { total: NO_ITEMS },
  };
}

/**
 * `models`' validation and page are the catalog mock's, passed in so this file does not import `index.ts` (which registers it).
 */
export function modelReadsMock(catalog: { message: (params: CatalogPageParams) => string | null; page: (params: CatalogPageParams) => PageResult<ModelRow> }): readonly AnyMockEndpoint[] {
  return [
    defineMockEndpoint(exploreModelsEndpoint, {
      mart: false,
      validate: ({ params }) => catalog.message(params),
      handle: ({ params }): PageResult<ExploreModelRow> => {
        const result = catalog.page(params);
        return { total: result.total, rows: result.rows.map(row => ({ ...row, modelItemCount: NO_ITEMS })) };
      },
    }),
    defineMockEndpoint(modelProfileEndpoint, {
      mart: false,
      validate: ({ params }) => (typeof (params as Partial<ModelProfileParams>).modelId === 'string' && isUuid(params.modelId) ? null : 'modelId must be a uuid string'),
      handle: ({ params }) => modelProfile(params.modelId),
    }),
  ];
}
