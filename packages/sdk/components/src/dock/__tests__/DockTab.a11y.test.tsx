import { useState, type ComponentProps } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DockviewApi } from 'dockview-react';
import { I18nProvider } from '@ap/kernel';
import { DockLayout } from '../DockLayout';
import type { DockNode } from '../schema';
import { group, installResizeObserver, row } from './harness';

// The engine's api is not part of `DockLayout`; the move tests take it from the engine's own `onReady`.
const engineApi: { current: DockviewApi | null } = { current: null };
vi.mock('dockview-react', async importOriginal => {
  const original = await importOriginal<typeof import('dockview-react')>();
  const Engine = original.DockviewReact;
  return { ...original, DockviewReact: (props: ComponentProps<typeof Engine>) => <Engine {...props} onReady={event => { engineApi.current = event.api; props.onReady(event); }} /> };
});

const observer = installResizeObserver();
beforeAll(() => { observer.resize(900, 600); });
afterAll(() => { observer.restore(); });
afterEach(() => { cleanup(); engineApi.current = null; });

const panels = ['a', 'b', 'c'].map(id => ({ id, title: `패널 ${id}`, render: () => <p>content {id}</p> }));
const tabA11y = (id: string) => (id === 'a' ? { description: '편집 대상', keyShortcuts: 'Shift+F10' } : undefined);
let setLayout: (next: DockNode) => void = () => {};
function Host() {
  const [layout, set] = useState<DockNode>(row([50, 50], group(['a', 'b'], 'a'), group(['c'])));
  setLayout = set;
  return <DockLayout panels={panels} layout={layout} maximizedPanelId={null} onLayoutChange={set} onActivate={() => {}} onMaximizedChange={() => {}}
    separatorLabel={() => 'sep'} label="테스트 배치" minPanelSize={{ width: 20, height: 20 }} tabA11y={tabA11y} />;
}

/** What `findByRole('tab', { name })` sees: a MutationObserver callback after a task's mutations, with no `act` flushing React's queued work. */
function sightings(id: string) {
  const seen: { element: HTMLElement; named: boolean; described: boolean }[] = [];
  const look = () => {
    const tab = document.querySelector<HTMLElement>(`[role="tab"][data-tab-panel-id="${id}"]`);
    if (tab) seen.push({ element: tab, named: (tab.textContent ?? '').includes(`패널 ${id}`), described: tab.hasAttribute('aria-description') });
  };
  const mutations = new MutationObserver(look);
  mutations.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  return { seen, stop: () => { mutations.disconnect(); } };
}

describe('dock tab aria-description vs. the moment the tab can be found (#777)', () => {
  it('a tab the engine rebuilds in a reconcile can be found by name a render before its description is set again, then gets both attributes', async () => {
    const flag = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const incoming = 'IS_REACT_ACT_ENVIRONMENT' in flag ? { value: flag.IS_REACT_ACT_ENVIRONMENT } : null;
    const watch = sightings('a');
    flag.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      render(<I18nProvider><Host /></I18nProvider>);
      const before = await screen.findByRole('tab', { name: '패널 a' });
      await waitFor(() => { expect(before).toHaveAttribute('aria-description', '편집 대상'); });
      watch.seen.length = 0;
      setLayout(row([50, 50], group(['a']), group(['b', 'c'], 'b')));
      await waitFor(() => { expect(document.querySelectorAll('[role="tablist"]')).toHaveLength(2); });
      // Looked up inside the wait: a lookup right after the layout change can still return the old tab, which the reconcile then detaches.
      await waitFor(() => { expect(before).not.toBeInTheDocument(); });
      await waitFor(() => { expect(screen.getByRole('tab', { name: '패널 a' })).toHaveAttribute('aria-description', '편집 대상'); });
      expect(screen.getByRole('tab', { name: '패널 a' })).toHaveAttribute('aria-keyshortcuts', 'Shift+F10');
      // The rebuilt tab was findable by name while it still had no description: the engine put the content into the new tab element at once, and
      // DockTab sets the attributes only when the reconcile it counts has committed (a later render). The product ends right; a test must wait.
      expect(watch.seen.some(sighting => sighting.element !== before && sighting.named && !sighting.described)).toBe(true);
    } finally {
      watch.stop();
      if (incoming) flag.IS_REACT_ACT_ENVIRONMENT = incoming.value; else delete flag.IS_REACT_ACT_ENVIRONMENT;
    }
  });
});

describe('dock tab extras after the engine itself moves a tab (#777)', () => {
  const moves: [string, (api: DockviewApi) => void][] = [
    ['into another group', api => { api.getPanel('a')!.api.moveTo({ group: api.getPanel('c')!.group }); }],
    ['to a new position in its own group', api => { api.getPanel('a')!.api.moveTo({ group: api.getPanel('a')!.group, index: 1 }); }],
    ['into a new split', api => { api.getPanel('a')!.api.moveTo({ group: api.getPanel('c')!.group, position: 'bottom' }); }],
    ['across a maximize and its restore', api => { api.getPanel('a')!.api.maximize(); api.getPanel('a')!.api.exitMaximized(); }],
  ];
  it.each(moves)('an accepted native move %s leaves the tab with both attributes', async (_name, move) => {
    render(<I18nProvider><Host /></I18nProvider>);
    const before = await screen.findByRole('tab', { name: '패널 a' });
    await waitFor(() => { expect(before).toHaveAttribute('aria-description', '편집 대상'); });
    act(() => { move(engineApi.current!); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    const tab = screen.getByRole('tab', { name: '패널 a' });
    expect(tab).toHaveAttribute('aria-description', '편집 대상');
    expect(tab).toHaveAttribute('aria-keyshortcuts', 'Shift+F10');
  });
});
