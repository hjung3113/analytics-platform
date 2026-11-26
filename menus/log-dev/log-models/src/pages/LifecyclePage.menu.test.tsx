// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Cpu } from 'lucide-react';
import { groupId, spaceId, type ApiResponse } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, settleQueries, testAdapter, testSession } from '@ap/kernel/testing';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { manifests } from '../index';
import { GATE_DECIDE, PROJECT_MANAGE, ROUND_MANAGE } from '../endpoints';
import LifecyclePage from './LifecyclePage';
// eslint-disable-next-line ap/no-menu-mock-import -- Test-only MEN-8 migration reuses the E2E menu fixture and handlers without altering product code.
import { logLifecycleMock } from '../mock/index';

const PROJECT = '14470000-0000-4000-8000-000000000101';
const ROUND = '14470000-0000-4000-8000-000000000201';
const REQUEST = '14470000-0000-4000-8000-000000000301';
const ATTEMPT = '14470000-0000-4000-8000-000000000401';
const registry = createRegistry({ permissions: [GATE_DECIDE, PROJECT_MANAGE, ROUND_MANAGE], spaces: [{ id: spaceId('logDev'), label: { ko: '로그', en: 'Log' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'log-models' }], groups: [{ id: groupId('logModels'), label: { ko: '모델', en: 'Models' }, icon: Cpu, space: spaceId('logDev') }], menus: manifests });
const ok = (data: unknown) => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'fixture' }) as ApiResponse<never>;
function Slot() { const slot = useDetailPanelSlotHost(); return <aside ref={slot.ref} />; }
let restore: () => void;
let root: Root;
let container: HTMLDivElement;
beforeEach(() => { restore = stubCompactTableGeometry(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); Element.prototype.scrollIntoView = vi.fn(); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); restore(); });
function mount(route = 'round', search = '') {
  const session = testSession(['platform:view', GATE_DECIDE, PROJECT_MANAGE, ROUND_MANAGE], { user: { id: 'admin' } });
  const adapter = testAdapter({ session: () => session, menuQuery: async q => {
    const endpoint = logLifecycleMock.find(e => e.spec.id === q.endpoint);
    return ok(endpoint ? await endpoint.handle({ params: q.params, actor: 'admin' } as never) : null);
  } });
  const path = manifests.find(m => m.id === (route === 'models' ? 'log-models' : route === 'project' ? 'log-model-project' : 'log-model-round'))!.path.replace(':projectId', PROJECT).replace(':roundId', ROUND);
  window.history.replaceState(null, '', `${path}?v=1${search}`);
  act(() => root.render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}><DetailPanelSlotProvider><LifecyclePage params={route === 'models' ? {} : { projectId: PROJECT, ...(route === 'round' ? { roundId: ROUND } : {}) }} /><Slot /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>));
}


function button(name: string) {
  const node = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === name || b.getAttribute('aria-label') === name);
  if (!node) throw new Error(`Missing button ${name}`);
  return node;
}
const click = (node: HTMLElement) => act(() => node.click());
async function waitFor(assertion: () => void) {
  for (let i = 0; i < 50; i++) {
    await act(async () => { await settleQueries(); });
    try { assertion(); return; } catch (error) { if (i === 49) throw error; }
  }
}
describe('MEN-8 lifecycle menu assertions', () => {
  it('model with no development project shows 개발 건 없음', async () => {
    mount('models');
    await waitFor(() => expect(document.body.textContent).toContain('개발 건 없음'));
  });
  it('project lists five development stages', async () => {
    mount('project');
    await waitFor(() => expect(document.querySelector('[aria-label="개발 단계"]')?.querySelectorAll('li')).toHaveLength(5));
  });
  it('Gate approval is disabled for the incomplete synthetic Round', async () => {
    mount();
    await waitFor(() => expect(button('Gate 결정')).toBeTruthy());
    click(button('Gate 결정'));
    await waitFor(() => expect(document.querySelector('input[type="radio"][value="approved"]')?.hasAttribute('disabled')).toBe(true));
  });
  it('registration from a Round fixes that Round', async () => {
    mount();
    await waitFor(() => expect(document.querySelector('[role="tab"]')).toBeTruthy());
    const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(t => t.textContent?.startsWith('설정·이력'))!;
    act(() => tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
    await waitFor(() => expect(button('요청 등록')).toBeTruthy());
    click(button('요청 등록'));
    await waitFor(() => {
      const label = [...document.querySelectorAll('label')].find(l => l.textContent === 'Round· 필수')!;
      const input = document.getElementById(label.htmlFor) as HTMLInputElement;
      expect(input.disabled).toBe(true); expect(input.value).toBe(ROUND);
    });
  });
  it('purged excerpt has unknown state without deletion claims or a read action', async () => {
    mount('round', `&request=${REQUEST}&attempt=${ATTEMPT}&result=NOT_CHECKED`);
    await waitFor(() => expect(button('SEQ-002 상세 열기')).toBeTruthy());
    expect(document.querySelector('[aria-label="규칙 결과"]')?.textContent).toContain('SEQ-002');
    expect(document.querySelector('[aria-label="규칙 결과"]')?.textContent).not.toContain('TIME-001');
    click(button('SEQ-002 상세 열기'));
    await waitFor(() => expect(document.body.textContent).toContain('발췌 상태 알 수 없음'));
    expect(document.body.textContent).not.toMatch(/삭제됨|만료/);
    expect([...document.querySelectorAll('button')].some(b => b.textContent === '발췌 보기')).toBe(false);
  });
  it('excerpt body requires an explicit read', async () => {
    mount('round', `&request=${REQUEST}&attempt=${ATTEMPT}&result=ERROR`);
    await waitFor(() => expect(button('TIME-001 상세 열기')).toBeTruthy());
    click(button('TIME-001 상세 열기'));
    await waitFor(() => expect(button('발췌 보기')).toBeTruthy());
    expect(document.body.textContent).not.toContain('SYNTHETIC FIXTURE · 이벤트 형식 해석 실패');
    click(button('발췌 보기'));
    await waitFor(() => expect(document.body.textContent).toContain('SYNTHETIC FIXTURE · 이벤트 형식 해석 실패'));
  });
});

describe('F-1 list page ownership', () => {
  it('the model screen supplies its single PlatformPage', async () => {
    mount('models');
    await waitFor(() => expect(document.querySelector('[aria-label="모델 목록"]')).toBeTruthy());
    expect(document.querySelectorAll('[data-platform-page]')).toHaveLength(1);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
  });
});
