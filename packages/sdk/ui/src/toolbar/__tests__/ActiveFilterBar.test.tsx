import { useRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActiveFilterBar } from '../ActiveFilterBar.js';

describe('ActiveFilterBar', () => {
  it('renders nothing when no filters apply', () => {
    const { container } = render(<ActiveFilterBar items={[]} onClearAll={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('names each remove control and clears the filters through callbacks', () => {
    const remove = vi.fn();
    const clear = vi.fn();
    render(
      <ActiveFilterBar
        items={[{ key: 'area', label: 'Analytics Area: 미지정', onRemove: remove }]}
        onClearAll={clear}
      />,
    );
    expect(screen.getByRole('group', { name: '적용된 필터' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Analytics Area: 미지정 필터 제거' }));
    expect(remove).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '필터 초기화' }));
    expect(clear).toHaveBeenCalledOnce();
  });
});

function FocusHarness({
  explicit = false,
  unmountWhenEmpty = false,
  initialKeys = ['A', 'B', 'C'],
  onAfterClear,
}: {
  explicit?: boolean;
  unmountWhenEmpty?: boolean;
  initialKeys?: string[];
  onAfterClear?: () => void;
}) {
  const [keys, setKeys] = useState(initialKeys);
  const returnFocusRef = useRef<HTMLInputElement>(null);
  const bar = (
    <ActiveFilterBar
      {...(explicit ? { returnFocusRef } : {})}
      items={keys.map(key => ({
        key,
        label: key,
        onRemove: () => {
          setKeys(old => old.filter(k => k !== key));
          if (keys.length === 1) onAfterClear?.();
        },
      }))}
      onClearAll={() => {
        setKeys([]);
        onAfterClear?.();
      }}
    />
  );
  return (
    <>
      <input aria-label="Filter" ref={returnFocusRef} />
      {explicit && <input aria-label="Nearby" />}
      <input aria-label="Other" />
      {unmountWhenEmpty ? keys.length > 0 && bar : bar}
    </>
  );
}
it('focuses the next remove control, then clear, then the preceding field', () => {
  render(<FocusHarness />);
  for (const [key, next] of [['A', 'B 필터 제거'], ['B', 'C 필터 제거'], ['C', 'Other']]) {
    const button = screen.getByRole('button', { name: `${key} 필터 제거` });
    act(() => button.focus()); fireEvent.click(button);
    expect(next === 'Other' ? screen.getByRole('textbox', { name: 'Other' }) : screen.getByRole('button', { name: next })).toHaveFocus();
  }
});
it.each([false, true])('returns focus after clearing all (explicit ref: %s)', explicit => {
  render(<FocusHarness explicit={explicit} />);
  const button = screen.getByRole('button', { name: '필터 초기화' });
  act(() => button.focus()); fireEvent.click(button);
  expect(screen.getByRole('textbox', { name: explicit ? 'Filter' : 'Other' })).toHaveFocus();
});
it('uses clear when removing the last chip in a nonempty bar', () => {
  render(<FocusHarness />);
  const button = screen.getByRole('button', { name: 'C 필터 제거' });
  act(() => button.focus()); fireEvent.click(button);
  expect(screen.getByRole('button', { name: '필터 초기화' })).toHaveFocus();
});
it('returns focus to returnFocusRef when the consumer unmounts the bar after removing the last chip', () => {
  render(<FocusHarness explicit unmountWhenEmpty initialKeys={['A']} />);
  const button = screen.getByRole('button', { name: 'A 필터 제거' });
  act(() => button.focus());
  fireEvent.click(button);
  expect(screen.queryByRole('group', { name: '적용된 필터' })).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Filter' })).toHaveFocus();
});
it('returns focus to returnFocusRef when the consumer unmounts the bar after clearing all', () => {
  render(<FocusHarness explicit unmountWhenEmpty initialKeys={['A', 'B']} />);
  const button = screen.getByRole('button', { name: '필터 초기화' });
  act(() => button.focus());
  fireEvent.click(button);
  expect(screen.queryByRole('group', { name: '적용된 필터' })).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Filter' })).toHaveFocus();
});
it('returns focus to the preceding field when unmounting without returnFocusRef', () => {
  render(<FocusHarness unmountWhenEmpty initialKeys={['A']} />);
  const button = screen.getByRole('button', { name: 'A 필터 제거' });
  act(() => button.focus());
  fireEvent.click(button);
  expect(screen.queryByRole('group', { name: '적용된 필터' })).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Other' })).toHaveFocus();
});
it('does not steal focus if the removal callback already moved focus elsewhere', () => {
  const focusOther = () => {
    screen.getByRole('textbox', { name: 'Other' }).focus();
  };
  render(<FocusHarness explicit unmountWhenEmpty initialKeys={['A']} onAfterClear={focusOther} />);
  const button = screen.getByRole('button', { name: 'A 필터 제거' });
  act(() => button.focus());
  fireEvent.click(button);
  expect(screen.getByRole('textbox', { name: 'Other' })).toHaveFocus();
});
