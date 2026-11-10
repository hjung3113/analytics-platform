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

/** Back to the seed: one draft (version 1) of the synthetic fixture, no Revision, no Template. */
export function resetStudioMock(): void {
  counter = 0;
  state.drafts = new Map();
  state.revisions = [];
  state.templates = [];
  const document = structuredClone(fixture) as LayoutJson;
  state.drafts.set(document.id, { id: mockId(), layoutId: document.id, version: 1, document, updatedAt: now() });
}
resetStudioMock();
