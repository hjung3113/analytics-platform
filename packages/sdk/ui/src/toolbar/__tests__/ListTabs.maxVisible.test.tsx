import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Flag } from 'lucide-react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ListTabs } from '../ListTabs.js';
import type { ListToolbarTab } from '../ListToolbar.js';
import { ListToolbar } from '../ListToolbar.js';

const tabs: ListToolbarTab[] = [
  { value: 'a', label: '가' },
  { value: 'b', label: '나' },
  { value: 'c', label: '다' },
  { value: 'd', label: '라', icon: Flag, tip: '라 설명', urgent: true },
  { value: 'e', label: '마', badgeCount: 4 },
  { value: 'f', label: '바', disabled: true },
];

const tabLabels = () => screen.getAllByRole('tab').map((tab) => tab.textContent);
const openMenu = () =>
  fireEvent.keyDown(screen.getByRole('button', { name: /^더보기/ }), { key: 'Enter' });

describe('ListTabs maxVisible', () => {
  it('keeps the DOM unchanged when maxVisible is absent, and when every tab fits', () => {
    const { container: plain } = render(<ListTabs tabs={tabs} activeTab="a" />);
    const { container: fits } = render(<ListTabs tabs={tabs} activeTab="a" maxVisible={6} />);
    expect(plain.querySelector('[data-list-toolbar-more]')).toBeNull();
    const stripIds = (html: string) => html.replace(/radix-_r_\w+_/g, 'radix-id');
    expect(stripIds(fits.innerHTML)).toBe(stripIds(plain.innerHTML));
  });

  it('shows the first N tabs and one 더보기 button carrying the hidden count', () => {
    render(<ListTabs tabs={tabs} activeTab="a" maxVisible={3} />);
    expect(tabLabels()).toEqual(['가', '나', '다']);
    expect(screen.getByRole('button', { name: /^더보기/ })).toHaveTextContent('3');
  });

  it('lists the hidden tabs with icon, tip, badge and disabled state in the menu', () => {
    render(<ListTabs tabs={tabs} activeTab="a" maxVisible={3} />);
    openMenu();
    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['라', '마, 4', '바']);
    expect(items[0]).toHaveAttribute('title', '라 설명');
    expect(items[0]?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(items[2]).toHaveAttribute('data-disabled');
  });

  it('selecting a menu item reports it through onTabChange', () => {
    const onTabChange = vi.fn();
    render(<ListTabs tabs={tabs} activeTab="a" maxVisible={3} onTabChange={onTabChange} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: '라' }));
    expect(onTabChange).toHaveBeenCalledWith('d');
  });

  it('promotes a hidden active tab into the last visible slot and moves the displaced tab into the menu', () => {
    render(<ListTabs tabs={tabs} activeTab="e" maxVisible={3} />);
    expect(tabLabels()).toEqual(['가', '나', '마, 4']);
    expect(screen.getByRole('tab', { name: /^마/ })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('button', { name: /^더보기/ })).toHaveTextContent('3');
    openMenu();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      '다',
      '라',
      '바',
    ]);
  });

  it('returns focus to the 더보기 button on Escape and after a menu pick promotes the tab', async () => {
    function Harness() {
      const [active, setActive] = useState('a');
      return <ListTabs tabs={tabs} activeTab={active} onTabChange={setActive} maxVisible={3} />;
    }
    render(<Harness />);
    const more = screen.getByRole('button', { name: /^더보기/ });
    more.focus();
    openMenu();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    await waitFor(() => expect(more).toHaveFocus());

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: '라' }));
    expect(tabLabels()).toEqual(['가', '나', '라']);
    expect(screen.getByRole('tab', { name: '라' })).toHaveAttribute('data-state', 'active');
    await waitFor(() => expect(screen.getByRole('button', { name: /^더보기/ })).toHaveFocus());
  });

  it('opens with Enter, Space or ArrowDown and keeps the tab list arrow keys', () => {
    render(<ListTabs tabs={tabs} activeTab="a" maxVisible={3} />);
    for (const key of ['Enter', ' ', 'ArrowDown']) {
      fireEvent.keyDown(screen.getByRole('button', { name: /^더보기/ }), { key });
      expect(screen.getByRole('menu')).toBeInTheDocument();
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    }
    // The 더보기 button is reachable by Tab: it is a plain button after the tab list.
    const list = screen.getByRole('tablist');
    const more = screen.getByRole('button', { name: /^더보기/ });
    expect(list.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(more).not.toHaveAttribute('tabindex', '-1');
  });

  it('passes maxVisible through ListToolbar via tabsMaxVisible', () => {
    render(<ListToolbar tabs={tabs} activeTab="a" tabsMaxVisible={2} />);
    expect(tabLabels()).toEqual(['가', '나']);
    expect(screen.getByRole('button', { name: /^더보기/ })).toHaveTextContent('4');
  });
});
