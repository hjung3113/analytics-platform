import { render } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { describe, expect, it } from 'vitest';
import { ListShell } from '../ListShell';

/** Actions that render elsewhere (a host-owned primary action portals into the page header). */
function PortaledAction() {
  return createPortal(<button type="button">Create</button>, document.body);
}

const header = (container: HTMLElement) => container.querySelector('[data-shell-header="toolbar"]');

// #2455: a host that owns the page title leaves the toolbar with portaled actions only, which drew an empty 50px row.
describe('ListShell toolbar', () => {
  it('collapses an actions-only toolbar whose actions render nothing in place', () => {
    const { container } = render(<ListShell toolbar={{ actions: <PortaledAction /> }} list={<p>rows</p>} />);
    expect(header(container)).toHaveClass('has-[[data-shell-header-actions]:empty]:hidden');
    expect(container.querySelector('[data-shell-header-actions]')).toBeEmptyDOMElement();
  });

  it('draws no toolbar row when the toolbar has no title, subtitle or actions', () => {
    const { container } = render(<ListShell toolbar={{}} list={<p>rows</p>} />);
    expect(header(container)).toBeNull();
  });

  it('keeps a toolbar with a title or visible actions as it was', () => {
    const { container } = render(<ListShell toolbar={{ title: 'Inbox', actions: <button type="button">Sort</button> }} list={<p>rows</p>} />);
    expect(header(container)).not.toHaveClass('has-[[data-shell-header-actions]:empty]:hidden');
    expect(header(container)).toHaveTextContent('Inbox');
  });
});
