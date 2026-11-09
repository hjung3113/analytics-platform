import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';
import { isUuid, modelSpecEndpoint, modelSpecRevisionsEndpoint, specChangesEndpoint, specCoverageEndpoint, specDraftEndpoint, type ModelSpecData, type ModelSpecEffective, type ModelSpecParams, type ModelSpecUnchanged, type SpecChangesParams, type SpecCoverageData, type SpecDraftData } from '../endpoints';
import { all, byId, releaseOrderOf } from './store';
import { latestSpec, revisionById, specChanges, specRevisions, type Change } from './specStore';
import { project } from './specProjection';
const uuid = (value: unknown) => typeof value === 'string' && isUuid(value);
export const applies = (c: Change, softwareId: string): boolean => {
  const sw = byId(softwareId), start = byId(c.softwareId), end = c.endsBeforeSoftwareId ? byId(c.endsBeforeSoftwareId) : null;
  return !!sw && !!start && sw.parentId === c.modelId && releaseOrderOf(start) <= releaseOrderOf(sw) && (!end || releaseOrderOf(sw) < releaseOrderOf(end));
};
const pageError = (p: { page?: number; pageSize?: number }) => p.page !== undefined && (!Number.isInteger(p.page) || p.page < 0) ? 'invalid page' : p.pageSize !== undefined && (!Number.isInteger(p.pageSize) || p.pageSize < 1 || p.pageSize > 200) ? 'invalid pageSize' : null;
const RULES_MOCK_COVERAGE: Record<string, SpecCoverageData> = {
  '00000003-0000-4000-8000-000000000008': { computable: true, counts: { no_rule: 1, unsupported: 1, unknown: 1, partial: 1, covered: 1, total: 5 }, coverageDigest: 'f'.repeat(64) },
  '00000003-0000-4000-8000-000000000009': { computable: false, reason: 'no_spec' },
  '00000003-0000-4000-8000-00000000000a': { computable: false, reason: 'no_requirement_ids' },
  '00000003-0000-4000-8000-00000000000b': { computable: true, counts: { no_rule: 0, unsupported: 0, unknown: 0, partial: 0, covered: 3, total: 3 }, coverageDigest: 'f'.repeat(64) },
};
/** Shared with the Item relation mock: SW keys must resolve against the same effective specification as its picker. */
export function readModelSpec(p: ModelSpecParams): ModelSpecData | ModelSpecEffective | ModelSpecUnchanged | null {
      const base = latestSpec(p.modelId);
      if (!base || p.softwareId && !all('software').some(s => s.id === p.softwareId?.toLowerCase() && s.parentId === p.modelId.toLowerCase())) return null;
      const r = base.revision;
      const revision: ModelSpecData['revision'] = { id: r.id, modelId: r.modelId, revisionNo: r.revisionNo, state: 'published', schemaVersion: r.schemaVersion, sourceDocRef: structuredClone(r.sourceDocRef), contentSha256: r.contentSha256!, publishedBy: r.publishedBy!, publishedAt: r.publishedAt! };
      const plain = { revision, modules: structuredClone(base.modules), events: structuredClone(base.events), relations: structuredClone(base.relations) };
      if (!p.softwareId) return plain;
      const changes = specChanges().filter(c => !c.retiredAt && c.modelId === p.modelId.toLowerCase() && applies(c, p.softwareId!))
        .sort((a, b) => releaseOrderOf(byId(a.softwareId)!) - releaseOrderOf(byId(b.softwareId)!) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      return changes.length ? { revision, effective: true as const, softwareId: p.softwareId.toLowerCase(), ...project(base, changes) } : { ...plain, effective: false as const };
}
export const specReadsMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(modelSpecEndpoint, { mart: false, validate: ({ params: p }) => !uuid(p.modelId) || (p.softwareId !== undefined && !uuid(p.softwareId)) ? 'invalid uuid' : null,
    handle: ({ params }) => readModelSpec(params) }),
  defineMockEndpoint(modelSpecRevisionsEndpoint, { mart: false, validate: ({ params: p }) => !uuid(p.modelId) ? 'invalid modelId' : pageError(p), handle: ({ params: p }) => {
    const rows = specRevisions().filter(r => r.revision.modelId === p.modelId.toLowerCase()).sort((a, b) => b.revision.revisionNo - a.revision.revisionNo)
      .map(r => ({ id: r.revision.id, revisionNo: r.revision.revisionNo, state: r.revision.state, publishedAt: r.revision.publishedAt, publishedBy: r.revision.publishedBy, contentSha256: r.revision.contentSha256, eventCount: r.events.length, version: r.revision.version }));
    const size = p.pageSize ?? 50, page = p.page ?? 0; return { rows: rows.slice(page * size, (page + 1) * size), total: rows.length };
  } }),
  defineMockEndpoint(specDraftEndpoint, { mart: false, validate: ({ params }) => uuid(params.revisionId) ? null : 'invalid revisionId', handle: ({ params }) => {
    const r = revisionById(params.revisionId);
    return r?.revision.state === 'draft' ? structuredClone(r) as SpecDraftData : null;
  } }),
  defineMockEndpoint(specChangesEndpoint, { mart: false, validate: ({ params: p }) => !uuid(p.modelId) || p.softwareId !== undefined && !uuid(p.softwareId) ? 'invalid uuid' : p.needsRevalidation !== undefined && typeof p.needsRevalidation !== 'boolean' ? 'invalid needsRevalidation' : p.status !== undefined && !['open', 'retired', 'all'].includes(p.status) ? 'invalid status' : pageError(p),
    handle: ({ params: p }: { params: SpecChangesParams }) => {
      const rows = specChanges().filter(c => c.modelId === p.modelId.toLowerCase() && (p.status === 'all' || (p.status === 'retired' ? !!c.retiredAt : !c.retiredAt)) && (p.needsRevalidation === undefined || c.needsRevalidation === p.needsRevalidation) && (!p.softwareId || applies(c, p.softwareId)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
      const size = p.pageSize ?? 50, page = p.page ?? 0; return { rows: structuredClone(rows.slice(page * size, (page + 1) * size)), total: rows.length };
    } }),
  // Synthetic: the catalog is not modelled here. The four ids below mirror the validation rules menu's mock fixtures
  // (log-rules `fixtureCoverage`, same ids and counts; menus may not import each other), so a badge and the coverage tab it links to agree.
  // Any other model reads «all requirements without a rule but the first».
  defineMockEndpoint(specCoverageEndpoint, { mart: false, validate: ({ params: p }) => !uuid(p.modelId) || (p.softwareId !== undefined && !uuid(p.softwareId)) ? 'invalid uuid' : null,
    handle: ({ params: p }) => {
      if (!all('model').some(m => m.id === p.modelId.toLowerCase())) return null;
      const mirrored = RULES_MOCK_COVERAGE[p.modelId.toLowerCase()];
      if (mirrored) return structuredClone(mirrored);
      const base = latestSpec(p.modelId);
      if (!base) return { computable: false as const, reason: 'no_spec' as const };
      const total = base.modules.length + base.events.length;
      if (total === 0) return { computable: false as const, reason: 'no_requirement_ids' as const };
      return { computable: true as const, counts: { no_rule: total - 1, unsupported: 0, unknown: 0, partial: 0, covered: 1, total }, coverageDigest: 'f'.repeat(64) };
    } }),
];
