import { act, cleanup, render } from '@testing-library/react';
import { House } from 'lucide-react';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { I18nProvider } from '../../i18n';
import { createRegistry } from '../../registry/registry';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '../../testing';
import type { PageFocus } from '../../context/pageNavigation';
import { PlatformProvider, useHostPlatform, useOverlayState } from '../platform';
import { useArrivalFocus } from '../useArrivalFocus';

const features = { export: false, savedView: false, annotate: false, compare: false };
const menu = (id: string, path: string, permission: 'platform:view' | 'console:access' = 'platform:view') => ({
  id, group: groupId('g'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission,
  requiresScope: false, context: noContext, pageType: 'overview' as const, features, pageKeys: [],
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('g'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('mars') }],
  menus: [{ ...menu('home', '/home'), primary: true }, menu('other', '/other'), menu('denied', '/denied', 'console:access')],
});

let platform: ReturnType<typeof useHostPlatform>;
let overlay: ReturnType<typeof useOverlayState>;
let setReread: (value: number) => void;
let setEnabled: (value: boolean) => void;
const arrivals: { label: string; request: PageFocus }[] = [];

function Screen({ label }: { label: string }) {
  platform = useHostPlatform();
  overlay = useOverlayState();
  const [rereadKey, reread] = useState(0);
  const [enabled, enable] = useState(true);
  setReread = reread;
  setEnabled = enable;
  // A new closure every render: the latest one must run, without a re-subscription per render.
  useArrivalFocus(request => { arrivals.push({ label, request }); }, { enabled, rereadKey });
  return null;
}

function mount(strict = false) {
  window.history.replaceState(null, '', '/mars/home?v=1');
  const session = testSession(['platform:view']);
  const tree = <I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Screen label="screen" /></PlatformProvider></I18nProvider>;
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

/** Navigates while the navigation dialog holds the focus gate; returns its release. */
function navigateBehindDialog(href: string) {
  act(() => { platform.setPaletteOpen(true); });
  const session = overlay.paletteSession!;
  const owner = Symbol('dialog');
  act(() => { session.claim(owner); platform.setPaletteOpen(false); platform.navigate(href, { focus: 'page' }); });
  return () => act(() => { session.release(owner); });
}

beforeEach(() => {
  arrivals.length = 0;
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('useArrivalFocus (06 §26, #2001 F1)', () => {
  it('hands an explicit arrival to the screen once, and a direct load or same-path change hands nothing', () => {
    mount();
    expect(arrivals).toEqual([]);
    act(() => { platform.navigate('/mars/other?v=1', { focus: 'page' }); });
    expect(arrivals).toEqual([{ label: 'screen', request: 'page' }]);
    act(() => { platform.navigate('/mars/other?v=1&x=1'); });
    act(() => { setReread(1); });
    expect(arrivals).toHaveLength(1);
  });

  it('a disabled screen consumes nothing', () => {
    mount();
    act(() => { setEnabled(false); });
    act(() => { platform.navigate('/mars/other?v=1', { focus: 'page' }); });
    expect(arrivals).toEqual([]);
  });

  it('reads a gated arrival again when the dialog releases it', () => {
    mount();
    const release = navigateBehindDialog('/mars/other?v=1');
    expect(arrivals).toEqual([]);
    release();
    expect(arrivals).toEqual([{ label: 'screen', request: 'page' }]);
  });

  it.each([
    ['a StrictMode replay', true, false],
    ['a re-read of its own (same screen, new subscription)', false, true],
  ])('keeps a blocked screen\'s kept arrival through %s', (_case, strict, reread) => {
    mount(strict);
    const release = navigateBehindDialog('/mars/denied?v=1');
    expect(arrivals).toEqual([]);
    if (reread) act(() => { setReread(1); });
    release();
    expect(arrivals).toEqual([{ label: 'screen', request: 'page' }]);
  });
});
