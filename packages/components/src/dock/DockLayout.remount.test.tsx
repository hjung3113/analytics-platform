import type { ComponentType } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { DockLayout } from './DockLayout';
import type { DockEngineProps } from './DockEngine';
import { group } from './__tests__/harness';

// #915: a layout mounted after the DockEngine chunk has loaded once (a board revisit, a workspace on the next page) draws the engine in its
// first commit. A per-mount lazy component re-suspended every time and waited out React's 300 ms fallback throttle.
vi.mock('./DockEngine', () => new Promise<{ default: ComponentType<DockEngineProps> }>(resolve => setTimeout(() => resolve({ default: MockEngine }), 0)));

function MockEngine(props: DockEngineProps) {
  return <div data-testid="engine" data-panels={props.panels.map(panel => panel.id).join(',')} />;
}

afterEach(cleanup);

const layout = (id: string) => <I18nProvider>
  <DockLayout panels={[{ id, title: id, render: () => null }]} layout={group([id])} onLayoutChange={() => {}} separatorLabel={() => 'sep'} label="배치" />
</I18nProvider>;

describe('DockLayout after the engine chunk has loaded (#915)', () => {
  it('draws a newly mounted layout without the loading fallback', async () => {
    const first = render(layout('a'));
    await screen.findByTestId('engine');
    first.unmount();

    render(layout('b'));
    // First commit of the new mount: the engine is there and no aria-busy skeleton was drawn.
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByTestId('engine')).toHaveAttribute('data-panels', 'b');
  });
});
