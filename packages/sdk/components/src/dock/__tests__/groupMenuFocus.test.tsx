import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkspaceGroupActions } from '../../workspace/WorkspaceGroupActions';
import { column, group, installResizeObserver, mountDock, row } from './harness';

let observer: ReturnType<typeof installResizeObserver>;
beforeEach(() => { observer = installResizeObserver(); });
afterEach(() => { cleanup(); observer.restore(); });

const menuOf = (title: string) => {
  const tab = screen.getByRole('tab', { name: title });
  return within(tab.closest<HTMLElement>('.dv-tabs-and-actions-container')!).getByRole('button', { name: `${title} 동작` });
};

// #3140: a rebuild of the groups replaces each group header; a focused ⋯ hands focus to the same group's new ⋯, not to the first tab.
it('moves focus from a group ⋯ removed by a rebuild to the same group\'s new ⋯', async () => {
  const { controls } = mountDock({
    layout: row([50, 50], group(['a']), group(['b'])),
    props: {
      renderGroupActions: actions => <WorkspaceGroupActions title={`패널 ${actions.active}`} titleOf={id => id}
        closeFocus={{ current: null }} menu={{ maximized: false, split: null, moves: [] }}
        onMaximize={vi.fn()} onSplit={vi.fn()} onMove={vi.fn()} />,
    },
  });
  await screen.findByRole('tab', { name: '패널 b' });
  const before = await waitFor(() => menuOf('패널 b'));
  before.focus();
  controls.setLayout(column([50, 50], group(['b']), group(['a'])));
  expect(before.isConnected).toBe(false);
  await waitFor(() => { expect(menuOf('패널 b')).toHaveFocus(); });
});
