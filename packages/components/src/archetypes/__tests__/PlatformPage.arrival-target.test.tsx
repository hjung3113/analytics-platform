import { act, cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform, type PlatformMenuEntry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { PlatformPage } from '../PlatformPage';

const features = { export: false, savedView: false, annotate: false, compare: false };
const entry = (id: string, path: string, label: string): PlatformMenuEntry => ({
  id, path, group: groupId('overview'), label: { ko: label, en: label }, description: { ko: '', en: '' }, icon: House,
  permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features, pageKeys: [], ...(id === 'home' ? { primary: true } : {}),
});
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }],
  menus: [entry('home', '/', '홈'), entry('target', '/target', '대상')],
});

const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });

const seen: { platform: ReturnType<typeof usePlatform> } = { platform: undefined as never };
function Probe() { seen.platform = usePlatform(); return null; }

function mount(arrivalTarget?: () => HTMLElement | null) {
  window.history.replaceState(null, '', '/?v=1');
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <main id="platform-main" tabIndex={-1}><Probe />
      <Page arrivalTarget={arrivalTarget} />
    </main>
  </PlatformProvider></I18nProvider>);
}
function Page({ arrivalTarget }: { arrivalTarget?: () => HTMLElement | null }) {
  const { route } = usePlatform();
  return route?.menu.id === 'target'
    ? <PlatformPage arrivalTarget={arrivalTarget}><button type="button">registered</button></PlatformPage>
    : <p>home</p>;
}

beforeEach(() => { Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('PlatformPage arrivalTarget', () => {
  it('lands page arrival on the registered element instead of the heading', () => {
    mount(() => screen.queryByRole('button', { name: 'registered' }));
    act(() => seen.platform.navigate('/target?v=1', { focus: 'page' }));
    expect(screen.getByRole('button', { name: 'registered' })).toHaveFocus();
  });

  it('lands on the heading when no target is registered', () => {
    mount(() => null);
    act(() => seen.platform.navigate('/target?v=1', { focus: 'page' }));
    expect(screen.getByRole('heading', { level: 1, name: '대상' })).toHaveFocus();
  });
});
