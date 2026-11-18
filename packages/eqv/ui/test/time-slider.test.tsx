// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { TimeSlider, type TimeSliderProps } from '../src/index.js';

afterEach(cleanup);

const base: Omit<TimeSliderProps, 'value' | 'onValueChange'> = {
  min: 0,
  max: 10_000,
  startLabel: '2026-01-01 10:00:00',
  currentLabel: '2026-01-01 10:00:02',
  endLabel: '2026-01-01 10:00:10',
  onValueCommit: vi.fn(),
};

function Controlled({ onValueCommit = vi.fn() }: { onValueCommit?: (value: number) => void }) {
  const [value, setValue] = useState(2_000);
  return <TimeSlider {...base} value={value} currentLabel={`2026-01-01 10:00:${String(value / 1_000).padStart(2, '0')}`} onValueChange={setValue} onValueCommit={onValueCommit} />;
}

it('exposes a named slider with wall-clock value text and visible start, current, and end times', () => {
  render(<TimeSlider {...base} value={2_000} onValueChange={vi.fn()} />);
  const slider = screen.getByRole('slider', { name: '재생 커서 시각' });
  expect(slider.getAttribute('aria-valuetext')).toBe(base.currentLabel);
  expect(screen.getByText(base.startLabel)).toBeTruthy();
  expect(screen.getByText(base.currentLabel)).toBeTruthy();
  expect(screen.getByText(base.endLabel)).toBeTruthy();
  expect(slider.className).toContain('focus-visible:ring-2');
});

it('moves by small and large keyboard steps, supports Home and End, and commits once per key press', () => {
  const onCommit = vi.fn();
  render(<Controlled onValueCommit={onCommit} />);
  const slider = screen.getByRole('slider', { name: '재생 커서 시각' });

  fireEvent.keyDown(slider, { key: 'ArrowRight' });
  fireEvent.keyUp(slider, { key: 'ArrowRight' });
  expect((slider as HTMLInputElement).value).toBe('2100');
  expect(onCommit).toHaveBeenLastCalledWith(2_100);

  fireEvent.keyDown(slider, { key: 'PageUp' });
  fireEvent.keyUp(slider, { key: 'PageUp' });
  expect((slider as HTMLInputElement).value).toBe('3100');
  expect(onCommit).toHaveBeenLastCalledWith(3_100);

  fireEvent.keyDown(slider, { key: 'Home' });
  fireEvent.keyUp(slider, { key: 'Home' });
  expect((slider as HTMLInputElement).value).toBe('0');
  fireEvent.keyDown(slider, { key: 'End' });
  fireEvent.keyUp(slider, { key: 'End' });
  expect((slider as HTMLInputElement).value).toBe('10000');
  expect(onCommit).toHaveBeenCalledTimes(4);
});

it('updates while dragging and commits the final pointer value only once', () => {
  const onCommit = vi.fn();
  render(<Controlled onValueCommit={onCommit} />);
  const slider = screen.getByRole('slider', { name: '재생 커서 시각' });
  fireEvent.pointerDown(slider);
  fireEvent.change(slider, { target: { value: '8000' } });
  expect((slider as HTMLInputElement).value).toBe('8000');
  expect(onCommit).not.toHaveBeenCalled();
  fireEvent.pointerUp(slider);
  expect(onCommit).toHaveBeenCalledTimes(1);
  expect(onCommit).toHaveBeenCalledWith(8_000);
});
