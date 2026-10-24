import { useState } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { DockLayout } from './DockLayout';
import type { DockNode } from './schema';
import { group, installResizeObserver, row } from './__tests__/harness';

const observer = installResizeObserver();
beforeAll(() => { observer.resize(900, 600); });
afterAll(() => { observer.restore(); });
afterEach(() => { cleanup(); });

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
    flag.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      render(<I18nProvider><Host /></I18nProvider>);
      const before = await screen.findByRole('tab', { name: '패널 a' });
      await waitFor(() => { expect(before).toHaveAttribute('aria-description', '편집 대상'); });
      const watch = sightings('a');
      setLayout(row([50, 50], group(['a']), group(['b', 'c'], 'b')));
      await waitFor(() => { expect(document.querySelectorAll('[role="tablist"]')).toHaveLength(2); });
      // Looked up inside the wait: a lookup right after the layout change can still return the old tab, which the reconcile then detaches.
      await waitFor(() => { expect(before).not.toBeInTheDocument(); });
      await waitFor(() => { expect(screen.getByRole('tab', { name: '패널 a' })).toHaveAttribute('aria-description', '편집 대상'); });
      expect(screen.getByRole('tab', { name: '패널 a' })).toHaveAttribute('aria-keyshortcuts', 'Shift+F10');
      watch.stop();
      // The rebuilt tab was findable by name while it still had no description: the engine put the content into the new tab element at once, and
      // DockTab sets the attributes only when the reconcile it counts has committed (a later render). The product ends right; a test must wait.
      expect(watch.seen.some(sighting => sighting.element !== before && sighting.named && !sighting.described)).toBe(true);
    } finally { flag.IS_REACT_ACT_ENVIRONMENT = true; }
  });
});
