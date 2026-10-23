import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PaneScreenProvider, PlatformProvider, createRegistry, useDrill, type PaneScreen } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { DrillLayout, ReturnLink } from './DrillLayout';
import { PlatformPage } from './PlatformPage';
import { groupId, spaceId } from '@ap/contracts';

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const keys = ['drillRoom', 'drillStgroup'] as const;
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'source' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }],
  menus: [{
    id: 'source', group: groupId('overview'), primary: true, label: { ko: '생산성 개요', en: 'Productivity overview' }, description: { ko: '', en: '' }, path: '/source',
    icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features, pageKeys: [...keys], contextResetKeys: [...keys],
    drill: { levels: [{ key: 'drillRoom', label: { ko: '공정', en: 'Process' } }, { key: 'drillStgroup', label: { ko: 'StGroup', en: 'StGroup' } }] },
  }],
});
const siblings = { drillRoom: [{ value: 'PHOTO' }, { value: 'ETCH' }] };

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
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

// D1 (#497): at four levels the middle steps sit in a dropdown. Choosing one drops the depth, so the `…` trigger unmounts
// before Radix's close autofocus runs; the lookup must still stay inside the pane that owns the path bar.
const deepKeys = ['drillA', 'drillB', 'drillC', 'drillD'] as const;
const deepRegistry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'deep' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }],
  menus: [{
    id: 'deep', group: groupId('overview'), primary: true, label: { ko: '깊은 드릴', en: 'Deep drill' }, description: { ko: '', en: '' }, path: '/deep',
    icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features, pageKeys: [...deepKeys], contextResetKeys: [...deepKeys],
    drill: { levels: deepKeys.map((key, index) => ({ key, label: { ko: `단계${index + 1}`, en: `Step ${index + 1}` } })) },
  }],
});
function DeepBody() {
  return <DrillLayout><span>body</span></DrillLayout>;
}
function DeepPane({ id, initial }: { id: string; initial: PaneScreen }) {
  const [state, setState] = useState(initial);
  return <div data-pane-id={id} data-testid={id} tabIndex={-1}>
    <PaneScreenProvider paneId={id} screen={state} onChange={next => setState(next)} onLeave={() => {}}><PlatformPage><DeepBody /></PlatformPage></PaneScreenProvider>
  </div>;
}

describe('collapsed middle dropdown inside a board pane (#497 D1)', () => {
  function mountDeep(ui: ReactNode) {
    // Main sits earlier in the document and is also at a step, so a document-wide lookup would take its chip.
    window.history.replaceState(null, '', '/deep?drillA=M1');
    const session = testSession(['platform:view']);
    return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={deepRegistry}>
      <main tabIndex={-1}><PlatformPage><DeepBody /></PlatformPage>{ui}</main></PlatformProvider></I18nProvider>);
  }

  it('choosing a middle step focuses that pane\'s own current step, not main\'s', async () => {
    mountDeep(<DeepPane id="a" initial={{ menuId: 'deep', params: {}, query: '?drillA=A&drillB=B&drillC=C&drillD=D' }} />);
    const a = screen.getByTestId('a');
    openMenu('가운데 단계', a);
    fireEvent.click(await screen.findByRole('menuitem', { name: '단계1: A' }));
    await settle();
    expect(within(a).queryByRole('button', { name: '가운데 단계' })).toBeNull();
    expect(within(a).getByRole('button', { name: '단계1: A' })).toHaveFocus();
  });
});

describe('ReturnLink inside a board pane (#497)', () => {
  const returnRegistry = createRegistry({
    spaces: [testSpace({ homeMenuId: 'source' })],
    groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }],
    menus: [
      { id: 'source', group: groupId('overview'), primary: true, label: { ko: '출발 화면', en: 'Source' }, description: { ko: '', en: '' }, path: '/source',
        icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features, pageKeys: [] },
      { id: 'target', group: groupId('overview'), label: { ko: '도착 화면', en: 'Target' }, description: { ko: '', en: '' }, path: '/target',
        icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features, pageKeys: ['returnTo'] },
    ],
  });
  function ReturnPane({ id, initial }: { id: string; initial: PaneScreen }) {
    const [state, setState] = useState(initial);
    return <div data-pane-id={id} data-testid={id} tabIndex={-1}>
      <PaneScreenProvider paneId={id} screen={state} onChange={next => setState(next)} onLeave={() => {}}><PlatformPage><ReturnLink /></PlatformPage></PaneScreenProvider>
    </div>;
  }

  it('after the return the pane root takes the focus, not main or a sibling pane', async () => {
    window.history.replaceState(null, '', '/source');
    const session = testSession(['platform:view']);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={returnRegistry}>
      <main tabIndex={-1}><PlatformPage><span>main</span></PlatformPage>
        <ReturnPane id="a" initial={{ menuId: 'target', params: {}, query: '?returnTo=%2Fsource' }} />
        <ReturnPane id="b" initial={{ menuId: 'target', params: {}, query: '?returnTo=%2Fsource' }} />
      </main></PlatformProvider></I18nProvider>);
    const b = screen.getByTestId('b');
    const link = within(b).getByRole('link', { name: '← 출발 화면' });
    link.focus();
    fireEvent.click(link);
    await settle();
    expect(b).toHaveFocus();
  });
});
