import userEvent from '@testing-library/user-event';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, type PlatformSlots, type VocAvailability, type VocComposeProps } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { PaneScreenProvider } from '@ap/kernel/host';
import { useDetailPanelContent } from '@ap/ui';
import { groupId, spaceId } from '@ap/contracts';
import { AppShell } from '../../frame/AppShell';
import { useErrorReport } from '../useErrorReport';

const menu = (id: string, label: string, path: string) => ({
  id, group: groupId('overview'), primary: id === 'home', label: { ko: label, en: label }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: noContext, pageType: 'overview' as const, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['q'],
});
const registry = createRegistry({
  spaces: [testSpace({ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'home' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [menu('home', '홈', '/')],
});

const seen: VocComposeProps[] = [];
const last = () => seen.at(-1)!;
function FakeCompose(props: VocComposeProps) {
  const [text, setText] = useState('');
  seen.push(props);
  return <div>
    <input aria-label="내용" value={text} onChange={event => { setText(event.target.value); props.onDirtyChange(event.target.value !== ''); }} />
    <button type="button" onClick={() => props.onSubmitted({ vocId: 'v1', displayId: 'VOC-1' })}>제출</button>
  </div>;
}

/** A stand-in error view: the hook is the unit, this only shows what it returns. */
function ErrorView() {
  const [trace, setTrace] = useState('client-trace-1');
  const report = useErrorReport(trace);
  return <div>
    <p data-testid="status">{report.status}</p>
    <p data-testid="submitted">{String(report.submitted)}</p>
    <button type="button" onClick={() => report.open(trace)}>이 오류 신고</button>
    <button type="button" onClick={() => setTrace('client-trace-2')}>새 오류</button>
    <button type="button" onClick={() => setTrace('server-id-9')}>서버 아이디</button>
  </div>;
}

function mount(slots: PlatformSlots) {
  window.history.replaceState(null, '', '/?v=1&q=x');
  const session = testSession(['platform:view']);
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry} slots={slots}>
    <AppShell><ErrorView /></AppShell>
  </PlatformProvider></I18nProvider>);
}
const slotWith = (availability?: () => VocAvailability): PlatformSlots => ({ vocCompose: { Compose: FakeCompose, ...(availability ? { availability } : {}) } });

const paneRegistry = createRegistry({
  spaces: [testSpace({ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'home' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [menu('home', '홈', '/'), menu('other', '다른 화면', '/other')],
});
/** One error view with its own trace id and report button; `submitted-<trace>` shows its receipt. */
function Reporter({ trace, label }: { trace: string; label: string }) {
  const report = useErrorReport(trace);
  return <div><button type="button" onClick={() => report.open(trace)}>{label}</button><p data-testid={`submitted-${trace}`}>{String(report.submitted)}</p></div>;
}
/** An error view whose opener can be removed by a user action. */
function VanishingReporter() {
  const [gone, setGone] = useState(false);
  const report = useErrorReport('client-van-1');
  return <div>{!gone && <button type="button" onClick={() => report.open('client-van-1')}>사라질 신고</button>}<button type="button" onClick={() => setGone(true)}>신고 버튼 제거</button></div>;
}
function DetailRegistrar() {
  const [on, setOn] = useState(false);
  return <>{on && <Detail />}<button type="button" onClick={() => setOn(true)}>상세 등록</button></>;
}
function Detail() { useDetailPanelContent(<p>상세 본문</p>); return null; }
function mountWith(children: React.ReactNode, reg = registry) {
  window.history.replaceState(null, '', '/?v=1&q=x');
  const session = testSession(['platform:view']);
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={reg} slots={slotWith()}>
    <AppShell>{children}</AppShell>
  </PlatformProvider></I18nProvider>);
}
const inPane = (node: React.ReactNode) => <PaneScreenProvider paneId="p1" screen={{ menuId: 'other', params: {}, query: '' }} onChange={() => {}} onLeave={() => {}}>{node}</PaneScreenProvider>;
const railOpen = () => fireEvent.click(within(screen.getByRole('navigation', { name: '시스템 레일' })).getByRole('button', { name: /^VOC 등록/ }));
const status = () => screen.getByTestId('status').textContent;
const submitted = () => screen.getByTestId('submitted').textContent;
const drawer = () => document.querySelector<HTMLElement>('aside[aria-label="VOC 등록"]')!;
const chip = (name: RegExp) => within(drawer()).getByRole('button', { name });
const CONFIRM = '작성 중인 내용을 버릴까요?';

beforeEach(() => {
  seen.length = 0;
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('useErrorReport status', () => {
  it.each<[string, () => PlatformSlots, string]>([
    ['available: a slot that declares nothing', () => slotWith(), 'available'],
    ['available: the slot says so', () => slotWith(() => 'available'), 'available'],
    ['denied: the slot says the actor cannot file', () => slotWith(() => 'denied'), 'denied'],
    ['off: the slot says the screen takes no VOC', () => slotWith(() => 'off'), 'off'],
    ['off: no compose slot', () => ({}), 'off'],
    ['off: a throwing resolver (the error screen must not break)', () => slotWith(() => { throw new Error('lookup failed'); }), 'off'],
  ])('%s', (_name, slots, expected) => {
    mount(slots());
    expect(status()).toBe(expected);
  });

  it('is off for an id the VOC cannot carry', async () => {
    mount(slotWith());
    await userEvent.setup().click(screen.getByRole('button', { name: '서버 아이디' }));
    expect(status()).toBe('off');
  });

  it('does not open the drawer unless available', async () => {
    mount(slotWith(() => 'denied'));
    await userEvent.setup().click(screen.getByRole('button', { name: '이 오류 신고' }));
    expect(drawer().hidden).toBe(true);
    expect(seen).toHaveLength(0);
  });
});

describe('open', () => {
  it('freezes the screen plus the trace and menu chips and opens the real compose slot', async () => {
    mount(slotWith());
    await userEvent.setup().click(screen.getByRole('button', { name: '이 오류 신고' }));
    expect(drawer().hidden).toBe(false);
    expect(last().context.items.map(item => item.id)).toEqual(['menu', 'page:q', 'trace', 'error-menu']);
    expect(chip(/^추적 번호: client-trace-1/)).toBeInTheDocument();
    expect(chip(/^메뉴: 홈/)).toBeInTheDocument();
    expect([last().context.traceId, last().context.errorMenuId]).toEqual(['client-trace-1', 'home']);
    expect(last().context.href).not.toBeNull();
  });

  it('removes the chips independently; removing the screen chip drops the address but keeps trace and menu', async () => {
    mount(slotWith());
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '이 오류 신고' }));
    await user.click(chip(/^화면: .* 제거$/));
    expect(last().context.href).toBeNull();
    expect([last().context.traceId, last().context.errorMenuId]).toEqual(['client-trace-1', 'home']);
    await user.click(chip(/^추적 번호:/));
    expect([last().context.traceId, last().context.errorMenuId]).toEqual([null, 'home']);
    await user.click(chip(/^메뉴:/));
    expect([last().context.traceId, last().context.errorMenuId]).toEqual([null, null]);
  });

  it('never attaches returnTo or the query noise', async () => {
    window.history.replaceState(null, '', '/?v=1&q=x&returnTo=%2Fother');
    const session = testSession(['platform:view']);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry} slots={slotWith()}><AppShell><ErrorView /></AppShell></PlatformProvider></I18nProvider>);
    await userEvent.setup().click(screen.getByRole('button', { name: '이 오류 신고' }));
    expect(last().context.href).not.toContain('returnTo');
    expect(last().context.items.some(item => item.value.includes('returnTo'))).toBe(false);
  });

  it('leaves traceId and errorMenuId null on the rail path', () => {
    mount(slotWith());
    fireEvent.click(within(screen.getByRole('navigation', { name: '시스템 레일' })).getByRole('button', { name: /^VOC 등록/ }));
    expect([last().context.traceId, last().context.errorMenuId]).toEqual([null, null]);
  });
});

describe('submitted and focus', () => {
  it('flips submitted after the compose submit, and a new error clears it', async () => {
    mount(slotWith());
    const user = userEvent.setup();
    expect(submitted()).toBe('false');
    await user.click(screen.getByRole('button', { name: '이 오류 신고' }));
    await user.click(within(drawer()).getByRole('button', { name: '제출' }));
    expect(submitted()).toBe('true');
    expect(drawer().hidden).toBe(true);
    await user.click(screen.getByRole('button', { name: '새 오류' }));
    expect(submitted()).toBe('false');
  });

  it('returns focus to the opener when the drawer closes, and to the rail button once the opener is gone', async () => {
    mount(slotWith());
    const user = userEvent.setup();
    const opener = screen.getByRole('button', { name: '이 오류 신고' });
    await user.click(opener);
    await user.click(within(drawer()).getByRole('button', { name: '닫기' }));
    expect(opener).toHaveFocus();
  });

  it('falls back to the rail button when the opener left the page', async () => {
    mountWith(<VanishingReporter />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '사라질 신고' }));
    await user.click(screen.getByRole('button', { name: '신고 버튼 제거' }));
    expect(screen.queryByRole('button', { name: '사라질 신고' })).toBeNull();
    await user.click(within(drawer()).getByRole('button', { name: '닫기' }));
    expect(within(screen.getByRole('navigation', { name: '시스템 레일' })).getByRole('button', { name: /^VOC 등록/ })).toHaveFocus();
  });
});

describe('a kept draft is never overwritten', () => {
  it('asks first; keeping leaves the draft and discarding opens the report', async () => {
    mount(slotWith());
    const user = userEvent.setup();
    fireEvent.click(within(screen.getByRole('navigation', { name: '시스템 레일' })).getByRole('button', { name: /^VOC 등록/ }));
    await user.type(within(drawer()).getByLabelText('내용'), 'a');
    await user.click(screen.getByRole('button', { name: '이 오류 신고' }));
    expect(within(drawer()).getByText(CONFIRM)).toBeInTheDocument();
    expect(last().context.traceId).toBeNull();
    await user.click(within(drawer()).getByRole('button', { name: '계속 작성' }));
    expect(within(drawer()).getByLabelText('내용')).toHaveValue('a');
    expect(last().context.traceId).toBeNull();
    await user.click(screen.getByRole('button', { name: '이 오류 신고' }));
    await user.click(within(drawer()).getByRole('button', { name: '버리기' }));
    expect(within(drawer()).getByLabelText('내용')).toHaveValue('');
    expect(last().context.traceId).toBe('client-trace-1');
  });

  it('replaces a clean kept session with the report', async () => {
    mount(slotWith());
    fireEvent.click(within(screen.getByRole('navigation', { name: '시스템 레일' })).getByRole('button', { name: /^VOC 등록/ }));
    await userEvent.setup().click(screen.getByRole('button', { name: '이 오류 신고' }));
    expect(last().context.traceId).toBe('client-trace-1');
  });
});

describe('regressions of the review round (#606 node b1)', () => {
  it('C1: a report from a failing pane freezes that pane\'s screen, not the main screen', async () => {
    mountWith(<>{inPane(<Reporter trace="client-pane-1" label="칸 오류 신고" />)}</>, paneRegistry);
    await userEvent.setup().click(screen.getByRole('button', { name: '칸 오류 신고' }));
    expect(chip(/^메뉴: 다른 화면/)).toBeInTheDocument();
    expect(chip(/^화면: .*다른 화면 제거$/)).toBeInTheDocument();
    expect([last().context.traceId, last().context.errorMenuId, last().context.menuId]).toEqual(['client-pane-1', 'other', 'other']);
  });

  it('C2: a pending error report does not outlive its confirmation (detail takeover, reopen, close, discard)', async () => {
    mountWith(<><ErrorView /><DetailRegistrar /></>);
    const user = userEvent.setup();
    railOpen();
    await user.type(within(drawer()).getByLabelText('내용'), 'a');
    await user.click(screen.getByRole('button', { name: '이 오류 신고' }));
    expect(within(drawer()).getByText(CONFIRM)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '상세 등록' }));
    expect(drawer().hidden).toBe(true);
    railOpen();
    await user.click(within(drawer()).getByRole('button', { name: '닫기' }));
    expect(within(drawer()).getByText(CONFIRM)).toBeInTheDocument();
    await user.click(within(drawer()).getByRole('button', { name: '버리기' }));
    expect(drawer().hidden).toBe(true);
    expect(last().context.traceId).toBeNull();
  });

  it('C3: an ordinary rail submission keeps an earlier error\'s receipt', async () => {
    mountWith(<Reporter trace="client-a-1" label="신고 A" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '신고 A' }));
    await user.click(within(drawer()).getByRole('button', { name: '제출' }));
    expect(screen.getByTestId('submitted-client-a-1').textContent).toBe('true');
    railOpen();
    await user.click(within(drawer()).getByRole('button', { name: '제출' }));
    expect(screen.getByTestId('submitted-client-a-1').textContent).toBe('true');
  });

  it('C3: another pane\'s report keeps the first error\'s receipt', async () => {
    mountWith(<><Reporter trace="client-a-1" label="신고 A" />{inPane(<Reporter trace="client-b-1" label="신고 B" />)}</>, paneRegistry);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '신고 A' }));
    await user.click(within(drawer()).getByRole('button', { name: '제출' }));
    await user.click(screen.getByRole('button', { name: '신고 B' }));
    await user.click(within(drawer()).getByRole('button', { name: '제출' }));
    expect([screen.getByTestId('submitted-client-a-1').textContent, screen.getByTestId('submitted-client-b-1').textContent]).toEqual(['true', 'true']);
  });
});
