import { cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { DetailPanelSlotProvider, Popover, PopoverContent, PopoverTrigger, SurfacePauseScope, useDetailPanelSlotHost } from '@ap/ui';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { DetailDrawer } from './DetailDrawer';

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }],
  menus: [{ id: 'home', group: groupId('overview'), label: { ko: 'home', en: 'home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view' as const,
    requiresScope: false, context: { ...noContext, time: 'apply' as const }, pageType: 'overview' as const, features, pageKeys: [], primary: true }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function SlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" data-open={String(slot.open)} />;
}
const content = <><p>attr</p><Popover defaultOpen><PopoverTrigger>menu</PopoverTrigger><PopoverContent>popover body</PopoverContent></Popover></>;
const drawer = (paused: boolean, mounted = true) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider>
  <button type="button">opener</button>
  <SurfacePauseScope paused={paused}>{mounted && <DetailDrawer title="Detail" onClose={() => {}} tabs={[{ id: 'a', label: 'A', content }]} />}</SurfacePauseScope>
  <SlotHost />
</DetailPanelSlotProvider></PlatformProvider></I18nProvider>;

describe('DetailDrawer under a paused surface (ADR-0088)', () => {
  it('S2: the slot reports closed, and the drawer\'s own transient UI (a popover) closes, though it is detached from its pane\'s scope', () => {
    const view = render(drawer(false));
    expect(screen.getByText('popover body')).toBeInTheDocument();
    view.rerender(drawer(true));
    expect(screen.getByLabelText('상세 패널', { selector: 'aside' })).toHaveAttribute('data-open', 'false');
    expect(screen.queryByText('popover body')).toBeNull();
    // Mounted, not unmounted: resuming does not rebuild the panel.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('S2: a drawer mounted while paused does not claim focus', () => {
    render(drawer(true));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상세 닫기' })).not.toHaveFocus();
  });

  it('S2: a drawer that closes while paused does not hand focus back into the screen in front; unpaused it does', () => {
    const cases = [[false, true], [true, false]] as const;
    for (const [paused, restored] of cases) {
      const view = render(drawer(paused, false));
      const opener = screen.getByRole('button', { name: 'opener' });
      opener.focus();
      view.rerender(drawer(paused));
      screen.getByRole('button', { name: '상세 닫기' }).focus();
      expect(screen.getByRole('button', { name: '상세 닫기' })).toHaveFocus();
      view.rerender(drawer(paused, false));
      expect(document.activeElement === opener).toBe(restored);
      view.unmount();
      cleanup();
    }
  });
});
