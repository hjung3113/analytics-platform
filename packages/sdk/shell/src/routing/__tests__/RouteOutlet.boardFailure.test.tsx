import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, type PlatformMenuEntry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { PlatformPage } from '@ap/components';
import { RouteOutlet } from '../RouteOutlet';
import { resetBoardPresentationForTests, useBoardPresentation } from '../../board/boardPresentation';

// #1876: the board host fails to render while it is a window (floating) or minimized; only the really minimized board may draw nothing.
vi.mock('../../board/BoardHost', () => ({
  BoardHost: ({ display }: { display: string }) => { if (display !== 'maximized') throw new Error('fixture board failure'); return <p>board ok</p>; },
}));

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('equipment'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view' as const,
    requiresScope: false, context: noContext, pageType: 'analysis' as const, features, pageKeys: [], component: (() => <PlatformPage><p>page body</p></PlatformPage>) as unknown as PlatformMenuEntry['component'] }],
});

function Probe() {
  const board = useBoardPresentation();
  return <>
    <button type="button" onClick={() => board.open()}>probe-open</button>
    <button type="button" onClick={() => board.toWindow('')}>probe-window</button>
    <button type="button" onClick={() => board.minimize('')}>probe-minimize</button>
  </>;
}

beforeEach(() => {
  resetBoardPresentationForTests();
  vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage());
  vi.spyOn(console, 'error').mockImplementation(() => {});
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  window.history.replaceState(null, '', '/');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('board host failure keeps a way back (#1876)', () => {
  it('a failing window board shows a retry; a failing minimized board draws nothing', async () => {
    const session = testSession(['platform:view']);
    render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })}><Probe /><RouteOutlet /></PlatformProvider></I18nProvider>);
    fireEvent.click(screen.getByText('probe-open'));
    expect(await screen.findByText('board ok')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByText('probe-window')); });
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByText('probe-minimize')); });
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
    expect(screen.getByText('page body')).toBeInTheDocument();
  });
});
