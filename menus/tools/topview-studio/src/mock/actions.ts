/**
 * The three Studio writes, answered like the server's `eqv` module without `@eqv/core` (mock code may not import it): a draft's version
 * counts up from 1 and a stale `expectedVersion` is `conflict` (`'0'` creates the first draft); `invalid` when `document.id` differs from
 * `layoutId`; a Revision hash is a fake deterministic one of the key-sorted JSON, and publishing the same document again answers
 * `created: false`. The mock writes no audit row (the engine has no audit hook for actions).
 */
import { defineMockAction, MockActionInvalid, type AnyMockAction } from '@ap/mock-server';
import type { FieldError } from '@ap/contracts';
import { REVISION_PATTERN, TEMPLATE_ID_PATTERN, promoteTemplate, publishRevision, saveDraft, type LayoutJson } from '../endpoints';
import { fakeRevision } from './hash';
import { BUNDLED_TEMPLATE_IDS, drafts, mockId, revisions, stamp, templates } from './store';

const err = (path: string[], code: string): FieldError => ({ path, code });
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const studioActionsMock: readonly AnyMockAction[] = [
  defineMockAction(saveDraft, {
    validate: (input) => {
      if (typeof input.layoutId !== 'string' || !TEMPLATE_ID_PATTERN.test(input.layoutId)) return [err(['layoutId'], 'invalid')];
      if (!isObject(input.document)) return [err(['document'], 'invalid')];
      if (input.document.kind !== 'equipment-layout') return [err(['document', 'kind'], 'kind_not_equipment_layout')];
      if (input.document.id !== input.layoutId) return [err(['document', 'id'], 'id_mismatch')];
      return [];
    },
    version: ({ input }) => { const draft = drafts().get(input.layoutId); return draft ? String(draft.version) : '0'; },
    handle: ({ input }) => {
      const existing = drafts().get(input.layoutId);
      const document = structuredClone(input.document) as LayoutJson;
      if (existing) {
        existing.document = document; existing.version += 1; existing.updatedAt = stamp();
        return { data: { id: existing.id, layoutId: existing.layoutId, version: String(existing.version) }, version: String(existing.version) };
      }
      const created = { id: mockId(), layoutId: input.layoutId, version: 1, document, updatedAt: stamp() };
      drafts().set(created.layoutId, created);
      return { data: { id: created.id, layoutId: created.layoutId, version: '1' }, version: '1' };
    },
  }),
  defineMockAction(publishRevision, {
    validate: (input) => (typeof input.layoutId === 'string' && TEMPLATE_ID_PATTERN.test(input.layoutId) ? [] : [err(['layoutId'], 'invalid')]),
    version: ({ input }) => { const draft = drafts().get(input.layoutId); return draft ? String(draft.version) : null; },
    handle: ({ input }) => {
      const draft = drafts().get(input.layoutId)!;
      const revision = fakeRevision(draft.document);
      const version = String(draft.version);
      const existing = revisions().find((r) => r.layoutId === input.layoutId && r.revision === revision);
      if (existing) return { data: { id: existing.id, layoutId: input.layoutId, revision, created: false }, version };
      const created = { id: mockId(), layoutId: input.layoutId, revision, document: structuredClone(draft.document), publishedAt: stamp() };
      revisions().push(created);
      return { data: { id: created.id, layoutId: input.layoutId, revision, created: true }, version };
    },
  }),
  defineMockAction(promoteTemplate, {
    validate: (input) => {
      const errors: FieldError[] = [];
      if (typeof input.layoutId !== 'string' || !TEMPLATE_ID_PATTERN.test(input.layoutId)) errors.push(err(['layoutId'], 'invalid'));
      if (typeof input.revision !== 'string' || !REVISION_PATTERN.test(input.revision)) errors.push(err(['revision'], 'invalid'));
      if (typeof input.templateId !== 'string' || !TEMPLATE_ID_PATTERN.test(input.templateId)) errors.push(err(['templateId'], 'invalid'));
      else if (BUNDLED_TEMPLATE_IDS.includes(input.templateId)) errors.push(err(['templateId'], 'bundled_template_id'));
      if (typeof input.name !== 'string' || input.name.trim() === '' || input.name.length > 200) errors.push(err(['name'], 'invalid'));
      return errors;
    },
    handle: ({ input }) => {
      const source = revisions().find((r) => r.layoutId === input.layoutId && r.revision === input.revision);
      if (!source) throw new MockActionInvalid([err(['revision'], 'not_found')]);
      if (templates().some((t) => t.templateId === input.templateId)) throw new MockActionInvalid([err(['templateId'], 'duplicate')]);
      const components = Array.isArray(source.document.components) ? source.document.components as { role: string }[] : [];
      const roleCardinality: Record<string, { min: number; max: number }> = {};
      for (const { role } of components) roleCardinality[role] = { min: (roleCardinality[role]?.min ?? 0) + 1, max: (roleCardinality[role]?.max ?? 0) + 1 };
      const { templateId: _unused, ...rest } = source.document;
      const document = { ...rest, kind: 'template', id: input.templateId, name: input.name.trim(), roleCardinality, promotedFrom: { layoutId: input.layoutId, layoutRevision: input.revision } } as LayoutJson;
      const created = { id: mockId(), templateId: input.templateId, name: input.name.trim(), promotedFromLayoutId: input.layoutId, promotedFromRevision: input.revision, document, createdAt: stamp() };
      templates().push(created);
      return { data: { id: created.id, templateId: created.templateId }, version: null };
    },
  }),
];
