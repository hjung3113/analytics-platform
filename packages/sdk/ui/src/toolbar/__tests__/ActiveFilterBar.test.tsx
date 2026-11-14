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

function FocusHarness({ explicit = false }: { explicit?: boolean }) {
  const [keys, setKeys] = useState(['A', 'B', 'C']);
  const returnFocusRef = useRef<HTMLInputElement>(null);
  return <><input aria-label="Filter" ref={returnFocusRef} />{explicit && <input aria-label="Nearby" />}<ActiveFilterBar
    {...(explicit ? { returnFocusRef } : {})}
    items={keys.map(key => ({ key, label: key, onRemove: () => setKeys(old => old.filter(k => k !== key)) }))}
    onClearAll={() => setKeys([])} /></>;
}
it('focuses the next remove control, then clear, then the preceding field', () => {
  render(<FocusHarness />);
  for (const [key, next] of [['A', 'B 필터 제거'], ['B', 'C 필터 제거'], ['C', 'Filter']]) {
    const button = screen.getByRole('button', { name: `${key} 필터 제거` });
    act(() => button.focus()); fireEvent.click(button);
    expect(next === 'Filter' ? screen.getByRole('textbox', { name: 'Filter' }) : screen.getByRole('button', { name: next })).toHaveFocus();
  }
});
it.each([false, true])('returns focus after clearing all (explicit ref: %s)', explicit => {
  render(<FocusHarness explicit={explicit} />);
  const button = screen.getByRole('button', { name: '필터 초기화' });
  act(() => button.focus()); fireEvent.click(button);
  expect(screen.getByRole('textbox', { name: 'Filter' })).toHaveFocus();
});
it('uses clear when removing the last chip in a nonempty bar', () => {
  render(<FocusHarness />);
  const button = screen.getByRole('button', { name: 'C 필터 제거' });
  act(() => button.focus()); fireEvent.click(button);
  expect(screen.getByRole('button', { name: '필터 초기화' })).toHaveFocus();
});
