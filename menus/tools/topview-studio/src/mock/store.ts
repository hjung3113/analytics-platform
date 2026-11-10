/** In-memory state of the Studio mock: Layout drafts, immutable Revisions and Templates. Reset by tests; the app keeps it for the page's life. */
import type { LayoutJson } from '../endpoints';
import fixture from './layout-fixture.json';

export type DraftRec = { id: string; layoutId: string; version: number; document: LayoutJson; updatedAt: string };
export type RevisionRec = { id: string; layoutId: string; revision: string; document: LayoutJson; publishedAt: string };
export type TemplateRec = { id: string; templateId: string; name: string; promotedFromLayoutId: string; promotedFromRevision: string; document: LayoutJson; createdAt: string };

/** Template ids the real server bundles; promoting to one is refused. */
export const BUNDLED_TEMPLATE_IDS = ['cluster-single'];

let counter = 0;
export const mockId = (): string => `00000000-0000-4000-8000-${(++counter).toString(16).padStart(12, '0')}`;
const now = (): string => new Date().toISOString();

const state: { drafts: Map<string, DraftRec>; revisions: RevisionRec[]; templates: TemplateRec[] } = { drafts: new Map(), revisions: [], templates: [] };

export const drafts = () => state.drafts;
export const revisions = () => state.revisions;
export const templates = () => state.templates;
export const stamp = now;

/**
 * The real `layoutRevision` hash of `layout-fixture.json` (the server's hash, not `fakeRevision`'s), so the Revision the Hub's mock links
 * (`menus/log-dev/log-knowledge/src/mock/topview.ts`, the same document) exists here and `Studio에서 열기` opens the same drawing.
 * `src/layout-fixture.test.ts` proves the constant with `@eqv/core` (mock code may not import it).
 */
export const FIXTURE_REVISION = 'sha256:0cd25afbcf9beeb516b7d6c65b16d12ba648c688c70c8c0b2db994170e1ec0f5';
const FIXTURE_PUBLISHED_AT = '2026-10-05T00:00:00.000Z';

/** Back to the seed: one draft (version 1) of the synthetic fixture, one published Revision of it (the Hub mock's link target), no Template. */
export function resetStudioMock(): void {
  counter = 0;
  state.drafts = new Map();
  state.revisions = [];
  state.templates = [];
  const document = structuredClone(fixture) as LayoutJson;
  state.drafts.set(document.id, { id: mockId(), layoutId: document.id, version: 1, document, updatedAt: now() });
  state.revisions.push({ id: mockId(), layoutId: document.id, revision: FIXTURE_REVISION, document: structuredClone(document), publishedAt: FIXTURE_PUBLISHED_AT });
}
resetStudioMock();
