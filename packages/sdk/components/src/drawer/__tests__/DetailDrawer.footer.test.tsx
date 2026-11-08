import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { DetailDrawer } from '../DetailDrawer';

const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{
    id: 'home', primary: true, group: groupId('overview'), label: { ko: 'home', en: 'home' }, description: { ko: '', en: '' }, path: '/', icon: House,
    permission: 'platform:view' as const, requiresScope: false, context: noContext, pageType: 'overview' as const,
    features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [],
  }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function SlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}
const tree = (ui: ReactNode) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider>{ui}<SlotHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>;

describe('DetailDrawer optional footer', () => {
  it.each([1, 2])('keeps the footer outside the scroll body with %s tabs', async count => {
    render(tree(<DetailDrawer title="Details" onClose={() => {}} footer={<button>Save</button>}
      tabs={Array.from({ length: count }, (_, i) => ({ id: String(i), label: `Tab ${i}`, content: <button>Body {i}</button> }))} />));
    const save = await screen.findByRole('button', { name: 'Save' });
    const footer = save.parentElement!;
    const scroll = screen.getByRole(count === 1 ? 'region' : 'tabpanel');
    expect(scroll.contains(save)).toBe(false);
    expect(footer.className).toContain('shrink-0');
    expect(footer.parentElement).toBe(screen.getByRole('dialog'));
    fireEvent.scroll(scroll, { target: { scrollTop: 1000 } });
    expect(footer.previousElementSibling).toBe(count === 1 ? scroll : scroll.parentElement);
    if (count === 2) {
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'Tab 1' }), { button: 0, ctrlKey: false });
      expect(await screen.findByRole('button', { name: 'Body 1' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Save' })).toBe(save);
    }
  });

  it.each([1, 2])('preserves the DOM when footer is absent (%s tabs)', async count => {
    const tabs = Array.from({ length: count }, (_, i) => ({ id: String(i), label: `Tab ${i}`, content: <p>Body</p> }));
    const view = render(tree(<DetailDrawer title="Details" onClose={() => {}} tabs={tabs} />));
    await screen.findByText('Body');
    // Radix TabsContent draws `animation-duration: 0s` on its first mount and drops it on the first render after the next animation frame.
    // Whether that frame lands before the rerender below depends on machine load, so let it pass and render once with unchanged props first;
    // the snapshot then compares only what the footer prop could change.
    await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
    view.rerender(tree(<DetailDrawer title="Details" onClose={() => {}} tabs={tabs} />));
    const before = screen.getByRole('dialog').innerHTML;
    view.rerender(tree(<DetailDrawer title="Details" onClose={() => {}} tabs={tabs} footer={undefined} />));
    expect(screen.getByRole('dialog').innerHTML).toBe(before);
    expect(screen.getByRole('dialog').children).toHaveLength(4);
  });

  it('tabs from the body to footer actions and returns focus to the opener on close', async () => {
    function Example() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>Open</button>{open && <DetailDrawer title="Details" onClose={() => setOpen(false)}
        tabs={[{ id: 'a', label: 'Body', content: <button>Last body action</button> }]}
        footer={<><button>Save</button><button onClick={() => setOpen(false)}>Cancel</button></>} />}</>;
    }
    const user = userEvent.setup();
    render(tree(<Example />));
    await user.click(screen.getByRole('button', { name: 'Open' }));
    screen.getByRole('button', { name: 'Last body action' }).focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save' }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open' }));
  });
});
