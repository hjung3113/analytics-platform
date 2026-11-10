import { beforeEach, describe, expect, it } from 'vitest';
import { KERNEL_PERMISSIONS, emptyGlobal, groupId, type MenuMeta } from '@ap/contracts';
import { createMockAdapter, setRole } from '@ap/mock-server';
import { CATALOG_MANAGE_PERMISSION, LOG_KNOWLEDGE_MODELS_MENU_ID, SPEC_PUBLISH_PERMISSION } from '../endpoints';
import { logKnowledgeActionsMock, logKnowledgeMock, resetCatalog } from './index';
import { FIXTURE_LAYOUT_ID, FIXTURE_REVISION, resetTopView } from './topview';
import { all } from './store';

type TopViewAnswer = { resolved: { fromSoftwareId: string | null; document: unknown; layoutId: string; revision: string } | null; links: unknown[] };
const read = (id: string, params: unknown) => logKnowledgeMock.find(e => e.spec.id === `logKnowledge.${id}`)!;
const modelId = (code: string) => all('model').find(m => m.code === code)!.id;
const view = (params: Record<string, unknown>) => read('modelTopView', params).handle({ equipment: [], context: emptyGlobal, params, actor: 'admin' }) as TopViewAnswer | null;
const action = (id: string) => logKnowledgeActionsMock.find(a => a.spec.id === `logKnowledge.${id}`)!;
const swOf = (code: string, label: string) => all('software').find(s => s.parentId === modelId(code) && s.code === label)!.id;

beforeEach(() => { resetCatalog(); resetTopView(); });

describe('logKnowledge.modelTopView (mock)', () => {
  it('Alpha 100 resolves its model default with the document; Alpha 200 is unlinked', () => {
    const a = view({ modelId: modelId('A-100') });
    expect(a?.resolved).toMatchObject({ layoutId: FIXTURE_LAYOUT_ID, revision: FIXTURE_REVISION, fromSoftwareId: null });
    expect(a?.resolved?.document).toMatchObject({ kind: 'equipment-layout' });
    expect(a?.links).toHaveLength(1);
    expect(view({ modelId: modelId('A-200') })).toMatchObject({ resolved: null, links: [] });
  });
  it('an unknown model answers null and a software version of another model is refused', () => {
    expect(view({ modelId: '00000003-0000-4000-8000-0000000000ff' })).toBeNull();
    const e = read('modelTopView', {});
    expect(e.validate?.({ context: emptyGlobal, params: { modelId: modelId('A-100'), softwareId: swOf('A-200', 'v1.0') } })).toBeTypeOf('string');
  });
});

describe('link and unlink (mock)', () => {
  it('links a SW row with version 0, replaces it by its version, and the SW row wins from its release order on', () => {
    const input = { modelId: modelId('A-100'), fromSoftwareId: swOf('A-100', 'v2.0'), layoutId: FIXTURE_LAYOUT_ID, revision: FIXTURE_REVISION };
    const link = action('linkTopView');
    expect(link.version?.({ input, actor: 'admin' } as never)).toBe('0');
    const first = link.handle({ input, actor: 'admin' } as never) as { data: { linkId: string }; version: string };
    expect(first.version).toBe(`${first.data.linkId}:1`);
    expect(link.version?.({ input, actor: 'admin' } as never)).toBe(first.version);
    expect(link.handle({ input, actor: 'admin' } as never)).toMatchObject({ version: `${first.data.linkId}:2` });
    expect(view({ modelId: modelId('A-100') })?.resolved?.fromSoftwareId).toBe(swOf('A-100', 'v2.0'));
    expect(view({ modelId: modelId('A-100'), softwareId: swOf('A-100', 'v1.0') })?.resolved?.fromSoftwareId).toBeNull();
  });
  it('refuses an unknown Revision and a software version of another model', () => {
    const link = action('linkTopView');
    const base = { modelId: modelId('A-100'), fromSoftwareId: null, layoutId: FIXTURE_LAYOUT_ID, revision: FIXTURE_REVISION };
    expect(() => link.handle({ input: { ...base, revision: `sha256:${'0'.repeat(64)}` }, actor: 'admin' } as never)).toThrow();
    expect(() => link.handle({ input: { ...base, fromSoftwareId: swOf('A-200', 'v1.0') }, actor: 'admin' } as never)).toThrow();
  });
  it('unlinks the model default; a second unlink has no version', () => {
    const input = { modelId: modelId('A-100'), fromSoftwareId: null };
    const unlink = action('unlinkTopView');
    const current = unlink.version?.({ input, actor: 'admin' } as never) as string;
    expect(current).toMatch(/:1$/);
    expect(unlink.handle({ input, actor: 'admin' } as never)).toMatchObject({ version: current });
    expect(unlink.version?.({ input, actor: 'admin' } as never)).toBeNull();
    expect(view({ modelId: modelId('A-100') })).toMatchObject({ resolved: null, links: [] });
  });
});

describe('through the adapter', () => {
  const menu = {
    id: LOG_KNOWLEDGE_MODELS_MENU_ID, group: groupId('logKnowledge'), label: { ko: 'm', en: 'm' }, description: { ko: '', en: '' }, path: '/m', permission: 'platform:view', requiresScope: false,
    context: {}, pageType: 'management', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [],
  } as unknown as MenuMeta;
  const adapter = () => createMockAdapter({ endpoints: logKnowledgeMock.filter(e => e.spec.menuId === menu.id), actions: logKnowledgeActionsMock.filter(a => a.spec.menuId === menu.id), registry: { menus: [menu] }, permissions: [...KERNEL_PERMISSIONS, SPEC_PUBLISH_PERMISSION, CATALOG_MANAGE_PERMISSION] });
  const key = () => crypto.randomUUID();

  it('the Revision picker refuses a session without knowledge:catalog-manage and answers a manager', async () => {
    const a = adapter();
    const query = () => a.menuQuery({ endpoint: 'logKnowledge.topViewRevisionOptions', context: {}, params: {} });
    setRole('engineer');
    expect((await query()).outcome).toBe('forbidden');
    setRole('admin');
    expect(await query()).toMatchObject({ outcome: 'ok', data: { rows: [{ layoutId: FIXTURE_LAYOUT_ID }] } });
    setRole('engineer');
  });

  it('unlink answers the removed row\'s token; a stale token of it conflicts with a row linked later at the same key', async () => {
    const a = adapter();
    setRole('admin');
    const input = { modelId: modelId('A-100'), fromSoftwareId: null };
    const link = { ...input, layoutId: FIXTURE_LAYOUT_ID, revision: FIXTURE_REVISION };
    const read1 = (await a.menuQuery({ endpoint: 'logKnowledge.modelTopView', context: {}, params: { modelId: input.modelId } })) as { data: TopViewAnswer & { links: { version: string }[] } };
    const l1 = read1.data.links[0]!.version;
    const gone = await a.menuAction({ action: 'logKnowledge.unlinkTopView', context: {}, input, idempotencyKey: key(), expectedVersion: l1 });
    expect(gone).toMatchObject({ outcome: 'ok', version: l1 });
    expect(await a.menuAction({ action: 'logKnowledge.linkTopView', context: {}, input: link, idempotencyKey: key(), expectedVersion: '0' })).toMatchObject({ outcome: 'ok' });
    expect((await a.menuAction({ action: 'logKnowledge.linkTopView', context: {}, input: link, idempotencyKey: key(), expectedVersion: l1 })).outcome).toBe('conflict');
    expect((await a.menuAction({ action: 'logKnowledge.unlinkTopView', context: {}, input, idempotencyKey: key(), expectedVersion: l1 })).outcome).toBe('conflict');
    setRole('engineer');
  });

  it('lists every SW of the model in release order for the pickers', () => {
    const a = view({ modelId: modelId('A-100') }) as unknown as { softwareOptions: { version: string; releaseOrder: number }[] };
    expect(a.softwareOptions.map(o => o.version)).toEqual(['v1.0', 'v2.0']);
    expect(a.softwareOptions.map(o => o.releaseOrder)).toEqual([1, 2]);
  });
});
