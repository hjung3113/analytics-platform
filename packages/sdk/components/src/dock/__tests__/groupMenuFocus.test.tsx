import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { WorkspaceGroupActions } from '../../workspace/WorkspaceGroupActions';
import { DockLayoutBase } from '../DockLayout';
import type { DockFloating, DockLayoutProps, DockPanel } from '../dockTypes';
import { returnToGroupMenu } from '../focusTab';
import { column, group, installResizeObserver, mountDock, row } from './harness';

let observer: ReturnType<typeof installResizeObserver>;
beforeEach(() => { observer = installResizeObserver(); });
afterEach(() => { cleanup(); observer.restore(); });

const menuOf = (title: string) => {
  const tab = screen.getByRole('tab', { name: title });
  return within(tab.closest<HTMLElement>('.dv-tabs-and-actions-container')!).getByRole('button', { name: `${title} 동작` });
};

const groupActions: DockLayoutProps['renderGroupActions'] = actions => <WorkspaceGroupActions title={`패널 ${actions.active}`} titleOf={id => id}
  closeFocus={{ current: null }} menu={{ maximized: false, split: null, moves: [] }}
  onMaximize={vi.fn()} onSplit={vi.fn()} onMove={vi.fn()} />;

function mountTwo() {
  return mountDock({ layout: row([50, 50], group(['a']), group(['b'])), props: { renderGroupActions: groupActions } });
}

// #3166, the cause of #3140: a workspace turns floating off below its narrow width, and a drawer opening beside it crosses that width. With
// nothing floating, that is the same engine tree, so the groups and their headers stay: the ⋯ that opened the drawer is still there to return to.
it('rebuilds nothing when floating turns off with nothing floating', async () => {
  const panels: DockPanel[] = ['a', 'b'].map(id => ({ id, title: `패널 ${id}`, render: () => <div>{id}</div> }));
  const floating: DockFloating = { panels: [], onChange: vi.fn(), onDismissPeek: vi.fn() };
  const layout = row([50, 50], group(['a']), group(['b']));
  const view = (props: { floating?: DockFloating }) => <I18nProvider><DockLayoutBase panels={panels} layout={layout} maximizedPanelId={null}
    onLayoutChange={vi.fn()} onActivate={vi.fn()} onMaximizedChange={vi.fn()} label="테스트 배치" minPanelSize={{ width: 20, height: 20 }} separatorLabel={({ dir }) => dir}
    renderGroupActions={groupActions} {...props} /></I18nProvider>;
  const { rerender } = render(view({ floating }));
  const before = await waitFor(() => menuOf('패널 b'));
  rerender(view({}));
  rerender(view({ floating }));
  expect(before.isConnected).toBe(true);
});

// A header drawn again while the drawer was open (a changed title) still takes focus back: the same group's current ⋯.
it('returns focus to the same group\'s current ⋯ when the trigger was drawn again', async () => {
  const { controls } = mountTwo();
  const before = await waitFor(() => menuOf('패널 b'));
  const layout = before.closest('[data-dock-layout]')!;
  controls.setLayout(column([50, 50], group(['b']), group(['a'])));
  expect(before.isConnected).toBe(false);
  const after = await waitFor(() => menuOf('패널 b'));
  expect(returnToGroupMenu(before, layout, 'b')).toBe(true);
  expect(after).toHaveFocus();
  expect(returnToGroupMenu(before, layout, 'missing')).toBe(false);
});

// Closing the drawer can widen the workspace past its compact width: the rebuild that follows hands focus on to the claimed group's new ⋯.
it('moves focus from a claimed group ⋯ removed by a rebuild to the same group\'s new ⋯', async () => {
  const { controls } = mountTwo();
  const before = await waitFor(() => menuOf('패널 b'));
  expect(returnToGroupMenu(before, before.closest('[data-dock-layout]')!, 'b')).toBe(true);
  expect(before).toHaveFocus();
  controls.setLayout(column([50, 50], group(['b']), group(['a'])));
  expect(before.isConnected).toBe(false);
  await waitFor(() => { expect(menuOf('패널 b')).toHaveFocus(); });
});

// The user's own move ends the claim: a later rebuild leaves focus on the group's tab.
it('ends the claim at the user\'s next focus move', async () => {
  const { controls } = mountTwo();
  const before = await waitFor(() => menuOf('패널 b'));
  returnToGroupMenu(before, before.closest('[data-dock-layout]')!, 'b');
  menuOf('패널 a').focus();
  menuOf('패널 b').focus();
  controls.setLayout(column([50, 50], group(['b']), group(['a'])));
  await waitFor(() => { expect(screen.getByRole('tab', { name: '패널 b' })).toHaveFocus(); });
  await new Promise(resolve => { setTimeout(resolve, 120); });
  expect(screen.getByRole('tab', { name: '패널 b' })).toHaveFocus();
});

// Unclaimed, the engine stops at the group's tab: a host may treat focus in a group header as choosing that group (the board's pane head).
it('leaves a removed ⋯ on its group\'s tab', async () => {
  const { controls } = mountTwo();
  await screen.findByRole('tab', { name: '패널 b' });
  const before = await waitFor(() => menuOf('패널 b'));
  before.focus();
  controls.setLayout(column([50, 50], group(['b']), group(['a'])));
  expect(before.isConnected).toBe(false);
  await waitFor(() => { expect(screen.getByRole('tab', { name: '패널 b' })).toHaveFocus(); });
  await new Promise(resolve => { setTimeout(resolve, 120); });
  expect(screen.getByRole('tab', { name: '패널 b' })).toHaveFocus();
});
