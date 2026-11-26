import { useState, type KeyboardEvent } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToggleGroup, ToggleGroupItem } from '../toggle-group';

function Axis({ arrowSelects, rovingFocus, onKeyDown }: {
  arrowSelects?: boolean;
  rovingFocus?: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const [value, setValue] = useState('item');
  return (
    <>
      <ToggleGroup type="single" aria-label="축" value={value} arrowSelects={arrowSelects}
        {...(rovingFocus === undefined ? {} : { rovingFocus })} {...(onKeyDown ? { onKeyDown } : {})}
        onValueChange={next => { if (next) setValue(next); }}>
        <ToggleGroupItem value="item">항목 기준</ToggleGroupItem>
        <ToggleGroupItem value="equipment">설비 기준</ToggleGroupItem>
        <ToggleGroupItem value="other" disabled>기타</ToggleGroupItem>
        <ToggleGroupItem value="rate">비율 기준</ToggleGroupItem>
      </ToggleGroup>
      <output>{value}</output>
    </>
  );
}

const radio = (name: string) => screen.getByRole('radio', { name });

it.each([
  [{}, true],
  [{ variant: 'default', appearance: 'default' } as const, true],
  [{ variant: 'outline' } as const, false],
  [{ appearance: 'filter' } as const, false],
])('uses the selected-filter pairing only for the default segment (%j)', (props, selected) => {
  render(<ToggleGroup type="single" defaultValue="item" {...props}><ToggleGroupItem value="item">항목</ToggleGroupItem></ToggleGroup>);
  const item = radio('항목');
  expect(item).toHaveAttribute('data-state', 'on');
  expect(item).toHaveClass('data-[state=on]:text-text-primary');
  for (const token of ['data-[state=on]:bg-surface-row-selected', 'data-[state=on]:border-border-selected', 'data-[state=on]:font-semibold']) {
    expect(item.classList.contains(token)).toBe(selected);
  }
});

it('draws a swatch with one selection ring and no border', () => {
  render(<ToggleGroup type="single" appearance="swatch" defaultValue="a" aria-label="색">
    <ToggleGroupItem value="a" aria-label="색 1"><span className="bg-chart-series-1" /></ToggleGroupItem>
  </ToggleGroup>);
  const item = radio('색 1');
  expect(item.className).toContain('data-[state=on]:ring-2');
  expect(item.className).toContain('focus-visible:ring-offset-2');
  expect(item.className).not.toMatch(/data-\[state=on\]:border/);
  expect(item.className.split(' ').some(token => token === 'border' || token.startsWith('border-'))).toBe(false);
  expect(item).not.toHaveClass('data-[state=on]:bg-surface-row-selected');
  expect(screen.getByRole('radiogroup')).toHaveClass('justify-start', 'gap-2');
});

describe('ToggleGroup type="single" (#2552)', () => {
  it('moves the selection with the focus on arrow keys, both ways, like a radio group', async () => {
    const user = userEvent.setup();
    render(<Axis />);
    await user.click(radio('항목 기준'));
    await user.keyboard('{ArrowRight}');
    expect(radio('설비 기준')).toHaveFocus();
    expect(radio('설비 기준')).toHaveAttribute('aria-checked', 'true');
    expect(radio('항목 기준')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('equipment');
    await user.keyboard('{ArrowLeft}');
    expect(radio('항목 기준')).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('item');
  });

  it('skips a disabled item, loops, and moves to the ends on Home and End', async () => {
    const user = userEvent.setup();
    render(<Axis />);
    await user.click(radio('설비 기준'));
    await user.keyboard('{ArrowRight}');
    expect(radio('비율 기준')).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('rate');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('status')).toHaveTextContent('item');
    await user.keyboard('{End}');
    expect(radio('비율 기준')).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('rate');
    await user.keyboard('{Home}');
    expect(screen.getByRole('status')).toHaveTextContent('item');
    expect(radio('기타')).toHaveAttribute('aria-checked', 'false');
  });

  it('lets the consumer cancel the move, and calls its handler once per key', async () => {
    const user = userEvent.setup();
    const onKeyDown = vi.fn((event: KeyboardEvent<HTMLDivElement>) => { if (event.key === 'ArrowRight') event.preventDefault(); });
    render(<Axis onKeyDown={onKeyDown} />);
    await user.click(radio('항목 기준'));
    await user.keyboard('{ArrowRight}');
    expect(radio('항목 기준')).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('item');
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    await user.keyboard('{End}');
    expect(screen.getByRole('status')).toHaveTextContent('rate');
    expect(onKeyDown).toHaveBeenCalledTimes(2);
  });

  it('does not select on a focus the keys did not make, nor on modified keys', async () => {
    const user = userEvent.setup();
    render(<Axis />);
    await user.click(radio('항목 기준'));
    await user.keyboard('{ArrowRight}');
    act(() => { radio('비율 기준').focus(); });
    expect(screen.getByRole('status')).toHaveTextContent('equipment');
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    expect(screen.getByRole('status')).toHaveTextContent('equipment');
  });

  it('does not select on Tab focus, and keeps focus-only arrows when the group opts out', async () => {
    const user = userEvent.setup();
    render(<Axis arrowSelects={false} />);
    await user.tab();
    expect(radio('항목 기준')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(radio('설비 기준')).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('item');
  });

  it('leaves a group without roving focus to the browser', async () => {
    const user = userEvent.setup();
    render(<Axis rovingFocus={false} />);
    await user.click(radio('항목 기준'));
    await user.keyboard('{ArrowRight}');
    expect(radio('항목 기준')).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('item');
  });
});

// #3149: the `filter` track is white (`surface-card`); a white item hover changes nothing there, so hover uses the shared
// row hover (DESIGN.md «hover는 공유 row-hover»).
it.each(['default', 'outline'] as const)('shows %s item hover with the shared row hover, never a white surface (#3149)', variant => {
  render(
    <ToggleGroup type="single" aria-label="보기" variant={variant} appearance="filter">
      <ToggleGroupItem value="a">가</ToggleGroupItem>
    </ToggleGroup>,
  );
  const hover = Array.from(radio('가').classList).filter(name => name.startsWith('hover:bg-'));
  expect(hover.filter(name => /^hover:bg-surface-(card|card-elevated|detail|popover)$/.test(name))).toEqual([]);
  expect(hover).toContain('hover:bg-surface-row-hover');
});
