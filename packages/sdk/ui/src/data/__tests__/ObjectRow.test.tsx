/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ObjectRow } from '../ObjectRow.js';

describe('ObjectRow', () => {
  it('renders title and mono id', () => {
    const { container } = render(<ObjectRow id="VOC-1042" title="권한 요청이 반복됩니다" />);

    expect(screen.getByText('권한 요청이 반복됩니다')).toBeInTheDocument();
    expect(screen.getByText('VOC-1042')).toHaveClass('font-mono', 'text-text-muted');
    expect(container.firstElementChild).toHaveClass('grid');
  });

  it('renders selected accent bar and selected background', () => {
    const { container } = render(<ObjectRow selected title="선택된 행" />);

    expect(container.firstElementChild).toHaveClass('bg-surface-row-selected');
    expect(screen.getByTestId('object-row-selected-bar')).toHaveClass('bg-border-selected');
  });

  it('renders a token-backed severity bar', () => {
    const { container } = render(<ObjectRow severity="critical" title="긴급 VOC" />);

    const severityBar = container.querySelector('[data-token="--severity-critical"]');
    expect(severityBar).not.toBeNull();
  });

  it('fires onClick from the row', () => {
    const handleClick = vi.fn();
    render(<ObjectRow title="클릭 가능한 행" onClick={handleClick} />);

    fireEvent.click(screen.getByText('클릭 가능한 행'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders trailing and badges slots', () => {
    render(
      <ObjectRow
        title="슬롯 행"
        badges={<span>High</span>}
        trailing={<button type="button">Open</button>}
      />,
    );

    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
  });

  it('preserves the empty leading cell by default', () => {
    const { container } = render(<ObjectRow title="Default row" trailing={<button>Open</button>} />);
    expect(container.firstElementChild).toHaveClass('grid-cols-[auto_1fr_auto]');
    expect(container.firstElementChild?.firstElementChild).toBeEmptyDOMElement();
  });

  it('omits the empty leading cell in auto mode while keeping a trailing column', () => {
    const { container } = render(<ObjectRow leadingCell="auto" title="Auto row" trailing={<button>Open</button>} />);
    expect(container.firstElementChild).toHaveClass('grid-cols-[1fr_auto]');
    expect(container.firstElementChild?.children).toHaveLength(2);
    expect(container.firstElementChild?.firstElementChild).toHaveTextContent('Auto row');
    expect(container.firstElementChild?.lastElementChild).toContainElement(screen.getByRole('button', { name: 'Open' }));
  });

  it.each([
    { severity: 'critical' as const },
    { selectable: true },
    { icon: <span>Icon</span> },
  ])('keeps leading content in auto mode: %s', props => {
    const { container } = render(<ObjectRow leadingCell="auto" title="Auto row" {...props} />);
    expect(container.firstElementChild).toHaveClass('grid-cols-[auto_1fr_auto]');
    expect(container.firstElementChild?.firstElementChild).not.toBeEmptyDOMElement();
  });
});

// SHE-46: child keyboard actions belong to their own control.
it.each(['Enter', ' '])('activates the row itself with %s', key => {
  const click = vi.fn();
  const view = render(<ObjectRow title="Row" onClick={click} />);
  fireEvent.keyDown(view.container.firstElementChild!, { key });
  expect(click).toHaveBeenCalledOnce();
});
it.each(['checkbox', 'button'])('does not turn a nested %s key into a row click', kind => {
  const click = vi.fn();
  render(<ObjectRow title="Row" onClick={click} selectable trailing={<button>Action</button>} />);
  const control = screen.getByRole(kind, { name: kind === 'checkbox' ? '행 선택' : 'Action' });
  expect(fireEvent.keyDown(control, { key: kind === 'checkbox' ? ' ' : 'Enter' })).toBe(true);
  expect(click).not.toHaveBeenCalled();
});

it.each(['{Enter}', ' '])('activates the row itself on %s via user keyboard interaction', async key => {
  const user = userEvent.setup();
  const rowClick = vi.fn();
  const view = render(<ObjectRow title="Row" onClick={rowClick} />);
  const row = view.container.firstElementChild as HTMLElement;
  row.focus();
  await user.keyboard(key);
  expect(rowClick).toHaveBeenCalledOnce();
});

it.each(['{Enter}', ' '])('does not activate the row when activating a nested button with %s', async key => {
  const user = userEvent.setup();
  const rowClick = vi.fn();
  const actionClick = vi.fn();
  render(
    <ObjectRow
      title="Row"
      onClick={rowClick}
      trailing={<button type="button" onClick={actionClick}>Action</button>}
    />,
  );
  const button = screen.getByRole('button', { name: 'Action' });
  button.focus();
  await user.keyboard(key);
  expect(actionClick).toHaveBeenCalledOnce();
  expect(rowClick).not.toHaveBeenCalled();
});

it('does not activate the row when clicking a nested button or its inner content', async () => {
  const user = userEvent.setup();
  const rowClick = vi.fn();
  const actionClick = vi.fn();
  render(
    <ObjectRow
      title="Row"
      onClick={rowClick}
      trailing={<button type="button" onClick={actionClick}><span>Action</span></button>}
    />,
  );
  await user.click(screen.getByText('Action'));
  expect(actionClick).toHaveBeenCalledOnce();
  expect(rowClick).not.toHaveBeenCalled();
});

it('does not activate the row when clicking a nested link in title', async () => {
  const user = userEvent.setup();
  const rowClick = vi.fn();
  const linkClick = vi.fn((event: React.MouseEvent<HTMLAnchorElement>) => event.preventDefault());
  render(
    <ObjectRow
      title={<a href="#detail" onClick={linkClick}>Detail link</a>}
      onClick={rowClick}
    />,
  );
  await user.click(screen.getByRole('link', { name: 'Detail link' }));
  expect(linkClick).toHaveBeenCalledOnce();
  expect(rowClick).not.toHaveBeenCalled();
});
