import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KERNEL_PERMISSIONS, NO_FEATURES, contextCapabilities, groupId, type MenuMeta } from '@ap/contracts';
import { createMockAdapter, getRole, setRole, type AnyMockAction } from '@ap/mock-server';
import { EQV_READ_PERMISSION, LAYOUT_EDIT_PERMISSION, LAYOUT_PUBLISH_PERMISSION, STUDIO_VIEW_PERMISSION, layoutDraftEndpoint, layoutRevisionEndpoint, layoutRevisionsEndpoint, layoutsEndpoint, templateEndpoint, templatesEndpoint } from '../endpoints';
import { resetStudioMock, topviewStudioActionsMock, topviewStudioMock } from './index';
import { fakeRevision } from './hash';
import { FIXTURE_REVISION } from './store';

/** Mirrors the 'eqv-studio' manifest in '../index.ts' (importing it from `src/mock/**` is lint-banned); change both together. */
const menu: MenuMeta = {
  id: 'eqv-studio', group: groupId('topviewStudio'), label: { ko: '레이아웃', en: 'Layouts' }, description: { ko: '레이아웃', en: 'Layouts' },
  path: '/tools/eqv-studio', permission: STUDIO_VIEW_PERMISSION, requiresScope: false, context: contextCapabilities(), pageType: 'catalog', features: NO_FEATURES, pageKeys: ['layout', 'revision', 'template'],
};
const permissions = [...KERNEL_PERMISSIONS, STUDIO_VIEW_PERMISSION, EQV_READ_PERMISSION, LAYOUT_EDIT_PERMISSION, LAYOUT_PUBLISH_PERMISSION];
// The package's read list also carries the 설비 온보딩 reads (#1658), so their menu is registered too (onboarding.test.ts covers them).
const onboarding: MenuMeta = { ...menu, id: 'eqv-onboarding', path: '/tools/eqv-onboarding', pageType: 'management', pageKeys: ['equipment', 'step', 'window'] };
const adapter = createMockAdapter({ endpoints: [...topviewStudioMock], actions: [...topviewStudioActionsMock], registry: { menus: [menu, onboarding] }, permissions });

const previousRole = getRole();
beforeEach(() => { resetStudioMock(); setRole('engineer'); });
afterEach(() => { setRole(previousRole); });

const query = (endpoint: string, params: Record<string, unknown> = {}) => adapter.menuQuery({ endpoint, context: {}, params });
const act = (id: string, input: Record<string, unknown>, expectedVersion?: string) => adapter.menuAction({
  action: id, context: {}, input, idempotencyKey: crypto.randomUUID(), ...(expectedVersion === undefined ? {} : { expectedVersion }),
});
const action = (id: string): AnyMockAction => topviewStudioActionsMock.find((a) => a.spec.id === id)!;
const doc = async () => ((await query(layoutDraftEndpoint.id, { layoutId: 'sample-layout' })).data as { document: Record<string, unknown> }).document;

describe('studio mock reads', () => {
  it('registers every read and write against the menu', () => {
    expect(topviewStudioMock.filter((e) => e.spec.menuId === 'eqv-studio').map((e) => e.spec.id)).toEqual([layoutsEndpoint, layoutDraftEndpoint, layoutRevisionsEndpoint, layoutRevisionEndpoint, templatesEndpoint, templateEndpoint].map((s) => s.id));
    expect(topviewStudioActionsMock.map((a) => a.spec.id)).toEqual(['eqv.saveDraft', 'eqv.publishRevision', 'eqv.promoteTemplate']);
  });

  it('seeds one draft at version 1, the one Revision the Hub mock links, no Template', async () => {
    expect((await query(layoutsEndpoint.id)).data).toMatchObject({ rows: [{ layoutId: 'sample-layout', version: '1' }] });
    expect((await query(layoutRevisionsEndpoint.id, { layoutId: 'sample-layout' })).data).toEqual({ rows: [expect.objectContaining({ layoutId: 'sample-layout', revision: FIXTURE_REVISION })] });
    expect((await query(layoutRevisionEndpoint.id, { layoutId: 'sample-layout', revision: FIXTURE_REVISION })).data).toMatchObject({ document: { id: 'sample-layout' } });
    expect((await query(templatesEndpoint.id)).data).toEqual({ rows: [] });
  });

  it('answers empty for an unknown draft, Revision or Template and an error for a malformed id', async () => {
    expect((await query(layoutDraftEndpoint.id, { layoutId: 'nothing' })).outcome).toBe('empty');
    expect((await query(layoutRevisionEndpoint.id, { layoutId: 'sample-layout', revision: `sha256:${'a'.repeat(64)}` })).outcome).toBe('empty');
    expect((await query(templateEndpoint.id, { templateId: 'nothing' })).outcome).toBe('empty');
    expect((await query(layoutRevisionEndpoint.id, { layoutId: 'sample-layout', revision: 'abc' })).outcome).toBe('error');
    expect((await query(layoutDraftEndpoint.id, { layoutId: 'Bad Id' })).outcome).toBe('error');
  });

  it('refuses a viewer', async () => {
    setRole('viewer');
    expect((await query(layoutsEndpoint.id)).outcome).toBe('forbidden');
  });
});

describe('studio mock writes', () => {
  it('saveDraft: the version counts up, a stale version conflicts, a new Layout needs expectedVersion 0', async () => {
    const document = await doc();
    const first = await act('eqv.saveDraft', { layoutId: 'sample-layout', document: { ...document, name: 'Renamed' } }, '1');
    expect(first).toMatchObject({ outcome: 'ok', data: { layoutId: 'sample-layout', version: '2' } });
    expect((await act('eqv.saveDraft', { layoutId: 'sample-layout', document }, '1')).outcome).toBe('conflict');
    expect((await act('eqv.saveDraft', { layoutId: 'sample-layout', document }, '0')).outcome).toBe('conflict');
    const fresh = await act('eqv.saveDraft', { layoutId: 'other-layout', document: { ...document, id: 'other-layout' } }, '0');
    expect(fresh).toMatchObject({ outcome: 'ok', data: { version: '1' } });
    expect((await query(layoutsEndpoint.id)).data).toMatchObject({ rows: [{ layoutId: 'other-layout' }, { layoutId: 'sample-layout' }] });
  });

  it('saveDraft: invalid when document.id differs from layoutId', async () => {
    const result = await act('eqv.saveDraft', { layoutId: 'sample-layout', document: { ...(await doc()), id: 'another' } }, '1');
    expect(result).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['document', 'id'], code: 'id_mismatch' }] });
  });

  it('publishRevision: the untouched seeded draft is already published (created false, no new Revision)', async () => {
    const before = ((await query(layoutRevisionsEndpoint.id, { layoutId: 'sample-layout' })).data as { rows: unknown[] }).rows;
    const first = await act('eqv.publishRevision', { layoutId: 'sample-layout' }, '1');
    expect(first).toMatchObject({ outcome: 'ok', data: { revision: FIXTURE_REVISION, created: false } });
    expect(((await query(layoutRevisionsEndpoint.id, { layoutId: 'sample-layout' })).data as { rows: unknown[] }).rows).toHaveLength(before.length);
  });

  it('publishRevision: after an edit a fake sha256 hash, created false for the same document, not_found without a draft, conflict on a stale version', async () => {
    const edited = { ...(await doc()), name: 'Edited layout' };
    await act('eqv.saveDraft', { layoutId: 'sample-layout', document: edited }, '1');
    const first = await act('eqv.publishRevision', { layoutId: 'sample-layout' }, '2');
    expect(first).toMatchObject({ outcome: 'ok', data: { created: true } });
    const revision = (first.data as { revision: string }).revision;
    expect(revision).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(revision).toBe(fakeRevision(edited));
    expect(await act('eqv.publishRevision', { layoutId: 'sample-layout' }, '2')).toMatchObject({ outcome: 'ok', data: { revision, created: false } });
    expect((await query(layoutRevisionsEndpoint.id, { layoutId: 'sample-layout' })).data).toMatchObject({ rows: expect.arrayContaining([expect.objectContaining({ revision })]) });
    expect((await act('eqv.publishRevision', { layoutId: 'missing' }, '1')).outcome).toBe('not_found');
    expect((await act('eqv.publishRevision', { layoutId: 'sample-layout' }, '7')).outcome).toBe('conflict');
  });

  it('fakeRevision ignores key order', () => {
    expect(fakeRevision({ a: 1, b: { c: 2, d: 3 } })).toBe(fakeRevision({ b: { d: 3, c: 2 }, a: 1 }));
    expect(fakeRevision({ a: 1 })).not.toBe(fakeRevision({ a: 2 }));
  });

  it('promoteTemplate: from a published Revision only; duplicate and bundled ids are field errors', async () => {
    const published = await act('eqv.publishRevision', { layoutId: 'sample-layout' }, '1');
    const revision = (published.data as { revision: string }).revision;
    const input = { layoutId: 'sample-layout', revision, templateId: 'my-template', name: ' My template ' };
    expect((await act('eqv.promoteTemplate', { ...input, revision: `sha256:${'b'.repeat(64)}` })).fieldErrors).toEqual([{ path: ['revision'], code: 'not_found' }]);
    expect(await act('eqv.promoteTemplate', input)).toMatchObject({ outcome: 'ok', data: { templateId: 'my-template' } });
    expect((await act('eqv.promoteTemplate', input)).fieldErrors).toEqual([{ path: ['templateId'], code: 'duplicate' }]);
    expect((await act('eqv.promoteTemplate', { ...input, templateId: 'cluster-single' })).fieldErrors).toEqual([{ path: ['templateId'], code: 'bundled_template_id' }]);
    expect((await query(templateEndpoint.id, { templateId: 'my-template' })).data).toMatchObject({ name: 'My template', document: { kind: 'template', id: 'my-template' } });
  });

  it('versioned actions declare a version handler, the unversioned one does not need one', () => {
    expect(action('eqv.saveDraft').version).toBeTypeOf('function');
    expect(action('eqv.publishRevision').version).toBeTypeOf('function');
    expect(action('eqv.promoteTemplate').spec.concurrency).toBe('none');
  });
});
