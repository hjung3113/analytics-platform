import { beforeEach, describe, expect, it } from 'vitest';
import { emptyGlobal } from '@ap/contracts';
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
    expect(link.handle({ input, actor: 'admin' } as never)).toMatchObject({ version: '1' });
    expect(link.version?.({ input, actor: 'admin' } as never)).toBe('1');
    expect(link.handle({ input, actor: 'admin' } as never)).toMatchObject({ version: '2' });
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
    expect(unlink.version?.({ input, actor: 'admin' } as never)).toBe('1');
    unlink.handle({ input, actor: 'admin' } as never);
    expect(unlink.version?.({ input, actor: 'admin' } as never)).toBeNull();
    expect(view({ modelId: modelId('A-100') })).toMatchObject({ resolved: null, links: [] });
  });
});
