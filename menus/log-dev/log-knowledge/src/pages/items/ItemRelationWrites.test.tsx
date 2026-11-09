// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { stubCompactTableGeometry } from '@ap/components/testing';
import type { ActionResponse, ApiResponse, MenuAction } from '@ap/contracts';
import type { ItemDetail } from '../../endpoints';
import { knowledgeRegistry, treeWith } from '../test-support';
import { ItemWriteDrawer } from './ItemWriteDrawer';

const model = '00000003-0000-4000-8000-000000000001', itemId = '00000005-0000-4000-8000-000000000001';
const registry = knowledgeRegistry(['knowledge:catalog-manage', 'knowledge:item-publish'], { homeMenuId: 'log-knowledge-items', description: { ko: 'Item', en: 'Item' } });
const session = testSession(['platform:view', 'knowledge:item-publish']);
const detail: ItemDetail = {
  item: { id: itemId, itemNo: 1, title: '관계 기록', typeCode: 'anomaly', owner: { kind: 'model', modelId: model, modelName: 'MX-100' }, publicationState: 'published', verificationState: 'not_checked', processingState: 'open', latestRevisionNo: 1, updatedAt: '2026-11-08T00:00:00Z', createdAt: '2026-11-08T00:00:00Z', createdBy: 'author', version: '1' },
  revision: { revisionNo: 1, title: '관계 기록', typeCode: 'anomaly', observation: '관찰', expected: null, analysisOpinion: null, improvement: null, changeNote: null, evidence: [], publishedAt: '2026-11-08T00:00:00Z', publishedBy: 'author' },
  revisions: [], assessments: [], links: [], subjects: [],
  relations: [{ ordinal: 1, kind: 'observed', source: 'CHAMBER/A', predicate: 'before', target: 'CHAMBER/B', resolved: false, sourceLabel: null, targetLabel: null }],
};
let writes: MenuAction[] = [], restoreGeometry = () => {};
const ok = (data: unknown): ApiResponse<never> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'relation-write' }) as ApiResponse<never>;
const adapter = testAdapter({
  session: () => session,
  menuQuery: async req => req.endpoint === 'logKnowledge.modelSpec' ? ok(null) : ok({ rows: [{ id: model, code: 'MX-100', name: 'MX-100', active: true }], total: 1 }),
  menuAction: async req => {
    writes.push(req);
    return { outcome: 'ok', data: { id: itemId, itemNo: 1, revisionNo: 2 }, version: '2', fieldErrors: [], replayed: false, correlationId: 'relation-write' } as unknown as ActionResponse<never>;
  },
});
beforeEach(() => { writes = []; restoreGeometry = stubCompactTableGeometry(); window.history.replaceState(null, '', '/log/knowledge/items'); });
afterEach(() => { cleanup(); restoreGeometry(); });
function mount(mode: 'create' | 'revise') {
  return render(treeWith({ registry, adapter, slot: true, slotLabel: '상세 패널', ui: <ItemWriteDrawer target={mode === 'create' ? { mode, ownerModelId: model } : { mode, detail, viewedRevisionNo: 1, onReload: () => {} }} onClose={() => {}} /> }));
}
function chooseFree(name: string, key: string) {
  fireEvent.click(screen.getByRole('combobox', { name }));
  const input = screen.getByRole('textbox', { name: '' });
  fireEvent.change(input, { target: { value: key } });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
}
describe('Item drawer relation action inputs', () => {
  it('creates an Item with a new optional relation', async () => {
    mount('create');
    await screen.findByRole('heading', { name: '새 기술 Item' });
    fireEvent.change(screen.getByLabelText(/^제목/), { target: { value: '새 관계' } });
    fireEvent.change(screen.getByLabelText(/^관찰 사실/), { target: { value: '관찰 내용' } });
    fireEvent.click(screen.getByRole('button', { name: '관계 추가' }));
    chooseFree('Event A', 'CUSTOM/START'); chooseFree('Event B', 'CUSTOM/END');
    fireEvent.click(screen.getByRole('button', { name: '등록' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.input).toMatchObject({ relations: [{ kind: 'observed', source: { module: 'CUSTOM', event: 'START' }, target: { module: 'CUSTOM', event: 'END' }, predicate: 'before' }] });
  });
  it('omits unchanged records on revise, preserving their original resolution metadata', async () => {
    mount('revise');
    await screen.findByRole('heading', { name: '기술 Item 수정' });
    fireEvent.change(screen.getByLabelText(/^변경 사유/), { target: { value: '본문만 보완' } });
    fireEvent.click(screen.getByRole('button', { name: '새 리비전 저장' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.input).not.toHaveProperty('relations');
  });
  it('sends an empty replacement when the last relation is removed', async () => {
    mount('revise');
    const panel = await screen.findByRole('complementary', { name: '상세 패널' });
    fireEvent.click(within(panel).getByRole('button', { name: '관계 1 빼기' }));
    fireEvent.change(screen.getByLabelText(/^변경 사유/), { target: { value: '관계 제거' } });
    fireEvent.click(screen.getByRole('button', { name: '새 리비전 저장' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.input).toMatchObject({ relations: [] });
  });
});
