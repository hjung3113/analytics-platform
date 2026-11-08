import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider, useI18n } from '@ap/kernel';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { DetailDrawer } from '../DetailDrawer';

function Host() { const slot = useDetailPanelSlotHost(); return <aside ref={slot.ref} />; }
function Fixture({ tabs, lang = 'ko', footer }: { tabs: ComponentProps<typeof DetailDrawer>['tabs']; lang?: 'ko' | 'en'; footer?: ReactNode }) {
  return <I18nProvider><Language lang={lang} /><DetailPanelSlotProvider><Host /><DetailDrawer title="Record" onClose={() => {}} tabs={tabs} footer={footer} /></DetailPanelSlotProvider></I18nProvider>;
}
function Language({ lang }: { lang: 'ko' | 'en' }) { const { setLang } = useI18n(); useEffect(() => { setLang(lang); }, [lang, setLang]); return null; }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('keeps undeclared single-tab structure, scroll classes, title naming and reading wrapper', () => {
  render(<Fixture tabs={[{ id: 'main', label: 'Main', content: <textarea aria-label="Legacy" /> }]} />);
  const dialog = screen.getByRole('dialog');
  const region = screen.getByRole('region', { name: 'Record' });
  expect(dialog).toHaveClass('flex h-full min-h-0 w-full flex-col bg-surface-detail');
  expect(dialog).not.toHaveClass('@container/detail-panel');
  expect(region).toHaveClass('min-h-0 flex-1 overflow-auto px-5 py-3 focus-visible:ring-inset');
  expect(region).toHaveAttribute('tabindex', '0');
  expect(region.parentElement).toBe(dialog);
  expect(region.children).toHaveLength(1);
  expect(region.firstElementChild).toHaveAttribute('data-detail-reading-column');
  expect(region.firstElementChild).toHaveClass('contents');
  expect(region.firstElementChild?.firstElementChild).toBe(screen.getByLabelText('Legacy'));
});

it.each(['ko', 'en'] as const)('declares body, properties, activity in DOM order with named keyboard scroll regions (%s)', (lang) => {
  render(<Fixture lang={lang} tabs={[{ id: 'main', label: 'Main', regions: { body: 'Body state', properties: 'Properties state', activity: 'Activity state' } }]} />);
  expect(screen.getByRole('dialog')).toHaveClass('@container/detail-panel');
  const grid = document.querySelector('[data-detail-regions]')!;
  expect(Array.from(grid.children, node => node.getAttribute('data-detail-region'))).toEqual(['body', 'properties', 'activity']);
  expect(grid).toHaveClass('@[60rem]/detail-panel:grid-cols-[minmax(0,1fr)_18rem]');
  const main = screen.getByRole('region', { name: lang === 'ko' ? '본문 및 대화' : 'Body and activity' });
  const properties = screen.getByRole('region', { name: lang === 'ko' ? '속성' : 'Properties' });
  for (const region of [main, properties]) {
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toHaveClass('focus-visible:ring-inset', 'focus-visible:ring-focus-ring');
  }
  expect(properties).toHaveClass('@[60rem]/detail-panel:sticky', '@[60rem]/detail-panel:overflow-y-auto');
  expect(properties).not.toHaveClass('overflow-auto');
  expect(document.querySelector('[data-detail-region="body"]')).toHaveClass('px-5');
  expect(grid.querySelector('[data-detail-reading-column]')).toBeNull();
});

it.each([
  ['loading', <div role="status">Loading</div>],
  ['failure', <div role="alert">Failed</div>],
  ['permission', <p>Permission limited</p>],
] as const)('keeps a full-width body for %s without properties or activity', (_, body) => {
  render(<Fixture tabs={[{ id: 'main', label: 'Main', regions: { body } }]} />);
  expect(document.querySelector('[data-detail-region="body"]')).toBeTruthy();
  expect(document.querySelector('[data-detail-region="properties"]')).toBeNull();
  expect(document.querySelector('[data-detail-region="activity"]')).toBeNull();
  expect(document.querySelector('[data-detail-regions]')).not.toHaveClass('@[60rem]/detail-panel:grid-cols-[minmax(0,1fr)_18rem]');
});

it('supports declared tabs alongside unchanged legacy tabpanels', () => {
  render(<Fixture tabs={[{ id: 'legacy', label: 'Legacy', content: 'Old' }, { id: 'new', label: 'New', regions: { body: 'New body', properties: 'New properties' } }]} />);
  expect(screen.getByRole('tabpanel').getAttribute('class')).toBe('mt-2 ring-offset-surface-canvas focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring min-h-0 flex-1 overflow-auto px-5 py-3 focus-visible:ring-inset focus-visible:ring-offset-0');
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'New' }), { button: 0, ctrlKey: false });
  expect(screen.getByText('New body')).toBeTruthy();
  expect(screen.getByRole('tabpanel')).toHaveClass('overflow-hidden');
});

it('preserves inputs, editors, focus and scroll on toggles and CSS-only width changes', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  const mounted = vi.fn(); const unmounted = vi.fn();
  function Editor() { useEffect(() => { mounted(); return unmounted; }, []); return <><textarea aria-label="Draft" /><div contentEditable suppressContentEditableWarning aria-label="Editor" /></>; }
  render(<Fixture footer={<button>Save</button>} tabs={[{ id: 'main', label: 'Main', regions: { body: <Editor />, properties: <input aria-label="Owner" />, activity: 'Conversation' } }]} />);
  const draft = screen.getByLabelText('Draft'); const editor = screen.getByLabelText('Editor'); const owner = screen.getByLabelText('Owner');
  const main = screen.getByRole('region', { name: '본문 및 대화' }); const properties = screen.getByRole('region', { name: '속성' });
  fireEvent.change(draft, { target: { value: 'Unsent' } }); editor.textContent = 'Editor draft'; main.scrollTop = 120; properties.scrollTop = 30;
  const dialog = screen.getByRole('dialog');
  for (const width of ['439px', '960px', '988px', '1148px', '959px']) {
    act(() => { dialog.style.width = width; window.dispatchEvent(new Event('resize')); });
    expect(screen.getByLabelText('Draft')).toBe(draft); expect(screen.getByLabelText('Owner')).toBe(owner);
  }
  fireEvent.click(screen.getByRole('button', { name: '크게 보기' }));
  act(() => draft.focus());
  fireEvent.click(screen.getByRole('button', { name: '원래 크기로' }));
  expect(draft).toHaveFocus(); expect(draft).toHaveValue('Unsent'); expect(editor.textContent).toBe('Editor draft');
  expect(main.scrollTop).toBe(120); expect(properties.scrollTop).toBe(30);
  expect(mounted).toHaveBeenCalledOnce(); expect(unmounted).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Save' }).closest('[data-detail-regions]')).toBeNull();
});

// Compile-time API contract: declarations require body and are exclusive with legacy content.
const invalidTabs: ComponentProps<typeof DetailDrawer>['tabs'] = [
  // @ts-expect-error body is required when regions is declared
  { id: 'missing', label: 'Missing', regions: { properties: 'Properties' } },
  // @ts-expect-error a tab cannot declare both content and regions
  { id: 'both', label: 'Both', content: 'Old', regions: { body: 'New' } },
];
void invalidTabs;


it.each([undefined, null, false])('does not reserve a properties track for an absent value (%s)', (properties) => {
  render(<Fixture tabs={[{ id: 'main', label: 'Main', regions: { body: 'Body', properties, activity: 'Activity' } }]} />);
  expect(document.querySelector('[data-detail-region="properties"]')).toBeNull();
  expect(document.querySelector('[data-detail-regions]')).not.toHaveClass('@[60rem]/detail-panel:grid-cols-[minmax(0,1fr)_18rem]');
  expect(screen.getByText('Activity')).toBeTruthy();
});

it('retains loading, failure and limited-permission components inside their declared regions', () => {
  render(<Fixture tabs={[{ id: 'main', label: 'Main', regions: {
    body: <div role="status">Loading body</div>,
    properties: <div role="alert">Property read failed</div>,
    activity: <p>Conversation permission limited</p>,
  } }]} />);
  expect(screen.getByRole('status').closest('[data-detail-region]')).toHaveAttribute('data-detail-region', 'body');
  expect(screen.getByRole('alert').closest('[data-detail-region]')).toHaveAttribute('data-detail-region', 'properties');
  expect(screen.getByText('Conversation permission limited').closest('[data-detail-region]')).toHaveAttribute('data-detail-region', 'activity');
  expect(document.querySelector('[data-detail-regions]')).toHaveClass('@[60rem]/detail-panel:grid-cols-[minmax(0,1fr)_18rem]');
});
