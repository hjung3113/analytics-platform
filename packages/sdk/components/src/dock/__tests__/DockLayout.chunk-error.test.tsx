import { useEffect, type ComponentType } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { DockLayout } from '../DockLayout';
import type { DockEngineProps } from '../DockEngine';
import { group } from './harness';

// A rejected DockEngine chunk import must not escape Suspense and unmount the app. DockLayout catches it layout-locally, shows the danger
// StateMessage and retries by recreating the lazy import (same contract as EChart.chunk-error.test.tsx). Mocks the '../DockEngine' chunk import.
const implState = vi.hoisted(() => ({
  mode: 'reject' as 'reject' | 'resolve',
  instances: 0,
}));

vi.mock('../DockEngine', () => {
  if (implState.mode === 'reject') return Promise.reject(new Error('Failed to fetch dynamically imported module: DockEngine'));
  // new Promise form: @ap/tsconfig base lib is ES2022, so Promise.withResolvers is unavailable.
  return new Promise<{ default: ComponentType<DockEngineProps> }>(resolve => setTimeout(() => resolve({ default: MockEngine }), 0));
});

function MockEngine(props: DockEngineProps) {
  useEffect(() => { implState.instances++; }, []);
  return <div data-testid="engine" data-panels={props.panels.map(panel => panel.id).join(',')} />;
}

afterEach(cleanup);

describe('DockLayout chunk load failure', () => {
  it('shows a layout-local error state, keeps siblings mounted, and renders the engine after retry', async () => {
    render(<I18nProvider>
      <div data-testid="sibling">sibling-content</div>
      <DockLayout panels={[{ id: 'a', title: 'A', render: () => null }]} layout={group(['a'])} onLayoutChange={() => {}} separatorLabel={() => 'sep'} label="배치" />
    </I18nProvider>);

    const alert = await screen.findByRole('alert', {}, { timeout: 2000 });
    expect(screen.getByTestId('sibling')).toHaveTextContent('sibling-content');
    expect(screen.getByRole('region', { name: '배치' })).toBeInTheDocument();

    implState.mode = 'resolve';
    fireEvent.click(within(alert).getByRole('button'));
    await screen.findByTestId('engine', {}, { timeout: 2000 });
    expect(implState.instances).toBe(1);
    expect(screen.getByTestId('engine')).toHaveAttribute('data-panels', 'a');
  });
});
