import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, type ComponentProps, type RefObject } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { DetailPanelSectionNav, DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { DetailDrawer } from '../DetailDrawer';

function Host() { const slot = useDetailPanelSlotHost(); return <aside ref={slot.ref} />; }
function Fixture({ tabs }: { tabs: ComponentProps<typeof DetailDrawer>['tabs'] }) {
  return <I18nProvider><DetailPanelSlotProvider><Host /><DetailDrawer title="Record" onClose={() => {}} tabs={tabs} /></DetailPanelSlotProvider></I18nProvider>;
}
const SECTIONS = [{ id: 'overview', label: '요약' }, { id: 'compose', label: '작성' }];
const regions = (navigation?: (root: RefObject<HTMLElement | null>) => React.ReactNode) => ({
  body: <div data-anchor="overview">Body</div>,
  properties: <div>Props</div>,
  activity: <div data-anchor="compose">Compose</div>,
  ...(navigation ? { navigation } : {}),
});
const rect = (top: number, height = 20) => ({ x: 0, y: top, left: 0, right: 100, top, bottom: top + height, width: 100, height, toJSON: () => ({}) }) as DOMRect;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each([
  ['single tab', [{ id: 'main', label: 'Main', regions: regions() }], '[role="dialog"]'],
  ['tabbed', [{ id: 'main', label: 'Main', regions: regions() }, { id: 'other', label: 'Other', content: 'Other' }], '[role="tabpanel"]'],
] as const)('adds no DOM or focus stop when no navigation is declared (%s)', (_name, tabs, parentSelector) => {
  render(<Fixture tabs={[...tabs]} />);
  expect(document.querySelector('[data-detail-navigation]')).toBeNull();
  expect(screen.queryByRole('navigation')).toBeNull();
  const root = document.querySelector('[data-detail-main-scroll]')!;
  const container = root.parentElement!;
  expect(container).toHaveClass('min-h-0', 'flex-1');
  expect(container.previousElementSibling?.hasAttribute('data-detail-navigation') ?? false).toBe(false);
  expect(container.parentElement).toBe(document.querySelector(parentSelector));
  expect(root.firstElementChild).toHaveAttribute('data-detail-regions');
  expect(root.querySelectorAll('[tabindex="0"]')).toHaveLength(1); // the properties scrollport only
});

it('remounts a declared navigation when the two-column width hides it, closing any menu it opened', () => {
  const observers: ResizeObserverCallback[] = [];
  vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { observers.push(callback); } observe() {} unobserve() {} disconnect() {} });
  let mounts = 0;
  function Nav() { useEffect(() => { mounts += 1; }, []); return <nav aria-label="Sections" />; }
  render(<Fixture tabs={[{ id: 'main', label: 'Main', regions: regions(() => <Nav />) }]} />);
  expect(mounts).toBe(1);
  const wrapper = document.querySelector('[data-detail-navigation]')!;
  const resize = (width: number) => act(() => { for (const callback of observers) callback([{ target: wrapper, contentRect: { width } as DOMRectReadOnly } as ResizeObserverEntry], {} as ResizeObserver); });
  resize(400);
  expect(mounts).toBe(1);
  resize(0);
  expect(mounts).toBe(2);
  resize(0);
  expect(mounts).toBe(2);
});

it('renders the declared navigation above the scroll root, hidden at two columns, with the root as its ref', () => {
  let received: RefObject<HTMLElement | null> | undefined;
  render(<Fixture tabs={[{ id: 'main', label: 'Main', regions: regions(root => { received = root; return <nav aria-label="Sections">x</nav>; }) }]} />);
  const wrapper = document.querySelector('[data-detail-navigation]')!;
  const root = document.querySelector('[data-detail-main-scroll]')!;
  expect(wrapper).toHaveClass('@[60rem]/detail-panel:hidden');
  expect(wrapper.contains(screen.getByRole('navigation', { name: 'Sections' }))).toBe(true);
  expect(wrapper.nextElementSibling).toBe(root.parentElement);
  expect(wrapper.contains(root)).toBe(false);
  expect(received?.current).toBe(root);
});

it('jumps the shared root to an anchor in the activity region', () => {
  const scrollTo = vi.fn();
  const scrolled: unknown[] = [];
  Element.prototype.scrollTo = function (this: Element, ...args: unknown[]) { scrolled.push(this); scrollTo(...args); } as typeof Element.prototype.scrollTo;
  render(<Fixture tabs={[{ id: 'main', label: 'Main', regions: regions(root => <DetailPanelSectionNav sections={SECTIONS} scrollRef={root} />) }]} />);
  const root = document.querySelector('[data-detail-main-scroll]') as HTMLElement;
  root.getBoundingClientRect = () => rect(0, 400);
  (document.querySelector('[data-anchor="compose"]') as HTMLElement).getBoundingClientRect = () => rect(900);
  fireEvent.click(screen.getByRole('button', { name: '작성' }));
  expect(scrollTo).toHaveBeenCalled();
  expect(scrolled.at(-1)).toBe(root);
});

it('updates the active section when a sibling-region anchor enters', () => {
  const instances: Array<{ callback: IntersectionObserverCallback }> = [];
  class TestIO {
    callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) { this.callback = callback; instances.push(this); }
    observe() {} unobserve() {} disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', TestIO);
  render(<Fixture tabs={[{ id: 'main', label: 'Main', regions: regions(root => <DetailPanelSectionNav sections={SECTIONS} scrollRef={root} />) }]} />);
  const compose = document.querySelector('[data-anchor="compose"]') as HTMLElement;
  compose.getBoundingClientRect = () => rect(10);
  const observer = instances.at(-1)!;
  act(() => { observer.callback([{ isIntersecting: true, target: compose, boundingClientRect: rect(10) } as unknown as IntersectionObserverEntry], observer as unknown as IntersectionObserver); });
  expect(screen.getByRole('button', { name: '작성' })).toHaveAttribute('aria-current', 'true');
});
