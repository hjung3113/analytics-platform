import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PaneScreenProvider, PlatformProvider, createRegistry, useDrill, type PaneScreen } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { DrillLayout } from './DrillLayout';
import { PlatformPage } from './PlatformPage';

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const keys = ['drillRoom', 'drillStgroup'] as const;
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'source' })],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{
    id: 'source', group: 'overview', primary: true, label: { ko: '생산성 개요', en: 'Productivity overview' }, description: { ko: '', en: '' }, path: '/source',
    icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features, pageKeys: [...keys], contextResetKeys: [...keys],
    drill: { levels: [{ key: 'drillRoom', label: { ko: '공정', en: 'Process' } }, { key: 'drillStgroup', label: { ko: 'StGroup', en: 'StGroup' } }] },
  }],
});
const siblings = { drillRoom: [{ value: 'PHOTO' }, { value: 'ETCH' }] };

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); }, clear: () => data.clear(), key: () => null, get length() { return data.size; },
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 30)));
function openMenu(name: string, within_: HTMLElement) {
  const trigger = within(within_).getByRole('button', { name });
  act(() => { trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })); });
}

function Body() {
  const drill = useDrill();
  return <DrillLayout siblings={siblings}><button onClick={() => drill.enter('drillRoom', 'PHOTO')}>enter</button></DrillLayout>;
}
function Pane({ id, initial }: { id: string; initial: PaneScreen }) {
  const [state, setState] = useState(initial);
  return <div data-pane-id={id} data-testid={id} tabIndex={-1}>
    <PaneScreenProvider paneId={id} screen={state} onChange={next => setState(next)} onLeave={() => {}}><PlatformPage><Body /></PlatformPage></PaneScreenProvider>
  </div>;
}
function mount(ui: ReactNode) {
  window.history.replaceState(null, '', '/source?drillRoom=ZZ');
  const session = testSession(['platform:view']);
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}>
    <main tabIndex={-1}><PlatformPage><Body /></PlatformPage>{ui}</main></PlatformProvider></I18nProvider>);
}
const paneAt = (query: string) => ({ menuId: 'source', params: {}, query });

describe('explicit drill focus inside board panes (ADR-0049)', () => {
  it('drill enter focuses the current step of the owning pane, not main or a sibling pane that is also at a step', async () => {
    mount(<><Pane id="a" initial={paneAt('')} /><Pane id="b" initial={paneAt('?drillRoom=ETCH')} /></>);
    const a = screen.getByTestId('a');
    within(a).getByRole('button', { name: 'enter' }).focus();
    fireEvent.click(within(a).getByRole('button', { name: 'enter' }));
    await settle();
    expect(within(a).getByRole('button', { name: '공정: PHOTO' })).toHaveFocus();
  });

  it('a sibling switch focuses the changed pane step even though main and the other pane have a step earlier or later in the document', async () => {
    mount(<><Pane id="a" initial={paneAt('?drillRoom=PHOTO')} /><Pane id="b" initial={paneAt('?drillRoom=ETCH')} /></>);
    const b = screen.getByTestId('b');
    openMenu('공정 바꾸기', b);
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /PHOTO/ }));
    await settle();
    expect(within(b).getByRole('button', { name: '공정: PHOTO' })).toHaveFocus();
  });

  it('goTo(0) with no step left lands on the pane root, not main', async () => {
    mount(<Pane id="a" initial={paneAt('?drillRoom=PHOTO')} />);
    const a = screen.getByTestId('a');
    within(a).getByRole('button', { name: '공정: PHOTO' }).focus();
    fireEvent.click(within(a).getByRole('button', { name: '전체' }));
    await settle();
    expect(a).toHaveFocus();
  });
});
