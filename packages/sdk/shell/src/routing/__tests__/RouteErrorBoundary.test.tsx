import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, type PlatformSlots, type VocAvailability, type VocComposeProps } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { AppShell } from '../../frame/AppShell';
import { RouteErrorBoundary } from '../RouteErrorBoundary';

const TRACE = 'client-test-606';
const RECOVERY = '다른 메뉴는 그대로 사용할 수 있습니다. 다시 시도하거나 홈으로 이동하세요.';
const MANUAL = '문의할 때 아래 추적 번호를 알려 주세요.';
const RECEIPT = '오류 신고가 접수되었습니다. 다시 시도하거나 홈으로 이동할 수 있습니다.';
const registry = createRegistry({
  spaces: [testSpace({ id: spaceId('mars'), homeMenuId: 'home' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: ['home', 'crash'].map(id => ({
    id, group: groupId('overview'), primary: id === 'home', label: { ko: id, en: id }, description: { ko: '', en: '' }, path: `/${id}`, icon: House,
    permission: 'platform:view' as const, requiresScope: false, context: noContext, pageType: 'overview' as const,
    features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [],
  })),
});
function Compose({ onSubmitted }: VocComposeProps) {
  return <button type="button" onClick={() => onSubmitted({ vocId: 'v1', displayId: 'VOC-1' })}>Submit report</button>;
}
let broken = true;
function Flaky() { if (broken) throw new Error('render failure'); return <p>Recovered screen</p>; }
function mount(status: VocAvailability | 'absent' = 'available', lang: 'ko' | 'en' = 'ko') {
  localStorage.setItem('platform:lang', lang);
  window.history.replaceState(null, '', '/mars/crash?v=1');
  const session = testSession(['platform:view']);
  const slots: PlatformSlots = status === 'absent' ? {} : { vocCompose: { Compose, availability: () => status } };
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry} slots={slots}>
    <AppShell><RouteErrorBoundary onError={() => TRACE} resetKey="crash"><Flaky /></RouteErrorBoundary></AppShell>
  </PlatformProvider></I18nProvider>);
}
const main = () => within(screen.getByRole('main'));
const entry = (name = '이 오류 신고') => main().getByRole('button', { name });
const drawer = () => screen.getByRole('complementary', { name: 'VOC 등록' });

beforeEach(() => {
  broken = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('RouteErrorBoundary approved B report entry', () => {
  it('puts an accessible report entry next to selectable trace text and removes the manual sentence when available', () => {
    mount();
    const report = entry();
    expect(report).toBeEnabled();
    expect(report.parentElement).toHaveTextContent(`추적 번호: ${TRACE}`);
    expect(main().getByText(TRACE)).toHaveClass('t-mono', 'select-text');
    expect(main().getByRole('alert')).toHaveTextContent(RECOVERY);
    expect(main().getByRole('alert')).not.toHaveTextContent(/문의할 때|Correlation ID/);
  });

  it('opens the real drawer with this error\'s trace chip and returns focus on close', async () => {
    mount();
    const user = userEvent.setup();
    const report = entry();
    await user.click(report);
    expect(within(drawer()).getByRole('button', { name: `추적 번호: ${TRACE} 제거` })).toBeVisible();
    await user.click(within(drawer()).getByRole('button', { name: '닫기' }));
    expect(report).toHaveFocus();
  });

  it.each(['off', 'absent', 'denied'] as const)('%s disables reporting, describes why, and restores manual recovery guidance', async status => {
    mount(status);
    const reason = status === 'denied' ? 'VOC를 등록할 권한이 없습니다.' : '이 환경에서는 VOC를 사용할 수 없습니다.';
    const report = entry();
    expect(report).toBeDisabled();
    expect(report).toHaveAccessibleDescription(reason);
    expect(document.getElementById(report.getAttribute('aria-describedby')!)).toHaveTextContent(reason);
    expect(main().getByRole('alert')).toHaveTextContent(`${RECOVERY} ${MANUAL}`);
    await userEvent.setup().click(report);
    expect(screen.queryByRole('complementary', { name: 'VOC 등록' })).toBeNull();
  });

  it('announces submission in the existing polite status region, keeps recovery, and makes the entry inert without losing focus', async () => {
    mount();
    const user = userEvent.setup();
    const report = entry();
    const status = main().getByRole('status', { name: '오류 신고 결과' });
    expect(status).toBeEmptyDOMElement();
    await user.click(report);
    await user.click(within(drawer()).getByRole('button', { name: 'Submit report' }));
    expect(main().getByRole('status', { name: '오류 신고 결과' })).toBe(status);
    expect(status).toHaveTextContent(RECEIPT);
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(report).toHaveAttribute('aria-disabled', 'true');
    expect(report).toHaveAttribute('tabindex', '-1');
    expect(report).toHaveAccessibleDescription(RECEIPT);
    expect(report).toHaveFocus();
    expect(main().getByRole('button', { name: '다시 시도' })).toBeEnabled();
    expect(main().getByRole('link', { name: '홈' })).toBeVisible();
    await user.click(report);
    expect(screen.queryByRole('complementary', { name: 'VOC 등록' })).toBeNull();
  });

  it.each(['available', 'off', 'denied'] as const)('uses English guidance and report controls for %s', status => {
    mount(status, 'en');
    const report = entry('Report this error');
    expect(report.parentElement).toHaveTextContent(`Trace ID: ${TRACE}`);
    const alert = main().getByRole('alert');
    expect(alert).toHaveTextContent('Other menus still work. Retry, or go home.');
    if (status === 'available') {
      expect(alert).not.toHaveTextContent('Quote the Trace ID');
    } else {
      expect(alert).toHaveTextContent('Quote the Trace ID below when you ask for help.');
      expect(report).toHaveAccessibleDescription(status === 'off' ? 'VOC is not available in this environment.' : 'You do not have permission to submit a VOC.');
    }
  });

  it('uses English for the submission receipt', async () => {
    mount('available', 'en');
    const user = userEvent.setup();
    await user.click(entry('Report this error'));
    await user.click(screen.getByRole('button', { name: 'Submit report' }));
    expect(main().getByRole('status', { name: 'Error report result' })).toHaveTextContent('Your error report has been received. You can retry or go home.');
  });

  it('keeps retry and home ahead of reporting in DOM and sequential keyboard order', async () => {
    mount();
    const user = userEvent.setup();
    const retry = main().getByRole('button', { name: '다시 시도' });
    const home = main().getByRole('link', { name: '홈' });
    const report = entry();
    expect(retry.compareDocumentPosition(home) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(home.compareDocumentPosition(report) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    retry.focus();
    await user.tab();
    expect(home).toHaveFocus();
    await user.tab();
    expect(report).toHaveFocus();
  });

  it('still retries the contained screen and resolves the existing home destination', async () => {
    mount();
    expect(main().getByRole('link', { name: '홈' })).toHaveAttribute('href', '/mars/home?v=1');
    broken = false;
    await userEvent.setup().click(main().getByRole('button', { name: '다시 시도' }));
    expect(main().getByText('Recovered screen')).toBeVisible();
    expect(main().queryByRole('button', { name: '이 오류 신고' })).toBeNull();
  });
});
