import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, menuPermission } from '@ap/contracts';
import { manifests } from '../index';
import ImprovementItems from './ImprovementItems';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('offers registered accessible analysis menus with their declared names (FEA-11)', async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  Element.prototype.scrollIntoView = vi.fn();
  const source = { ...manifests[0]!, id: 'synthetic-analysis', path: '/synthetic-analysis', primary: true, group: groupId('test'), pageType: 'analysis' as const, label: { ko: '합성 분석', en: 'Synthetic analysis' } };
  const denied = { ...source, primary: false, id: 'denied-analysis', path: '/denied-analysis', label: { ko: '제한된 분석', en: 'Restricted analysis' }, additionalPermissions: [menuPermission('synthetic:read')] };
  const registry = createRegistry({ spaces: [testSpace({ homeMenuId: source.id })], groups: [{ id: groupId('test'), label: source.label, icon: source.icon, space: testSpace().id }, { id: groupId('improvementItems'), label: manifests[0]!.label, icon: manifests[0]!.icon, space: null }], menus: [...manifests, source, denied], permissions: [menuPermission('synthetic:read')] });
  window.history.replaceState(null, '', '/improvement-items?v=1&view=all');
  const session = testSession(['platform:view']);
  const adapter = testAdapter({ session: () => session, menuQuery: async () => ({ outcome: 'ok', data: { rows: [], total: 0 }, assessments: [], trust: null, correlationId: 'synthetic' }) });
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><ImprovementItems /></PlatformProvider></I18nProvider>);
  fireEvent.click(await screen.findByRole('button', { name: '필터 추가' }));
  fireEvent.click(within(await screen.findByRole('dialog', { name: '필터 추가' })).getByRole('button', { name: /^분석 출처/ }));
  const dialog = await screen.findByRole('dialog', { name: '분석 출처' });
  expect(within(dialog).getByText('합성 분석')).toBeTruthy();
  expect(within(dialog).queryByText('제한된 분석')).toBeNull();
  expect(within(dialog).queryByText('사이클타임 상세')).toBeNull();
});
