import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  DetailPanelSlotProvider,
  ListShell,
  PageShell,
  ShellHeader,
  WorkbenchShell,
  useDetailPanelSlotHost,
} from '../index';

describe('Three-shell taxonomy (ADR-0020)', () => {
  it('PageShell renders with data-shell="page" and 50px header', () => {
    const { container } = render(<PageShell header={{ title: 'Home' }}>body</PageShell>);
    const shell = container.querySelector('[data-shell="page"]');
    expect(shell).toBeInTheDocument();
    const header = container.querySelector('[data-shell-header]');
    expect(header).toBeInTheDocument();
    expect(header?.getAttribute('data-toolbar-height')).toBe('50');
  });

  it('ListShell renders with data-shell="list" and tabs slot', () => {
    const { container } = render(
      <ListShell
        toolbar={{ title: 'Inbox' }}
        tabs={<div data-testid="tabs">tabs</div>}
        list={
          <ul>
            <li>row</li>
          </ul>
        }
      />,
    );
    expect(container.querySelector('[data-shell="list"]')).toBeInTheDocument();
    expect(screen.getByTestId('tabs')).toBeInTheDocument();
    expect(screen.getByText('row')).toBeInTheDocument();
  });

  it('ListShell tabs row locks to the 50px h-toolbar rhythm', () => {
    const { container } = render(
      <ListShell
        tabs={<div data-testid="tabs">tabs</div>}
        list={
          <ul>
            <li>row</li>
          </ul>
        }
      />,
    );
    const tabsRow = container.querySelector('[data-list-shell-tabs]');
    expect(tabsRow?.className).toContain('h-toolbar');
    expect(tabsRow).toHaveAttribute('data-toolbar-height', '50');
  });

  it('WorkbenchShell renders with data-shell="workbench"', () => {
    const { container } = render(
      <WorkbenchShell toolbar={{ title: 'Triage' }}>workbench body</WorkbenchShell>,
    );
    expect(container.querySelector('[data-shell="workbench"]')).toBeInTheDocument();
    expect(screen.getByText(/workbench body/)).toBeInTheDocument();
  });
});

describe('ShellHeader 50px rhythm', () => {
  it('every variant has h-toolbar class', () => {
    const { rerender, container } = render(<ShellHeader title="A" />);
    expect(container.querySelector('header')?.className).toContain('h-toolbar');
    rerender(<ShellHeader title="A" variant="toolbar" />);
    expect(container.querySelector('header')?.className).toContain('h-toolbar');
    rerender(<ShellHeader title="A" variant="drawer" />);
    expect(container.querySelector('header')?.className).toContain('h-toolbar');
  });

  it('variant data attribute reflects prop', () => {
    const { rerender, container } = render(<ShellHeader title="A" />);
    expect(container.querySelector('header')?.getAttribute('data-shell-header')).toBe('default');
    rerender(<ShellHeader title="A" variant="toolbar" />);
    expect(container.querySelector('header')?.getAttribute('data-shell-header')).toBe('toolbar');
    rerender(<ShellHeader title="A" variant="drawer" />);
    expect(container.querySelector('header')?.getAttribute('data-shell-header')).toBe('drawer');
  });
});

function Host() {
  const { ref } = useDetailPanelSlotHost();
  return <div data-testid="host" ref={ref} />;
}

describe('useDetailPanelContent forwarding', () => {
  it('shell with detailPanel prop renders the content into the slot host', () => {
    render(
      <DetailPanelSlotProvider>
        <Host />
        <ListShell toolbar={{ title: 'I' }} list={<div />} detailPanel={<aside>panel</aside>} />
      </DetailPanelSlotProvider>,
    );
    expect(within(screen.getByTestId('host')).getByText('panel')).toBeInTheDocument();
  });

  it('shell without detailPanel leaves the slot host empty', () => {
    render(
      <DetailPanelSlotProvider>
        <Host />
        <PageShell header={{ title: 'H' }}>body</PageShell>
      </DetailPanelSlotProvider>,
    );
    expect(screen.getByTestId('host')).toBeEmptyDOMElement();
  });

  it('shell unmount clears slot', () => {
    const { rerender } = render(
      <DetailPanelSlotProvider>
        <Host />
        <ListShell toolbar={{ title: 'I' }} list={<div />} detailPanel={<aside>panel</aside>} />
      </DetailPanelSlotProvider>,
    );
    expect(screen.getByText('panel')).toBeInTheDocument();
    rerender(
      <DetailPanelSlotProvider>
        <Host />
      </DetailPanelSlotProvider>,
    );
    expect(screen.queryByText('panel')).not.toBeInTheDocument();
  });
});
