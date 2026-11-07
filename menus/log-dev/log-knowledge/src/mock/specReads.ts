import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';
import { isUuid, modelSpecEndpoint, modelSpecRevisionsEndpoint, specChangesEndpoint, specDraftEndpoint, type ModelSpecData, type SpecChangesParams, type SpecDraftData } from '../endpoints';
import { all, byId, releaseOrderOf } from './store';
import { latestSpec, revisionById, specChanges, specRevisions, type Change } from './specStore';
import { project } from './specProjection';
const uuid = (value: unknown) => typeof value === 'string' && isUuid(value);
export const applies = (c: Change, softwareId: string): boolean => {
  const sw = byId(softwareId), start = byId(c.softwareId), end = c.endsBeforeSoftwareId ? byId(c.endsBeforeSoftwareId) : null;
  return !!sw && !!start && sw.parentId === c.modelId && releaseOrderOf(start) <= releaseOrderOf(sw) && (!end || releaseOrderOf(sw) < releaseOrderOf(end));
};
const pageError = (p: { page?: number; pageSize?: number }) => p.page !== undefined && (!Number.isInteger(p.page) || p.page < 0) ? 'invalid page' : p.pageSize !== undefined && (!Number.isInteger(p.pageSize) || p.pageSize < 1 || p.pageSize > 200) ? 'invalid pageSize' : null;
export const specReadsMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(modelSpecEndpoint, { mart: false, validate: ({ params: p }) => !uuid(p.modelId) || (p.softwareId !== undefined && !uuid(p.softwareId)) ? 'invalid uuid' : null,
    handle: ({ params: p }) => {
      const base = latestSpec(p.modelId);
      if (!base || p.softwareId && !all('software').some(s => s.id === p.softwareId?.toLowerCase() && s.parentId === p.modelId.toLowerCase())) return null;
      const r = base.revision;
      const revision: ModelSpecData['revision'] = { id: r.id, modelId: r.modelId, revisionNo: r.revisionNo, state: 'published', schemaVersion: r.schemaVersion, sourceDocRef: structuredClone(r.sourceDocRef), contentSha256: r.contentSha256!, publishedBy: r.publishedBy!, publishedAt: r.publishedAt! };
      const plain = { revision, modules: structuredClone(base.modules), events: structuredClone(base.events), relations: structuredClone(base.relations) };
      if (!p.softwareId) return plain;
      const changes = specChanges().filter(c => !c.retiredAt && c.modelId === p.modelId.toLowerCase() && applies(c, p.softwareId!))
        .sort((a, b) => releaseOrderOf(byId(a.softwareId)!) - releaseOrderOf(byId(b.softwareId)!) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      return changes.length ? { revision, effective: true as const, softwareId: p.softwareId.toLowerCase(), ...project(base, changes) } : { ...plain, effective: false as const };
    } }),
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
];
