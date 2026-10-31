import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { act, render } from '@testing-library/react';
import { I18nProvider } from '@ap/kernel';
import { DockLayout } from '../DockLayout';
import type { DockLayoutProps, DockPanel } from '../dockTypes';
import type { DockNode } from '../schema';

/** jsdom has no ResizeObserver and no geometry: every observed element reports the shared size, and `resize` re-reports it. */
export function installResizeObserver() {
  const size = { width: 900, height: 600 };
  const observers = new Set<{ callback: ResizeObserverCallback; targets: Set<Element> }>();
  const report = (observer: { callback: ResizeObserverCallback }, target: Element) => {
    const rect = { width: size.width, height: size.height, top: 0, left: 0, right: size.width, bottom: size.height, x: 0, y: 0 };
    observer.callback([{ target, contentRect: rect } as ResizeObserverEntry], observer as unknown as ResizeObserver);
  };
  class FakeResizeObserver {
    private entry = { callback: undefined as unknown as ResizeObserverCallback, targets: new Set<Element>() };
    constructor(callback: ResizeObserverCallback) { this.entry.callback = callback; observers.add(this.entry); }
    observe(target: Element) { this.entry.targets.add(target); report(this.entry, target); }
    unobserve(target: Element) { this.entry.targets.delete(target); }
    disconnect() { this.entry.targets.clear(); observers.delete(this.entry); }
  }
  const previous = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;
  return {
    resize(width: number, height = size.height) {
      size.width = width; size.height = height;
      act(() => { observers.forEach(observer => { observer.targets.forEach(target => { report(observer, target); }); }); });
    },
    /** Reports `width` to the observed elements that `match` only: a size change the engine's own container never saw. */
    touch(match: (target: Element) => boolean, width: number) {
      act(() => { observers.forEach(observer => { observer.targets.forEach(target => { if (match(target)) observer.callback([{ target, contentRect: { width, height: size.height, top: 0, left: 0, right: width, bottom: size.height, x: 0, y: 0 } } as ResizeObserverEntry], observer as unknown as ResizeObserver); }); }); });
    },
    restore() { (globalThis as { ResizeObserver?: unknown }).ResizeObserver = previous; },
  };
}

export const mounts: Record<string, number> = {};
export function resetMounts() { for (const key of Object.keys(mounts)) delete mounts[key]; }
function Counter({ id, children }: { id: string; children?: ReactNode }) {
  useEffect(() => { mounts[id] = (mounts[id] ?? 0) + 1; }, [id]);
  return <div data-testid={`content-${id}`}>content {id}{children}</div>;
}

export const group = (panels: string[], active = panels[0]!): DockNode => ({ type: 'group', panels, active });
export const row = (sizes: number[], ...children: DockNode[]): DockNode => ({ type: 'branch', dir: 'row', sizes, children });
export const column = (sizes: number[], ...children: DockNode[]): DockNode => ({ type: 'branch', dir: 'column', sizes, children });

export type Controls = {
  setLayout: (next: DockNode) => void;
  setMaximized: (id: string | null) => void;
  /** Re-titles every panel (a new `panels` array), the way a locale change does. */
  setTitleSuffix: (suffix: string) => void;
  current: () => { layout: DockNode; maximized: string | null };
};
export type Calls = { layout: DockNode[]; activate: string[]; maximized: (string | null)[] };

export function mountDock(options: {
  layout: DockNode;
  ids?: string[];
  inner?: (id: string) => ReactNode;
  props?: Partial<DockLayoutProps>;
  maximized?: string | null;
  /** True (default): the parent stores what the layout reports. False: a parent that ignores every change. */
  controlled?: boolean;
}) {
  const ids = options.ids ?? ['a', 'b', 'c'];
  const calls: Calls = { layout: [], activate: [], maximized: [] };
  const controls = {} as Controls;
  const build = (suffix: string): DockPanel[] => ids.map(id => ({ id, title: `패널 ${id}${suffix}`, render: () => <Counter id={id}>{options.inner?.(id)}</Counter> }));
  const panels = build('');
  function Harness() {
    const [suffix, setSuffix] = useState('');
    const current = useMemo(() => (suffix === '' ? panels : build(suffix)), [suffix]);
    const [layout, setLayout] = useState(options.layout);
    const [maximized, setMaximized] = useState<string | null>(options.maximized ?? null);
    useLayoutEffect(() => {
      controls.setLayout = next => { act(() => { setLayout(next); }); };
      controls.setMaximized = id => { act(() => { setMaximized(id); }); };
      controls.setTitleSuffix = next => { act(() => { setSuffix(next); }); };
      controls.current = () => ({ layout, maximized });
    });
    return <DockLayout panels={current} layout={layout} maximizedPanelId={maximized}
      onLayoutChange={next => { calls.layout.push(next); if (options.controlled !== false) setLayout(next); }}
      onActivate={id => { calls.activate.push(id); }}
      onMaximizedChange={id => { calls.maximized.push(id); setMaximized(id); }}
      separatorLabel={({ dir, before, after }) => `${dir}:${before.join(',')}|${after.join(',')}`}
      label="테스트 배치" minPanelSize={{ width: 20, height: 20 }} {...options.props} />;
  }
  const view = render(<I18nProvider><Harness /></I18nProvider>);
  return { ...view, controls, calls, panels };
}

/** The tab strip as the user sees it: one entry per group, in DOM order. */
export function groupsOnScreen(root: ParentNode = document): string[][] {
  return Array.from(root.querySelectorAll('.dv-groupview')).map(element => Array.from(element.querySelectorAll<HTMLElement>('[role="tab"]')).map(tab => tab.dataset.tabPanelId ?? ''));
}
export function activeTabs(root: ParentNode = document): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[role="tab"][aria-selected="true"]')).map(tab => tab.dataset.tabPanelId ?? '');
}
