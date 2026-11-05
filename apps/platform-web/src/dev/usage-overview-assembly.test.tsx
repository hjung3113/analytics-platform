import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { createAssembly, type Assembly } from '#platform-assembly';
import { getRole, setRole } from '@ap/mock-server';
import { AppRoot } from '../app-root';
import { registry } from '../menus';
import { spaceSystems } from '../space-systems';

async function mountAt(url: string) {
  const assembly = await createAssembly({ registry }) as Assembly;
  window.history.replaceState(null, '', url);
  render(<I18nProvider><AppRoot assembly={assembly} queryHistory={undefined as never} location={undefined} makeSlots={() => ({})} /></I18nProvider>);
}

const previousRole = getRole();
beforeEach(() => {
  spaceSystems.reset();
  for (const name of ['localStorage', 'sessionStorage']) {
    const values = new Map<string, string>();
    vi.stubGlobal(name, { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } });
  }
  setRole('admin');
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(() => { cleanup(); spaceSystems.reset(); setRole(previousRole); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('admin usage in the real AppRoot assembly (#605 FIXB)', () => {
  it('renders a populated usage drawer with no test-only TooltipProvider', async () => {
    await mountAt('/operations/admin-usage?focus=admin-audit');
    const drawer = await screen.findByRole('dialog', { name: '변경 감사' }, { timeout: 10_000 });
    await within(drawer).findByText(/본 화면 진입 \d+건/, {}, { timeout: 10_000 });
    expect(within(drawer).getByRole('button', { name: '이후 메뉴 이동 없음' })).toBeTruthy();
    expect(within(drawer).getByRole('list', { name: '다음으로 간 화면 순위' })).toBeTruthy();
    expect(screen.queryByText('이 화면에서 오류가 발생했습니다')).toBeNull();
  }, 30_000);

  // Characterization of the shared initial-URL policy, not the desired keyboard behavior.
  // Not implemented here: see .planning/backlog.md, #605 FIXB shared arrival focus.
  it.each([
    ['/operations/admin-usage?focus=chart-catalog', '차트 카탈로그'],
    ['/operations/admin-roles?focus=admin', 'Platform Admin'],
  ])('records the shared initial-focus limitation at %s (Escape outside the drawer does not close)', async (url, title) => {
    await mountAt(url);
    const drawer = await screen.findByRole('dialog', { name: title }, { timeout: 10_000 });
    if (url.includes('admin-usage')) await within(drawer).findByText(/기록된 진입이 없습니다|이 메뉴는 이동 경로를 공개하지 않습니다/);
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(new URLSearchParams(window.location.search).get('focus')).toBe(new URL(url, 'http://test').searchParams.get('focus'));
    expect(drawer.isConnected).toBe(true);
    fireEvent.click(within(drawer).getByRole('button', { name: '상세 닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  }, 30_000);
});
