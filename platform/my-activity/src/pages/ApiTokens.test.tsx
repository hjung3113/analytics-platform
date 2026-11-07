import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, usePlatform } from '@ap/kernel';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { resetFeatureSessionForTests } from '@ap/feature-bridge/testing';
import { json, mountAt, registry, TestRoutes, stubFetch, switchableAdapter } from '../feature/test-support';

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  resetFeatureSessionForTests(); });
afterEach(() => { cleanup(); setFeatureApi(null); resetFeatureSessionForTests(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('API token host bridge', () => {
  it('matches permission-requests in mock mode: no screen mount or requests', async () => {
    setFeatureApi(null);
    const calls = stubFetch(() => json({}));
    mountAt(switchableAdapter().adapter, '/tokens');
    expect(await screen.findByRole('heading', { name: 'API 토큰' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect(screen.queryByTestId('api-tokens')).toBeNull();
    expect(calls).toEqual([]);
  });
  it('places the issue action in the page head and the form in the shared detail slot', async () => {
    setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
    stubFetch(() => json({ items: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', kind: 'personal', name: '분석 스크립트', prefix: '12345678', scopes: ['workspace.read'], expiresAt: null, lastUsedAt: null, lastUsedIp: null, revokedAt: null, createdAt: '2026-11-07T00:00:00Z', createdBy: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', actorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', unusedWarning: false }], nextCursor: null }));
    const { container } = mountAt(switchableAdapter().adapter, '/tokens');
    const issue = await screen.findByRole('button', { name: '토큰 발급' });
    expect(container.querySelector('header [data-feature-primary-action]')?.contains(issue)).toBe(true);
    expect(await screen.findByRole('table', { name: '토큰 목록' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^표 크기:/ })).toBeTruthy();
    const user = userEvent.setup();
    await user.click(issue);
    expect(await screen.findByLabelText('토큰 이름')).toBeTruthy();
    expect(screen.getByRole('complementary', { name: '상세 패널' }).contains(screen.getByLabelText('토큰 이름'))).toBe(true);
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.queryByLabelText('토큰 이름')).toBeNull();
  });
  it.each(['Escape', '취소', 'confirmed'])('returns focus to the header trigger after %s (B4)', async mode => {
    setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
    stubFetch((_path, method) => method === 'POST' ? json({ token: `ap_12345678_${'s'.repeat(43)}`, item: tokenRow }, 201) : json({ items: [tokenRow], nextCursor: null }));
    mountAt(switchableAdapter().adapter, '/tokens');
    await screen.findByRole('table');
    const user = userEvent.setup(); const trigger = screen.getByRole('button', { name: '토큰 발급' });
    await user.click(trigger); await screen.findByLabelText('토큰 이름');
    if (mode === 'confirmed') {
      await user.type(screen.getByLabelText('토큰 이름'), '새 토큰');
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '토큰 발급' }));
      await screen.findByLabelText('토큰 값 · 한 번만 표시');
      await user.click(screen.getByRole('button', { name: '상세 닫기' }));
      await user.click(screen.getByRole('button', { name: '토큰 값 닫기' }));
    } else if (mode === 'Escape') await user.keyboard('{Escape}');
    else await user.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
  it('closes the one-time value through 완료 after 보관 is checked: confirmation, then the value is gone', async () => {
    setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
    stubFetch((_path, method) => method === 'POST' ? json({ token: `ap_12345678_${'s'.repeat(43)}`, item: tokenRow }, 201) : json({ items: [tokenRow], nextCursor: null }));
    mountAt(switchableAdapter().adapter, '/tokens');
    await screen.findByRole('table'); const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '토큰 발급' }));
    await user.type(await screen.findByLabelText('토큰 이름'), '새 토큰');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '토큰 발급' }));
    await screen.findByLabelText('토큰 값 · 한 번만 표시');
    const done = screen.getByRole('button', { name: '완료 · 토큰 값 닫기' });
    expect((done as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: '안전한 곳에 보관했습니다' }));
    expect((done as HTMLButtonElement).disabled).toBe(false);
    await user.click(done);
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '토큰 값 닫기' }));
    await waitFor(() => expect(screen.queryByLabelText('토큰 값 · 한 번만 표시')).toBeNull());
  });
  it('arms the host leave guard only while the one-time value is visible (B5)', async () => {
    setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
    stubFetch((_path, method) => method === 'POST' ? json({ token: `ap_12345678_${'s'.repeat(43)}`, item: tokenRow }, 201) : json({ items: [tokenRow], nextCursor: null }));
    window.history.replaceState(null, '', '/tokens');
    const Slot = () => { const slot = useDetailPanelSlotHost(); return <aside ref={slot.ref} />; };
    function NavigationProbe() {
      const { navigate } = usePlatform();
      return <button onClick={() => navigate('/permission-requests')}>다른 메뉴</button>;
    }
    render(<I18nProvider><PlatformProvider adapter={switchableAdapter().adapter} registry={registry}><DetailPanelSlotProvider><TestRoutes /><Slot /><NavigationProbe /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
    await screen.findByRole('table'); const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '토큰 발급' }));
    await user.type(await screen.findByLabelText('토큰 이름'), '새 토큰');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '토큰 발급' }));
    await screen.findByLabelText('토큰 값 · 한 번만 표시');
    const guardedUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(guardedUnload);
    expect(guardedUnload.defaultPrevented).toBe(true);
    await user.click(screen.getByRole('button', { name: '다른 메뉴' }));
    expect(location.pathname).toBe('/tokens');
    await user.click(screen.getByRole('button', { name: '상세 닫기' }));
    await user.click(screen.getByRole('button', { name: '토큰 값 닫기' }));
    await user.click(screen.getByRole('button', { name: '다른 메뉴' }));
    await waitFor(() => expect(location.pathname).toBe('/permission-requests'));
    const cleanUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanUnload);
    expect(cleanUnload.defaultPrevented).toBe(false);
  });

});

const tokenRow = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', kind: 'personal', name: '분석 스크립트', prefix: '12345678', scopes: ['workspace.read'], expiresAt: null, lastUsedAt: null, lastUsedIp: null, revokedAt: null, createdAt: '2026-11-07T00:00:00Z', createdBy: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', actorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', unusedWarning: false };
