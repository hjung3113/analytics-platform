import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLayout, type LayoutDocument } from '@eqv/core';
import type { LayoutJson, RevisionRead, RevisionRow } from '../endpoints';
import { layoutChanges, isUnchanged } from './layout-changes';
import { draftStatus, publishBaseline, sameDocument, shortHash } from './status';

const doc = JSON.parse(readFileSync(join(process.cwd(), 'src/mock/layout-fixture.json'), 'utf8')) as LayoutJson;
const layout = (patch: Record<string, unknown> = {}): LayoutDocument => { const r = validateLayout({ ...doc, ...patch }); if (!r.ok) throw new Error('fixture'); return r.layout; };
const row = (n: number): RevisionRow => ({ id: `r${n}`, layoutId: 'sample-layout', revision: `sha256:${String(n).repeat(64)}`, publishedAt: '2026-11-10T00:00:00.000Z' });
const read = (n: number, document: LayoutJson): RevisionRead => ({ ...row(n), document });

describe('draftStatus', () => {
  it.each<[string, Parameters<typeof draftStatus>[0], string | null]>([
    ['dirty wins, even before any read', { dirty: true, savedDraft: doc, revisions: null, latest: null }, '저장 안 됨'],
    ['nothing before the Revision list resolved', { dirty: false, savedDraft: doc, revisions: null, latest: null }, null],
    ['draft with no Revisions', { dirty: false, savedDraft: doc, revisions: [], latest: null }, '초안'],
    ['nothing before the latest Revision resolved', { dirty: false, savedDraft: doc, revisions: [row(1)], latest: null }, null],
    ['published when the saved draft equals the latest Revision', { dirty: false, savedDraft: doc, revisions: [row(1)], latest: read(1, doc) }, '게시됨'],
    ['published regardless of key order', { dirty: false, savedDraft: doc, revisions: [row(1)], latest: read(1, Object.fromEntries(Object.entries(doc).reverse()) as LayoutJson) }, '게시됨'],
    ['changed after publish', { dirty: false, savedDraft: { ...doc, name: 'Other' }, revisions: [row(1)], latest: read(1, doc) }, '게시 후 변경됨'],
  ])('%s', (_name, input, expected) => {
    expect(draftStatus(input)).toBe(expected);
  });

  it('sameDocument ignores key order and undefined values only', () => {
    expect(sameDocument({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe(true);
    expect(sameDocument({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe('publishBaseline', () => {
  const draft = layout({ name: 'Draft' });
  const old = layout({ name: 'Old' });
  it('first with no Revision', () => expect(publishBaseline({ draft, revisions: [], latest: null })).toEqual({ kind: 'first', skipped: [] }));
  it('identical when the draft equals the latest Revision', () => expect(publishBaseline({ draft, revisions: [row(1)], latest: { revision: row(1).revision, document: draft } })).toEqual({ kind: 'identical', revision: row(1).revision }));
  it('compared against the only Revision, never pinned, nothing skipped', () => {
    const result = publishBaseline({ draft, revisions: [row(1)], latest: { revision: row(1).revision, document: old } });
    expect(result).toMatchObject({ kind: 'compared', pinned: false, skipped: [], revision: row(1).revision });
    expect(result.kind === 'compared' && result.changes.header).toEqual(['name']);
  });
  it('unpinned with two or more Revisions (no Binding endpoint until step 8)', () => {
    expect(publishBaseline({ draft, revisions: [row(2), row(1)], latest: { revision: row(2).revision, document: old } })).toEqual({ kind: 'unpinned', count: 2, skipped: [] });
  });
});

describe('layoutChanges', () => {
  it('reports added, removed and changed ids per collection and changed header fields', () => {
    const before = layout();
    const moved = structuredClone(before);
    moved.components[0]!.transform.x += 1;
    const removed = { ...moved, components: moved.components.filter(c => c.id !== 'proc-a'), physicalInterfaces: [], transferCapabilities: [], processRoutes: [] };
    const changes = layoutChanges(before, removed);
    expect(changes.collections.components).toEqual({ added: [], removed: ['proc-a'], changed: ['lp-a'] });
    expect(changes.collections.physicalInterfaces.removed).toHaveLength(2);
    expect(isUnchanged(layoutChanges(before, before))).toBe(true);
  });
  it('shortHash drops the prefix and keeps 12 digits', () => expect(shortHash(`sha256:${'ab'.repeat(32)}`)).toBe('abababababab'));
});
