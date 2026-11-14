import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { DetailDrawer } from '../DetailDrawer';

function Host() { const slot = useDetailPanelSlotHost(); return <aside ref={slot.ref} />; }
const tabs = [
  { id: 'one', label: 'One', content: <div data-testid="one">one</div> },
  { id: 'two', label: 'Two', content: <div data-testid="two">two</div> },
];
function Fixture({ identity }: { identity?: string }) {
  return <I18nProvider><DetailPanelSlotProvider><Host /><DetailDrawer title="Record" identity={identity} onClose={() => {}} tabs={tabs} /></DetailPanelSlotProvider></I18nProvider>;
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
