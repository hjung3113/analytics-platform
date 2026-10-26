import type { ComponentType } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { EChart, type EChartProps } from './EChart';

// #915: every chart shares one lazy chunk component, so one failed chunk load fails every chart mounted with it. Each chart keeps its
// own error state and `다시 시도`; a retry in one chart loads the chunk again for that chart and leaves the others' state alone.
// Its own file: the shared lazy is module state, so a resolved load from another test would hide the failure.
const implState = vi.hoisted(() => ({ mode: 'reject' as 'reject' | 'resolve', imports: 0 }));

vi.mock('./EChartImpl', () => {
  implState.imports++;
  if (implState.mode === 'reject') return Promise.reject(new Error('Failed to fetch dynamically imported module: EChartImpl'));
  return new Promise<{ default: ComponentType<EChartProps> }>(resolve => setTimeout(() => resolve({ default: MockImpl }), 0));
});

function MockImpl(props: EChartProps) {
  return <div role="img" aria-label={props.ariaLabel} />;
}

afterEach(cleanup);

describe('EChart charts sharing a failed chunk (#915)', () => {
  it('fails every chart, and a retry in one chart recovers that chart only', async () => {
    render(<I18nProvider>
      <section aria-label="A"><EChart option={{}} ariaLabel="chart A" /></section>
      <section aria-label="B"><EChart option={{}} ariaLabel="chart B" /></section>
    </I18nProvider>);
    const a = screen.getByRole('region', { name: 'A' });
    const b = screen.getByRole('region', { name: 'B' });
    await within(a).findByRole('alert');
    await within(b).findByRole('alert');
    expect(implState.imports).toBe(1);

    // Mounted after the failure, before any retry: it gets the failed load and its own retry, without a new import.
    render(<I18nProvider><section aria-label="D"><EChart option={{}} ariaLabel="chart D" /></section></I18nProvider>);
    await within(screen.getByRole('region', { name: 'D' })).findByRole('alert');
    expect(implState.imports).toBe(1);

    implState.mode = 'resolve';
    fireEvent.click(within(within(a).getByRole('alert')).getByRole('button'));
    await within(a).findByRole('img', { name: 'chart A' });
    expect(within(b).getByRole('alert')).toBeInTheDocument();

    // A chart mounted after the recovery shares the new, loaded component.
    render(<I18nProvider><section aria-label="C"><EChart option={{}} ariaLabel="chart C" /></section></I18nProvider>);
    expect(within(screen.getByRole('region', { name: 'C' })).getByRole('img', { name: 'chart C' })).toBeInTheDocument();

    fireEvent.click(within(within(b).getByRole('alert')).getByRole('button'));
    await within(b).findByRole('img', { name: 'chart B' });
  });
});
