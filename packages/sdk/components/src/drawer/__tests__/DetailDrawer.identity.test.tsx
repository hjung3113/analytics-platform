import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, expect, it } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { DetailDrawer } from '../DetailDrawer';

function Host() { const slot = useDetailPanelSlotHost(); return <aside ref={slot.ref} />; }
const tabs = [
  { id: 'one', label: 'One', content: <div data-testid="one">one</div> },
  { id: 'two', label: 'Two', content: <div data-testid="two">two</div> },
];
function Fixture({ identity, only }: { identity?: string; only?: ComponentProps<typeof DetailDrawer>['tabs'] }) {
  return <I18nProvider><DetailPanelSlotProvider><Host /><DetailDrawer title="Record" identity={identity} onClose={() => {}} tabs={only ?? tabs} /></DetailPanelSlotProvider></I18nProvider>;
}
const openSecondTab = () => fireEvent.mouseDown(screen.getByRole('tab', { name: 'Two' }), { button: 0 });

afterEach(cleanup);

it('restarts the uncontrolled tab and the scroll when the identity changes, without remounting the drawer (#1890 item 1)', () => {
  const { rerender } = render(<Fixture identity="a" />);
  openSecondTab();
  expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true');
  const close = screen.getByRole('button', { name: /닫기|Close/ });
  const panel = screen.getByRole('dialog');
  rerender(<Fixture identity="b" />);
  expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('button', { name: /닫기|Close/ })).toBe(close);
  expect(screen.getByRole('dialog')).toBe(panel);
});

it('keeps the tab when the identity is unchanged or omitted (default behaviour)', () => {
  const { rerender } = render(<Fixture identity="a" />);
  openSecondTab();
  rerender(<Fixture identity="a" />);
  expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true');
  cleanup();
  const r = render(<Fixture />);
  openSecondTab();
  r.rerender(<Fixture />);
  expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true');
});

const single = [{ id: 'main', label: 'Main', content: <div>main</div> }];
const declared = [{ id: 'main', label: 'Main', regions: { body: <div>body</div>, properties: <div>props</div> } }];
it.each([
  ['single content', single, '[role="dialog"] > [role="region"]'],
  ['declared regions', declared, '[data-detail-main-scroll]'],
] as const)('gives a new scroll node at the top when the identity changes (%s), and keeps it when the identity is the same', (_name, only, selector) => {
  const { rerender } = render(<Fixture identity="a" only={[...only]} />);
  const node = () => document.querySelector<HTMLElement>(selector)!;
  const first = node();
  first.scrollTop = 120;
  rerender(<Fixture identity="a" only={[...only]} />);
  expect(node()).toBe(first);
  expect(node().scrollTop).toBe(120);
  rerender(<Fixture identity="b" only={[...only]} />);
  expect(node()).not.toBe(first);
  expect(node().scrollTop).toBe(0);
});
