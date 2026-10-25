import { act, lazy } from 'react';
import { Inbox } from 'lucide-react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_FEATURES, contextCapabilities, groupId, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { foApi, setFoApi } from './fo-api';
import { foQueryClient } from './fo/session';
import { savedViewsSlot } from './saved-views';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SPACE = spaceId('feedbackops');
const GROUP = groupId('foVoc');
const section = savedViewsSlot.For(SPACE)!;
const Body = section.Body;
const menu = (id: string, path: string, pageKeys: string[], primary = false) => ({
  id, primary, group: GROUP, label: { ko: id, en: id }, description: { ko: id, en: id }, path, icon: Inbox, permission: 'feedbackops:access' as const,
  requiresScope: false, pageType: 'management' as const, context: contextCapabilities(), features: NO_FEATURES, pageKeys, component: lazy(async () => ({ default: () => null })),
});
const registry = createRegistry({
  spaces: [{ id: SPACE, label: { ko: 'FeedbackOps', en: 'FeedbackOps' }, description: { ko: '목적', en: 'Purpose' }, permission: 'feedbackops:access', carriedPageKeys: ['managedSystem', 'returnTo'], homeMenuId: 'fo-dashboard' }],
  groups: [{ id: GROUP, label: { ko: 'VOC', en: 'VOC' }, icon: Inbox, space: SPACE }],
  menus: [
    menu('fo-dashboard', '/feedbackops', ['managedSystem', 'returnTo'], true),
    menu('fo-inbox', '/feedbackops/vocs', ['focus', 'q', 'tab', 'sort', 'severity', 'reporterStatus', 'owner', 'area', 'managedSystem', 'returnTo']),
    menu('fo-triage', '/feedbackops/triage', ['focus', 'tab', 'managedSystem', 'area', 'returnTo']),
  ],
});

type Row = { id: string; surface: 'voc'; name: string; filter: Record<string, unknown>; created_at: string; updated_at: string };
const row = (id: string, name: string, filter: Record<string, unknown>): Row => ({ id, surface: 'voc', name, filter, created_at: '', updated_at: '' });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let root: Root | null = null;
let host: HTMLElement | null = null;
let rows: Row[] = [];
let posted: unknown[] = [];
let calls: string[] = [];
let failPost: { status: number; code: string } | null = null;
let failDelete = false;
let deleteGate: Promise<void> | null = null;
let getGate: Promise<void> | null = null;
let unauthorized = false;
let go: (path: string) => void = () => undefined;

function Nav() {
  const { navigate } = usePlatform();
  go = path => navigate(path);
  return null;
}

function Toasts() {
  const { toasts } = usePlatform();
  return <ul data-testid="toasts">{toasts.map(toast => <li key={toast.id} data-tone={toast.tone}>{toast.text}</li>)}</ul>;
}

async function mount(url: string) {
  window.history.replaceState(null, '', url);
  const session = testSession(['platform:view', 'feedbackops:access'], { user: { id: 'admin', name: 'admin', title: { ko: 'admin', en: 'admin' } } });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Body /><Toasts /><Nav /></PlatformProvider></I18nProvider>);
  });
  // The first mount in a run loads the lazy list chunk (a cold import of the FeedbackOps modules).
  for (let i = 0; foApi() !== null && getGate === null && host.textContent!.includes('불러오는 중…') && i < 60; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
}
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
const applyButton = (name: string) => host!.querySelector<HTMLButtonElement>(`button[title="${name}"]`)!;
const input = () => host!.querySelector<HTMLInputElement>('input[aria-label="저장된 보기 이름"]');
const toasts = () => [...host!.querySelectorAll('[data-testid="toasts"] li')].map(li => [li.getAttribute('data-tone'), li.textContent]);
async function type(value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input(), value);
    input()!.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { host!.querySelector('form')!.requestSubmit(); });
  await settle();
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  foQueryClient.clear();
  rows = []; posted = []; calls = []; failPost = null; failDelete = false; deleteGate = null; getGate = null; unauthorized = false;
  setFoApi({ basePath: '/api/fo', onSessionLost: vi.fn() });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url}`);
    if (method === 'GET') {
      if (unauthorized) return json({ code: 'auth.unauthenticated', message: 'x' }, 401);
      await getGate;
      return json({ items: rows });
    }
    if (method === 'POST') {
      if (failPost !== null) return json({ code: failPost.code, message: 'x' }, failPost.status);
      const body = JSON.parse(String(init!.body)) as Row;
      posted.push(body);
      rows = [...rows, row(`n${rows.length + 1}`, body.name, body.filter)];
      return json(rows[rows.length - 1], 201);
    }
    await deleteGate;
    if (failDelete) return json({ code: 'internal.error', message: 'x' }, 500);
    rows = rows.filter(r => url.endsWith(`/${r.id}`) === false);
    return new Response(null, { status: 204 });
  }));
});
afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null; host = null;
  setFoApi(null);
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('savedViewsSlot', () => {
  it('is the FeedbackOps section with one module-level Body', () => {
    expect(savedViewsSlot.For(spaceId('metrics'))).toBeNull();
    expect(section.label).toEqual({ ko: '저장된 보기', en: 'Saved views' });
    expect(savedViewsSlot.For(SPACE)!.Body).toBe(Body);
  });

  it('shows one muted 실서버 필요 line and requests nothing without a FeedbackOps API', async () => {
    setFoApi(null);
    await mount('/feedbackops');
    expect(host!.textContent).toContain('실서버 필요');
    expect(calls).toEqual([]);
  });

  it('on the dashboard shows the guidance line, never an empty body', async () => {
    await mount('/feedbackops');
    await settle();
    expect(host!.textContent).toContain('수신함이나 Triage에서 현재 필터를 저장할 수 있습니다.');
    expect(input()).toBeNull();
  });

  it('on the dashboard lists the saved views', async () => {
    rows = [row('a', '높음 보기', { view: 'inbox', 'filter.severity': 'high' })];
    await mount('/feedbackops');
    await settle();
    expect(applyButton('높음 보기')).toBeTruthy();
    expect(host!.textContent).not.toContain('수신함이나 Triage');
  });
});

describe('save', () => {
  it('posts the mapped inbox filter', async () => {
    await mount('/feedbackops/vocs?q=abc&severity=high&managedSystem=ms1&area=x&focus=9');
    await settle();
    await type('내 보기');
    expect(posted).toEqual([{ surface: 'voc', name: '내 보기', filter: { view: 'inbox', q: 'abc', 'filter.severity': 'high', managed_system_id: 'ms1' } }]);
    expect(applyButton('내 보기')).toBeTruthy();
  });

  it('stores no returnTo when saved from a screen that carries one (#760)', async () => {
    await mount('/feedbackops/vocs?q=abc&managedSystem=ms1&returnTo=%2Forigin%3Fv%3D1');
    await settle();
    await type('돌아가기 없는 보기');
    expect(JSON.stringify(posted)).not.toContain('returnTo');
    expect(JSON.stringify(posted)).not.toContain('origin');
  });

  it('posts the Triage view with its fixed view key', async () => {
    await mount('/feedbackops/triage?tab=high&managedSystem=ms1');
    await settle();
    await type('트리아지');
    expect(posted).toEqual([{ surface: 'voc', name: '트리아지', filter: { view: 'triage', tab: 'high', managed_system_id: 'ms1' } }]);
  });

  it('reports a taken name through the kernel toast with FO copy and keeps the typed name', async () => {
    failPost = { status: 409, code: 'conflict.saved_view_name_taken' };
    await mount('/feedbackops/vocs');
    await settle();
    await type('중복');
    expect(toasts()).toEqual([['danger', '이미 사용 중인 저장된 보기 이름입니다.']]);
    expect(input()!.value).toBe('중복');
  });
});

describe('apply', () => {
  const path = () => `${window.location.pathname}${window.location.search}`;
  const click = async (name: string) => { await act(async () => { applyButton(name).click(); }); await settle(); };

  it('lands on 수신함 with exactly the stored keys and clears a carried managedSystem', async () => {
    rows = [row('a', '높음', { view: 'inbox', 'filter.severity': 'high' })];
    await mount('/feedbackops/vocs?q=old&managedSystem=ms1&sort=-created&returnTo=%2Forigin%3Fv%3D1');
    await settle();
    await click('높음');
    expect(window.location.pathname).toBe('/feedbackops/vocs');
    const search = new URLSearchParams(window.location.search);
    expect(search.get('severity')).toBe('high');
    expect([...search.keys()].filter(key => key !== 'severity' && key !== 'v')).toEqual([]);
    expect(search.has('returnTo')).toBe(false);
  });

  it('keeps the stored managedSystem and lands on Triage for a triage view from another menu', async () => {
    rows = [row('a', '트리아지', { view: 'triage', tab: 'high', managed_system_id: 'ms2' })];
    await mount('/feedbackops');
    await settle();
    await click('트리아지');
    expect(new URL(path(), 'http://x').pathname).toBe('/feedbackops/triage');
    const search = new URLSearchParams(window.location.search);
    expect(search.get('tab')).toBe('high');
    expect(search.get('managedSystem')).toBe('ms2');
  });

  it.each([
    ['inbox', '/feedbackops/vocs?managedSystem=ms1', '/feedbackops/vocs'],
    ['triage', '/feedbackops/triage?managedSystem=ms1', '/feedbackops/triage'],
  ])('applies a stored managed_system_id all as a cleared scope for a %s view', async (view, start, pathname) => {
    rows = [row('a', '전체', { view, managed_system_id: 'all' })];
    await mount(start);
    await settle();
    await click('전체');
    expect(window.location.pathname).toBe(pathname);
    expect(new URLSearchParams(window.location.search).has('managedSystem')).toBe(false);
    expect(window.location.search).not.toContain('all');
  });

  it('leaves a stored view no table maps inert', async () => {
    rows = [row('a', '이상함', { view: 'mystery' })];
    await mount('/feedbackops');
    await settle();
    await click('이상함');
    expect(path()).toBe('/feedbackops');
  });
});

describe('session states', () => {
  it('shows a loading line, not 실서버 필요, while the list loads', async () => {
    let release!: () => void;
    getGate = new Promise<void>(resolve => { release = resolve; });
    await mount('/feedbackops');
    await settle();
    expect(host!.textContent).toContain('불러오는 중…');
    expect(host!.textContent).not.toContain('실서버 필요');
    expect(host!.textContent).not.toContain('수신함이나 Triage');
    await act(async () => { release(); });
    await settle();
    expect(host!.textContent).not.toContain('불러오는 중…');
  });

  it('shows the session-lost wording once the session is retired', async () => {
    unauthorized = true;
    await mount('/feedbackops');
    await settle();
    expect(host!.textContent).toContain('세션이 만료되었습니다');
    expect(host!.textContent).not.toContain('실서버 필요');
  });
});

describe('delete and focus recovery', () => {
  const del = async (name: string) => {
    await act(async () => { host!.querySelector<HTMLButtonElement>(`button[aria-label="저장된 보기 ${name} 삭제"]`)!.click(); });
    await settle();
  };
  const three = () => [row('a', 'A', { view: 'inbox' }), row('b', 'B', { view: 'inbox' }), row('c', 'C', { view: 'inbox' })];

  it('focuses the next surviving row', async () => {
    rows = three();
    await mount('/feedbackops');
    await settle();
    await del('B');
    expect(document.activeElement).toBe(applyButton('C'));
  });

  it('focuses the previous row when the last one is deleted', async () => {
    rows = three();
    await mount('/feedbackops');
    await settle();
    await del('C');
    expect(document.activeElement).toBe(applyButton('B'));
  });

  it('focuses the save input when the last row is deleted on 수신함', async () => {
    rows = [row('a', 'A', { view: 'inbox' })];
    await mount('/feedbackops/vocs');
    await settle();
    await del('A');
    expect(document.activeElement).toBe(input());
  });

  it('keeps focus and reports a rejected delete through the toast', async () => {
    rows = three();
    failDelete = true;
    await mount('/feedbackops');
    await settle();
    const button = host!.querySelector<HTMLButtonElement>('button[aria-label="저장된 보기 B 삭제"]')!;
    button.focus();
    await del('B');
    expect(document.activeElement).toBe(button);
    expect(applyButton('B')).toBeTruthy();
    expect(toasts()).toEqual([['danger', '일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.']]);
  });

  it('moves no focus when a delayed delete resolves after navigating away', async () => {
    rows = three();
    let release!: () => void;
    deleteGate = new Promise<void>(resolve => { release = resolve; });
    await mount('/feedbackops/vocs');
    await settle();
    await act(async () => { host!.querySelector<HTMLButtonElement>('button[aria-label="저장된 보기 B 삭제"]')!.click(); });
    await act(async () => { go('/feedbackops/triage'); });
    await settle();
    input()!.focus();
    await act(async () => { release(); });
    await settle();
    expect(applyButton('B')).toBeNull();
    expect(document.activeElement).toBe(input());
  });

  it('drops an armed recovery when the route changes before the list refetch lands', async () => {
    rows = three();
    await mount('/feedbackops/vocs');
    await settle();
    let release!: () => void;
    getGate = new Promise<void>(resolve => { release = resolve; });
    await act(async () => { host!.querySelector<HTMLButtonElement>('button[aria-label="저장된 보기 B 삭제"]')!.click(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
    await act(async () => { go('/feedbackops/triage'); });
    input()!.focus();
    await act(async () => { release(); });
    await settle();
    expect(applyButton('B')).toBeNull();
    expect(document.activeElement).toBe(input());
  });

  it('still recovers when the delayed delete resolves on the same route', async () => {
    rows = three();
    let release!: () => void;
    deleteGate = new Promise<void>(resolve => { release = resolve; });
    await mount('/feedbackops');
    await settle();
    await act(async () => { host!.querySelector<HTMLButtonElement>('button[aria-label="저장된 보기 B 삭제"]')!.click(); });
    await act(async () => { release(); });
    await settle();
    expect(document.activeElement).toBe(applyButton('C'));
  });
});
