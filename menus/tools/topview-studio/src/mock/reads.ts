/** The six Studio reads, answered like the server's `eqv` module: unknown ids answer `empty` (data null), a malformed id or hash is an error. */
import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';
import {
  REVISION_PATTERN, TEMPLATE_ID_PATTERN, layoutDraftEndpoint, layoutRevisionEndpoint, layoutRevisionsEndpoint, layoutsEndpoint, templateEndpoint, templatesEndpoint,
} from '../endpoints';
import { drafts, revisions, templates } from './store';

const byLayoutId = (a: { layoutId: string }, b: { layoutId: string }) => (a.layoutId < b.layoutId ? -1 : a.layoutId > b.layoutId ? 1 : 0);
const layoutIdMessage = (id: unknown): string | null => (typeof id === 'string' && TEMPLATE_ID_PATTERN.test(id) ? null : 'layoutId must be a layout id');

export const studioReadsMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(layoutsEndpoint, {
    mart: false,
    handle: () => ({ rows: [...drafts().values()].sort(byLayoutId).map(({ id, layoutId, version, updatedAt }) => ({ id, layoutId, version: String(version), updatedAt })) }),
  }),
  defineMockEndpoint(layoutDraftEndpoint, {
    mart: false,
    validate: ({ params }) => layoutIdMessage(params.layoutId),
    isEmpty: (data) => data === null,
    handle: ({ params }) => {
      const draft = drafts().get(params.layoutId);
      return draft ? { ...structuredClone(draft), version: String(draft.version) } : null;
    },
  }),
  defineMockEndpoint(layoutRevisionsEndpoint, {
    mart: false,
    validate: ({ params }) => layoutIdMessage(params.layoutId),
    handle: ({ params }) => ({
      rows: revisions().filter((r) => r.layoutId === params.layoutId).sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0))
        .map(({ id, layoutId, revision, publishedAt }) => ({ id, layoutId, revision, publishedAt })),
    }),
  }),
  defineMockEndpoint(layoutRevisionEndpoint, {
    mart: false,
    validate: ({ params }) => layoutIdMessage(params.layoutId) ?? (REVISION_PATTERN.test(params.revision) ? null : 'revision must be sha256:<64 hex>'),
    isEmpty: (data) => data === null,
    handle: ({ params }) => {
      const found = revisions().find((r) => r.layoutId === params.layoutId && r.revision === params.revision);
      return found ? structuredClone(found) : null;
    },
  }),
  defineMockEndpoint(templatesEndpoint, {
    mart: false,
    handle: () => ({ rows: templates().map(({ id, templateId, name, promotedFromLayoutId, promotedFromRevision, createdAt }) => ({ id, templateId, name, promotedFromLayoutId, promotedFromRevision, createdAt })).sort((a, b) => (a.templateId < b.templateId ? -1 : 1)) }),
  }),
  defineMockEndpoint(templateEndpoint, {
    mart: false,
    validate: ({ params }) => (TEMPLATE_ID_PATTERN.test(params.templateId) ? null : 'templateId must be a template id'),
    isEmpty: (data) => data === null,
    handle: ({ params }) => {
      const found = templates().find((t) => t.templateId === params.templateId);
      return found ? structuredClone(found) : null;
    },
  }),
];
