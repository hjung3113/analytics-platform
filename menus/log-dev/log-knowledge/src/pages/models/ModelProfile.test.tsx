// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { instantText } from './modelPresentation';
import ModelProfile from './ModelProfile';
import { MODEL_ID, Providers, admin, makeAdapter, profileOf, viewer, type Kit } from './test-support';

let kit: Kit;
let session = admin;
beforeEach(() => { kit = { queries: [], profile: () => profileOf() }; session = admin; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const slow = { timeout: 8000 };
vi.setConfig({ testTimeout: 20000 });
function mount(modelId = MODEL_ID) {
  window.history.replaceState(null, '', `/logDev/log-knowledge-model/${modelId}?v=1`);
  render(<Providers adapter={makeAdapter(kit, () => session)}><ModelProfile params={{ modelId }} /></Providers>);
}
const section = (name: string) => screen.getByRole('region', { name });
const addLinks = () => screen.queryAllByRole('link', { name: /SW 버전 추가/ });

describe('모델 프로파일 sections', () => {
  it('asks the server for the model by its path id and shows title, crumbs and the meta line', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: 'Alpha 100' }, slow)).toBeTruthy();
    expect(kit.queries.find(q => q.endpoint === 'logKnowledge.modelProfile')?.params).toEqual({ modelId: MODEL_ID });
    // 모델 탐색 › 제조사 › 모델명: the parent menu and the (link-less) 제조사 crumb, then the title.
    const crumbs = screen.getAllByRole('navigation').find(nav => nav.textContent?.includes('모델 탐색'))!;
    expect(within(crumbs).getByRole('link', { name: '모델 탐색' })).toBeTruthy();
    const vendor = within(crumbs).getByText('Alpha Semicap');
    expect(vendor.closest('a')).toBeNull();
    expect(crumbs.textContent!.indexOf('모델 탐색')).toBeLessThan(crumbs.textContent!.indexOf('Alpha Semicap'));
    const meta = screen.getAllByText('A-100').find(el => el.parentElement?.textContent?.includes('Alpha Semicap'))!.parentElement!;
    for (const text of ['A-100', 'Alpha Semicap', 'Etch', 'Deposition', '활성']) expect(meta.textContent).toContain(text);
  });

  it('stacks 모델 요약, SW 버전, 모델 공통 Item and Top View under a section nav', async () => {
    mount();
    await screen.findByRole('heading', { level: 1, name: 'Alpha 100' }, slow);
    const nav = screen.getByRole('navigation', { name: '섹션 이동' });
    expect(within(nav).getAllByRole('button').map(b => b.textContent)).toEqual(['모델 요약', 'SW 버전', '모델 공통 Item', 'Top View']);
    const summary = section('모델 요약');
    for (const label of ['모델 코드', '제조사', '공정', '상태', '등록 시각', '변경 시각']) expect(within(summary).getByText(label)).toBeTruthy();
    expect(within(summary).getByText(instantText('2026-10-01T00:00:00.000Z'))).toBeTruthy();
    expect(within(summary).getByText(instantText('2026-10-02T09:30:00.000Z'))).toBeTruthy();
    expect(await within(section('모델 공통 Item')).findByText('이 모델이 소유한 Item이 없습니다', {}, slow)).toBeTruthy();
    expect(within(section('Top View')).getByText('연결된 Top View가 없습니다')).toBeTruthy();
  });

  it('lists every SW 버전 (inactive too) with item count, status and last change; rows are not interactive', async () => {
    mount();
    await screen.findByRole('heading', { level: 1, name: 'Alpha 100' }, slow);
    const table = within(section('SW 버전')).getByRole('table');
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['버전', '이름', '기술 Item 수', '상태', '최종 변경']);
    const [first, second] = within(table).getAllByRole('row').slice(1);
    expect(first!.textContent).toBe(`v2.0Major3활성${instantText('2026-10-03T00:00:00.000Z')}`);
    expect(second!.textContent).toBe(`v1.0—0비활성${instantText('2026-10-01T00:00:00.000Z')}`);
    expect(within(table).queryByRole('link')).toBeNull();
    expect(within(table).queryByRole('button')).toBeNull();
    expect(screen.queryByText('최근 500개만 표시')).toBeNull();
  });

  it('notes a cut list', async () => {
    kit.profile = () => profileOf({ truncated: true });
    mount();
    expect(await screen.findByText('최근 500개만 표시', {}, slow)).toBeTruthy();
  });

  it('marks an inactive 제조사', async () => {
    const base = profileOf();
    kit.profile = () => ({ ...base, model: { ...base.model, vendor: { ...base.model.vendor, active: false } } });
    mount();
    await screen.findByRole('heading', { level: 1, name: 'Alpha 100' }, slow);
    expect(within(section('모델 요약')).getByText('비활성')).toBeTruthy();
  });

  it('a model without SW 버전 says so, and a model without 공정 reads 공정 미분류', async () => {
    const base = profileOf();
    kit.profile = () => ({ ...base, model: { ...base.model, processes: [] }, softwareVersions: [], modelItems: { total: 0 } });
    mount();
    await screen.findByRole('heading', { level: 1, name: 'Alpha 100' }, slow);
    expect(within(section('SW 버전')).getByText('등록된 SW 버전이 없습니다')).toBeTruthy();
    expect(within(section('SW 버전')).queryByRole('table')).toBeNull();
    expect(screen.getAllByText('공정 미분류').length).toBeGreaterThan(0);
    expect(await within(section('모델 공통 Item')).findByText('이 모델이 소유한 Item이 없습니다', {}, slow)).toBeTruthy();
  });
});

describe('모델 프로파일 editor-only actions', () => {
  it('a catalog manager gets 「SW 버전 추가」 in the header and in an empty SW list, linking to the catalog SW tab of this model', async () => {
    const base = profileOf();
    kit.profile = () => ({ ...base, softwareVersions: [] });
    mount();
    await screen.findByText('등록된 SW 버전이 없습니다', {}, slow);
    const links = addLinks();
    expect(links).toHaveLength(2);
    for (const link of links) {
      const href = new URL(link.getAttribute('href')!, 'http://x');
      expect(href.pathname.endsWith('/log-knowledge-catalog')).toBe(true);
      expect(href.searchParams.get('tab')).toBe('software');
    }
  });

  it('a viewer sees no 「SW 버전 추가」 anywhere, not even in the empty state', async () => {
    session = viewer;
    const base = profileOf();
    kit.profile = () => ({ ...base, softwareVersions: [] });
    mount();
    await screen.findByText('등록된 SW 버전이 없습니다', {}, slow);
    expect(addLinks()).toHaveLength(0);
    expect(screen.queryByText(/SW 버전 추가/)).toBeNull();
  });

  it('an admin with SW 버전 has the header action only', async () => {
    mount();
    await screen.findByRole('heading', { level: 1, name: 'Alpha 100' }, slow);
    expect(addLinks()).toHaveLength(1);
  });
});

describe('모델 프로파일 not found', () => {
  it('a null profile shows a not-found state with a link back to 모델 탐색 and no sections', async () => {
    kit.profile = () => null;
    mount('00000003-0000-4000-8000-0000000000ff');
    expect(await screen.findByText('이 모델을 찾을 수 없습니다', {}, slow)).toBeTruthy();
    const back = screen.getByRole('link', { name: '모델 탐색으로' });
    expect(new URL(back.getAttribute('href')!, 'http://x').pathname.endsWith('/log-knowledge-models')).toBe(true);
    expect(screen.queryByRole('region', { name: '모델 요약' })).toBeNull();
    expect(screen.queryByRole('link', { name: /SW 버전 추가/ })).toBeNull();
  });
});
