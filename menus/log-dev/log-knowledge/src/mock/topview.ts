/**
 * Mock server half of the model Top View pointer (#1656): `logKnowledge.modelTopView`, `topViewRevisionOptions`,
 * `linkTopView`, `unlinkTopView`, answered like the real server (`modules/log-knowledge/topview-endpoints.ts`,
 * `topview-actions.ts`): resolution = the row whose start SW has the greatest release order at or below the target's, else the
 * model default, else unlinked; the Revision document comes with the read. The one published Revision is a small hand-written
 * synthetic Layout (`topview-fixture.json`, no real equipment); a test in `@ap/menu-topview` proves it validates and that
 * `FIXTURE_REVISION` is its real hash (this folder may not import `@eqv/*`). Seed: Alpha 100 links the fixture as its model default,
 * Alpha 200 has nothing linked.
 */
import { defineMockAction, defineMockEndpoint, MockActionInvalid, type AnyMockAction, type AnyMockEndpoint } from '@ap/mock-server';
import type { FieldError } from '@ap/contracts';
import {
  CATALOG_MANAGE_PERMISSION, isUuid, linkTopView, modelTopViewEndpoint, topViewRevisionOptionsEndpoint, unlinkTopView,
  type ModelTopViewData, type TopViewLinkItem,
} from '../endpoints';
import fixture from './topview-fixture.json';
import { all, byId, releaseOrderOf } from './store';

export const FIXTURE_LAYOUT_ID = 'sample-layout';
export const FIXTURE_REVISION = 'sha256:0cd25afbcf9beeb516b7d6c65b16d12ba648c688c70c8c0b2db994170e1ec0f5';
const PUBLISHED_AT = '2026-10-05T00:00:00.000Z';

type Link = { id: string; modelId: string; fromSoftwareId: string | null; layoutId: string; revision: string; version: number };
let links: Link[] = [];
let sequence = 0;
const nextId = () => `00000009-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`;

export function resetTopView(): void {
  links = []; sequence = 0;
  const alpha = all('model').find(m => m.code === 'A-100');
  if (alpha) links.push({ id: nextId(), modelId: alpha.id, fromSoftwareId: null, layoutId: FIXTURE_LAYOUT_ID, revision: FIXTURE_REVISION, version: 1 });
}
resetTopView();

const softwareOf = (modelId: string) => all('software').filter(s => s.parentId === modelId);
const published = (layoutId: unknown, revision: unknown) => layoutId === FIXTURE_LAYOUT_ID && revision === FIXTURE_REVISION;
const rowOf = (modelId: string, from: string | null) => links.find(l => l.modelId === modelId && l.fromSoftwareId === from);
const lower = (v: unknown): string | null => (typeof v === 'string' ? v.toLowerCase() : null);

/** The concurrency token of a row, `<linkId>:<version>`: ids are never reused, so a token of an unlinked row cannot match a later row (as the server). */
const tokenOf = (l: Link): string => `${l.id}:${l.version}`;

function item(l: Link): TopViewLinkItem {
  const sw = l.fromSoftwareId ? byId(l.fromSoftwareId) : undefined;
  return { linkId: l.id, fromSoftwareId: l.fromSoftwareId, fromSoftwareVersion: sw ? sw.code : null, layoutId: l.layoutId, revision: l.revision, version: tokenOf(l) };
}

function read(params: { modelId: string; softwareId?: string }): ModelTopViewData | null {
  const model = byId(params.modelId);
  if (!model || model.kind !== 'model') return null;
  const software = softwareOf(model.id);
  let target = software.length > 0 ? software[software.length - 1]! : null;
  if (typeof params.softwareId === 'string') target = software.find(s => s.id === lower(params.softwareId)) ?? null;
  const mine = links.filter(l => l.modelId === model.id);
  const order = (l: Link) => (l.fromSoftwareId ? releaseOrderOf(byId(l.fromSoftwareId)!) : null);
  const targetOrder = target ? releaseOrderOf(target) : null;
  let hit: Link | null = null;
  for (const l of mine) {
    const o = order(l);
    if (o === null || targetOrder === null || o > targetOrder) continue;
    if (hit === null || o > (order(hit) as number)) hit = l;
  }
  hit ??= mine.find(l => l.fromSoftwareId === null) ?? null;
  const softwareOptions = software.map(s => ({ softwareId: s.id, version: s.code, releaseOrder: releaseOrderOf(s) })).sort((a, b) => a.releaseOrder - b.releaseOrder);
  const base = { target: target ? { softwareId: target.id, version: target.code } : null, links: mine.map(item), softwareOptions };
  if (!hit) return { ...base, resolved: null };
  if (!published(hit.layoutId, hit.revision)) return { ...base, resolved: null, resolvedError: 'revision_unavailable' };
  const sw = hit.fromSoftwareId ? byId(hit.fromSoftwareId) : undefined;
  return { ...base, resolved: { linkId: hit.id, fromSoftwareId: hit.fromSoftwareId, fromSoftwareVersion: sw ? sw.code : null, layoutId: hit.layoutId, revision: hit.revision, document: fixture, publishedAt: PUBLISHED_AT } };
}

export const topViewReadsMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(modelTopViewEndpoint, {
    mart: false,
    validate: ({ params }) => {
      if (!isUuid(String(params.modelId)) || (params.softwareId !== undefined && !isUuid(String(params.softwareId)))) return 'modelId and softwareId must be uuid strings';
      const model = byId(params.modelId);
      // An unknown model answers `ok` with null; a software version of another model is a refusal.
      return model && params.softwareId !== undefined && byId(params.softwareId)?.parentId !== model.id ? 'softwareId is not a software version of this model' : null;
    },
    handle: ({ params }) => read(params),
  }),
  defineMockEndpoint(topViewRevisionOptionsEndpoint, {
    mart: false,
    // The real server answers `forbidden` unless the actor holds the catalog right (Layout ids are invisible to readers).
    requires: CATALOG_MANAGE_PERMISSION,
    handle: () => ({ rows: [{ layoutId: FIXTURE_LAYOUT_ID, revision: FIXTURE_REVISION, publishedAt: PUBLISHED_AT }] }),
  }),
];

const err = (path: readonly string[], code: string): FieldError => ({ path, code });
const startErrors = (input: Record<string, unknown>): FieldError[] =>
  input.fromSoftwareId === null || (typeof input.fromSoftwareId === 'string' && isUuid(input.fromSoftwareId)) ? [] : [err(['fromSoftwareId'], 'invalid')];
const modelErrors = (input: Record<string, unknown>): FieldError[] => (typeof input.modelId === 'string' && isUuid(input.modelId) ? [] : [err(['modelId'], 'invalid')]);
const fromOf = (input: Record<string, unknown>) => lower(input.fromSoftwareId);

export const topViewActionsMock: readonly AnyMockAction[] = [
  defineMockAction(linkTopView, {
    version: ({ input }: { input: Record<string, unknown> }) => { const l = rowOf(lower(input.modelId) ?? '', fromOf(input)); return l ? tokenOf(l) : '0'; },
    validate: (input: Record<string, unknown>) => [
      ...modelErrors(input), ...startErrors(input),
      ...(typeof input.layoutId === 'string' && /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(input.layoutId) ? [] : [err(['layoutId'], 'invalid')]),
      ...(typeof input.revision === 'string' && /^sha256:[0-9a-f]{64}$/.test(input.revision) ? [] : [err(['revision'], 'invalid')]),
    ],
    handle: ({ input }: { input: Record<string, unknown> }) => {
      const modelId = lower(input.modelId) ?? '';
      const from = fromOf(input);
      if (byId(modelId)?.kind !== 'model') throw new MockActionInvalid([err(['modelId'], 'not_found')]);
      if (from !== null && byId(from)?.parentId !== modelId) throw new MockActionInvalid([err(['fromSoftwareId'], 'software_not_of_model')]);
      if (!published(input.layoutId, input.revision)) throw new MockActionInvalid([err(['revision'], 'revision_not_found')]);
      const existing = rowOf(modelId, from);
      if (existing) { existing.layoutId = String(input.layoutId); existing.revision = String(input.revision); existing.version += 1; }
      const row = existing ?? (links.push({ id: nextId(), modelId, fromSoftwareId: from, layoutId: String(input.layoutId), revision: String(input.revision), version: 1 }), links[links.length - 1]!);
      return { data: { linkId: row.id, version: tokenOf(row) }, version: tokenOf(row) };
    },
  }),
  defineMockAction(unlinkTopView, {
    version: ({ input }: { input: Record<string, unknown> }) => { const l = rowOf(lower(input.modelId) ?? '', fromOf(input)); return l ? tokenOf(l) : null; },
    validate: (input: Record<string, unknown>) => [...modelErrors(input), ...startErrors(input)],
    handle: ({ input }: { input: Record<string, unknown> }) => {
      const row = rowOf(lower(input.modelId) ?? '', fromOf(input));
      if (!row) throw new MockActionInvalid([err(['modelId'], 'not_found')]);
      links = links.filter(l => l !== row);
      return { data: { linkId: row.id }, version: tokenOf(row) };
    },
  }),
] as AnyMockAction[];
