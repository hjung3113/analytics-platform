import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Tabs, TabsList, TabsTrigger } from './index';

afterEach(cleanup);

function renderTabs() {
  return render(<Tabs defaultValue="attributes">
    <TabsList className="mx-5 w-auto" aria-label="상세 탭">
      <TabsTrigger value="attributes">속성</TabsTrigger>
      <TabsTrigger value="history">변경 이력</TabsTrigger>
      <TabsTrigger value="analysis">관련 분석</TabsTrigger>
    </TabsList>
  </Tabs>);
}

it('provides a state-driven selection marker on every tab and preserves selection behavior', () => {
  renderTabs();
  for (const tab of screen.getAllByRole('tab')) {
    const markers = tab.querySelectorAll('[data-current-marker]');
    expect(markers).toHaveLength(1);
    expect(markers[0]?.getAttribute('aria-hidden')).toBe('true');
    expect(markers[0]?.classList.contains('hidden')).toBe(true);
    expect(markers[0]?.classList.contains('group-data-[state=active]:block')).toBe(true);
    expect(tab.classList.contains('group')).toBe(true);
  }
  const attributes = screen.getByRole('tab', { name: '속성' });
  const history = screen.getByRole('tab', { name: '변경 이력' });
  expect(attributes.getAttribute('data-state')).toBe('active');
  expect(attributes.getAttribute('aria-selected')).toBe('true');
  expect(history.getAttribute('data-state')).toBe('inactive');
  expect(history.getAttribute('aria-selected')).toBe('false');
  fireEvent.mouseDown(history, { button: 0, ctrlKey: false });
  expect(attributes.getAttribute('data-state')).toBe('inactive');
  expect(attributes.getAttribute('aria-selected')).toBe('false');
  expect(history.getAttribute('data-state')).toBe('active');
  expect(history.getAttribute('aria-selected')).toBe('true');
});

it('keeps the exact accessible label without the width-reserving copy', () => {
  renderTabs();
  expect(screen.getByRole('tab', { name: '속성' })).toBeDefined();
});

it('merges consumer list classes last', () => {
  renderTabs();
  const list = screen.getByRole('tablist');
  expect(list.classList.contains('mx-5')).toBe(true);
  expect(list.classList.contains('w-auto')).toBe(true);
  expect(list.classList.contains('w-full')).toBe(false);
});

it('renders non-text children once without a width-reserving copy', () => {
  render(<Tabs defaultValue="custom"><TabsList>
    <TabsTrigger value="custom"><span data-testid="custom-label">맞춤 탭</span></TabsTrigger>
  </TabsList></Tabs>);
  expect(screen.getAllByTestId('custom-label')).toHaveLength(1);
  expect(screen.getByRole('tab', { name: '맞춤 탭' }).querySelector('.invisible')).toBeNull();
});
