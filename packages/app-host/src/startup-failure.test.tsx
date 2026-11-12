import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { StartupFailure, startOrFail } from './startup-failure';

describe('StartupFailure (#154 FIX1 C2)', () => {
  afterEach(cleanup);

  it('shows fixed copy and a retry button, nothing from the error', () => {
    render(<StartupFailure />);
    expect(screen.getByText('화면을 시작할 수 없습니다')).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
  });

  it.each([
    ['rejects', () => Promise.reject(new Error('secret detail'))],
    ['throws', () => { throw new Error('secret detail'); }],
  ])('renders the failure screen when the startup %s, without the error text', async (_name, start) => {
    const nodes: ReactNode[] = [];
    await startOrFail({ render: (n) => nodes.push(n) }, start);
    expect(nodes).toHaveLength(1);
    render(<>{nodes[0]}</>);
    expect(screen.getByText('화면을 시작할 수 없습니다')).toBeTruthy();
    expect(screen.queryByText(/secret detail/)).toBeNull();
  });
});
