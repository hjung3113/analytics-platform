import { useCompactPageDensity } from '../../pageDensity';
import { useState } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { installResizeObserver } from '../../dock/__tests__/harness';
import { PanelWorkspace } from '../../workspace/PanelWorkspace';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { PlatformPage, type PlatformPageProps } from '../PlatformPage';
import { useRegisterPageFlow } from '../../pageFlow';
import { groupId, spaceId } from '@ap/contracts';

const features = { export: false, savedView: false, annotate: false, compare: false };
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features, pageKeys: [] }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const mount = (props: Partial<PlatformPageProps> = {}) => render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><PlatformPage {...props}><p>본문</p></PlatformPage></PlatformProvider></I18nProvider>);
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('PlatformPage layout', () => {
  it('fill: the root takes its container\'s height; the body takes the rest but never less than its content (banners + the 520 px slot)', () => {
    mount({ layout: 'fill' });
    const root = document.querySelector<HTMLElement>('[data-platform-page]')!;
    expect(root).toHaveAttribute('data-page-layout', 'fill');
    expect(root).toHaveClass('h-full', 'min-h-0', 'flex', 'flex-col');
    const body = document.querySelector<HTMLElement>('[data-platform-page-content]')!;
    expect(body).toHaveClass('flex-1');
    // Not `min-h-0`: a banner above the 520 px slot grows the body (the page scrolls) instead of pushing the workspace out of it.
    expect(body).not.toHaveClass('min-h-0');
    expect(body).toContainElement(screen.getByText('본문'));
  });

  it('fill: the children sit in a remaining-height slot below the outcome banners, so the body never exceeds its height', () => {
    mount({ layout: 'fill' });
    const body = document.querySelector<HTMLElement>('[data-platform-page-content]')!;
    expect(body).toHaveClass('flex', 'flex-col');
    const slot = document.querySelector<HTMLElement>('[data-platform-page-fill]')!;
    expect(slot).toHaveClass('flex-1');
    expect(slot.parentElement).toBe(body);
    expect(slot).toContainElement(screen.getByText('본문'));
  });

  it('fill: the slot is a flex column, so a flex-1 child (DrillLayout fill + a table) takes the remaining height instead of leaving slack the table fit counts as content below', () => {
    mount({ layout: 'fill' });
    expect(document.querySelector<HTMLElement>('[data-platform-page-fill]')).toHaveClass('flex', 'flex-col', 'flex-1');
  });

  it('fill: the body keeps a 520 px minimum so a tall chrome scrolls the page instead of crushing the workspace', () => {
    mount({ layout: 'fill' });
    expect(document.querySelector<HTMLElement>('[data-platform-page-fill]')).toHaveClass('min-h-[520px]');
  });

  it.each<[string, Partial<PlatformPageProps>]>([['no prop', {}], ['flow', { layout: 'flow' }]])('%s: unchanged — grows with its content', (_name, props) => {
    mount(props);
    const root = document.querySelector<HTMLElement>('[data-platform-page]')!;
    expect(root).not.toHaveAttribute('data-page-layout');
    expect(root.className).toBe('flex min-h-full flex-col');
    expect(document.querySelector('[data-platform-page-content]')!.className).toBe('flex-1 px-8 pb-9 pt-7');
    expect(document.querySelector('[data-platform-page-fill]')).toBeNull();
  });
});

describe('PlatformPage layout: a workspace in stack mode turns the fill page into flow (#686)', () => {
  let setActive: (active: boolean) => void = () => {};
  function Registrant() {
    const [active, set] = useState(false);
    setActive = set;
    useRegisterPageFlow(active);
    return <p>작업 영역</p>;
  }
  const mountWith = (props: Partial<PlatformPageProps> = {}) => render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><PlatformPage {...props}><Registrant /></PlatformPage></PlatformProvider></I18nProvider>);

  it('while a workspace registers the page grows with it and the slot loses the 520 px floor; the head semantics stay fill', () => {
    mountWith({ layout: 'fill' });
    const root = document.querySelector<HTMLElement>('[data-platform-page]')!;
    const slot = document.querySelector<HTMLElement>('[data-platform-page-fill]')!;
    act(() => { setActive(true); });
    expect(root).toHaveClass('min-h-full');
    expect(root).not.toHaveClass('h-full');
    expect(slot).toHaveClass('flex-1');
    expect(slot).not.toHaveClass('min-h-[520px]');
    expect(root).toHaveAttribute('data-page-layout', 'fill');
    // The same elements, not a remount: the workspace's state and queries are untouched.
    expect(document.querySelector('[data-platform-page]')).toBe(root);
    expect(document.querySelector('[data-platform-page-fill]')).toBe(slot);
  });

  it('back to fixed fill when it stops registering, and when it unmounts', () => {
    const view = mountWith({ layout: 'fill' });
    const root = document.querySelector<HTMLElement>('[data-platform-page]')!;
    act(() => { setActive(true); });
    act(() => { setActive(false); });
    expect(root).toHaveClass('h-full', 'min-h-0');
    expect(document.querySelector('[data-platform-page-fill]')).toHaveClass('min-h-[520px]');
    act(() => { setActive(true); });
    view.rerender(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><PlatformPage layout="fill"><p>본문</p></PlatformPage></PlatformProvider></I18nProvider>);
    expect(document.querySelector('[data-platform-page]')).toHaveClass('h-full', 'min-h-0');
  });

  it('a flow page ignores a registrant: its sizing is unchanged', () => {
    mountWith({ layout: 'flow' });
    act(() => { setActive(true); });
    expect(document.querySelector<HTMLElement>('[data-platform-page]')!.className).toBe('flex min-h-full flex-col');
  });

  it('a dock panel is a page-flow boundary: a stacked workspace inside a panel leaves the outer fill page\'s sizing and slot floor alone', async () => {
    const observer = installResizeObserver();
    try {
      render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><PlatformPage layout="fill">
        <PanelWorkspace panels={[{ id: 'outer', title: { ko: '바깥', en: 'Outer' }, primary: true, render: () => <Registrant /> }]} presets={[{ id: 'p', label: { ko: '하나', en: 'One' }, layout: { type: 'group', panels: ['outer'] } }]} initialPreset="p" persistKey="outer" label={{ ko: '바깥 작업 영역', en: 'Outer workspace' }} />
      </PlatformPage></PlatformProvider></I18nProvider>);
      await screen.findByText('작업 영역');
      act(() => { setActive(true); });
      const root = document.querySelector<HTMLElement>('[data-platform-page]')!;
      expect(root).toHaveClass('h-full', 'min-h-0');
      expect(document.querySelector('[data-platform-page-fill]')).toHaveClass('min-h-[520px]');
    } finally {
      observer.restore();
    }
  });

  it('a nested flow page isolates its workspace from the outer fill page', () => {
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><PlatformPage layout="fill"><PlatformPage layout="flow"><Registrant /></PlatformPage></PlatformPage></PlatformProvider></I18nProvider>);
    act(() => { setActive(true); });
    expect(document.querySelectorAll<HTMLElement>('[data-platform-page]')[0]).toHaveClass('h-full', 'min-h-0');
  });
});

describe('opt-in page density (#1141)', () => {
  it.each(['flow', 'fill'] as const)('%s keeps comfortable spacing by default and compact preserves height behavior', layout => {
    const view = mount({ layout });
    expect(document.querySelector('[data-platform-page-content]')).toHaveClass('px-8', 'pt-7', 'pb-9');
    view.unmount();
    mount({ layout, density: 'compact' });
    expect(document.querySelector('[data-platform-page-content]')).toHaveClass('px-4', 'pt-3', 'pb-4');
    expect(document.querySelector('[data-platform-page]')).toHaveClass(layout === 'fill' ? 'h-full' : 'min-h-full');
    if (layout === 'fill') expect(document.querySelector('[data-platform-page-fill]')).toHaveClass('min-h-[520px]');
  });
});

describe('page-level rows follow page density (#1166)', () => {
  it.each(['flow', 'fill'] as const)('%s: the contextExtension row insets 32px in comfortable and aligns with the compact content at 16px', layout => {
    const props = { layout, contextExtension: <div data-testid="ext">집계 단위</div> };
    const view = mount(props);
    const row = () => screen.getByTestId('ext').closest<HTMLElement>(layout === 'fill' ? '[data-page-head]' : '.pt-3')!;
    expect(row()).toHaveClass('px-8');
    view.unmount();
    mount({ ...props, density: 'compact' });
    expect(row()).toHaveClass('px-4');
    expect(row()).not.toHaveClass('px-8');
    expect(document.querySelector('[data-platform-page-content]')).toHaveClass('px-4');
  });
});

it('PlatformPage carries visual density to descendants and nested pages retain their own default (#1141)', () => {
  function DensityProbe({ id }: { id: string }) { return <span data-testid={id}>{String(useCompactPageDensity())}</span>; }
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <PlatformPage density="compact"><DensityProbe id="dense" /><PlatformPage><DensityProbe id="normal" /></PlatformPage></PlatformPage>
  </PlatformProvider></I18nProvider>);
  expect(screen.getByTestId('dense')).toHaveTextContent('true');
  expect(screen.getByTestId('normal')).toHaveTextContent('false');
});
