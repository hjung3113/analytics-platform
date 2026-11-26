import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TabsList, TabsTrigger } from '../../components/PlatformTabs.js';
import { Tabs } from '../../components/shadcn/tabs.js';
import { ListTabs } from '../ListTabs.js';

// #3154: the list toolbar is white, so a white selected background left the active tab marked by text colour alone
// (WCAG 1.4.1). The active tab carries the confirmed tab mark instead, the same bar as `PlatformTabs`.
const WHITE_ACTIVE = /^data-\[state=active\]:bg-surface-(card|card-elevated|detail|popover)$/;
const markClasses = (element: Element) => Array.from(element.classList).filter((name) => name.startsWith('after:') || name.includes(':after:'));

describe('ListTabs selected mark (#3154)', () => {
  it('marks the active tab with the shared tab bar, never a white background', () => {
    render(<ListTabs tabs={[{ value: 'a', label: '가' }, { value: 'b', label: '나' }]} activeTab="a" />);
    const active = screen.getByRole('tab', { name: '가' });
    expect(active).toHaveAttribute('data-state', 'active');
    expect(Array.from(active.classList).filter((name) => WHITE_ACTIVE.test(name))).toEqual([]);
    expect(active).toHaveClass('relative', 'data-[state=active]:after:block');
  });

  it('draws the same bar as PlatformTabs', () => {
    render(<ListTabs tabs={[{ value: 'a', label: '가' }]} activeTab="a" />);
    render(<Tabs value="x"><TabsList><TabsTrigger value="x">다</TabsTrigger></TabsList></Tabs>);
    const list = markClasses(screen.getByRole('tab', { name: '가' }));
    const platform = markClasses(screen.getByRole('tab', { name: '다' }));
    expect(list.length).toBeGreaterThan(0);
    expect(list.sort()).toEqual(platform.sort());
  });
});
