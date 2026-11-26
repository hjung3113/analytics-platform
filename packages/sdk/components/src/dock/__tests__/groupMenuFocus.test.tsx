import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkspaceGroupActions } from '../../workspace/WorkspaceGroupActions';
import { keepGroupMenuFocus } from '../focusTab';
import { column, group, installResizeObserver, mountDock, row } from './harness';

let observer: ReturnType<typeof installResizeObserver>;
beforeEach(() => { observer = installResizeObserver(); });
afterEach(() => { cleanup(); observer.restore(); });

const menuOf = (title: string) => {
  const tab = screen.getByRole('tab', { name: title });
  return within(tab.closest<HTMLElement>('.dv-tabs-and-actions-container')!).getByRole('button', { name: `${title} 동작` });
};

function mountTwo() {
  return mountDock({
    layout: row([50, 50], group(['a']), group(['b'])),
    props: {
      renderGroupActions: actions => <WorkspaceGroupActions title={`패널 ${actions.active}`} titleOf={id => id}
        closeFocus={{ current: null }} menu={{ maximized: false, split: null, moves: [] }}
        onMaximize={vi.fn()} onSplit={vi.fn()} onMove={vi.fn()} />,
    },
  });
}

// #3140: a rebuild replaces each group header. A ⋯ that a caller handed focus back to (panel settings) keeps it: the new ⋯ of the same group.
it('moves focus from a claimed group ⋯ removed by a rebuild to the same group\'s new ⋯', async () => {
  const { controls } = mountTwo();
  await screen.findByRole('tab', { name: '패널 b' });
  const before = await waitFor(() => menuOf('패널 b'));
  before.focus();
  const layout = before.closest('[data-dock-layout]');
  expect(keepGroupMenuFocus(before, layout, 'b', vi.fn())).toBe(true);
  controls.setLayout(column([50, 50], group(['b']), group(['a'])));
  expect(before.isConnected).toBe(false);
  await waitFor(() => { expect(menuOf('패널 b')).toHaveFocus(); });
});

// Unclaimed, the engine stops at the group's tab: a host may treat focus in a group header as choosing that group (the board's pane head).
it('leaves an unclaimed removed ⋯ on its group\'s tab', async () => {
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
