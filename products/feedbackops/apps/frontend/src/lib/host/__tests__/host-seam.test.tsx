import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { HostLink, type HostSeam, HostSeamProvider } from '../host-seam';

describe('host seam', () => {
  it('useHostSeam-backed components throw without a provider', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<HostLink to="/vocs">x</HostLink>)).toThrow('HostSeamProvider is missing');
    error.mockRestore();
  });

  it('HostLink hands every prop and the ref to the provided Link', () => {
    const seam: HostSeam = {
      canLink: () => true,
      notifyError: () => undefined,
      notifySuccess: () => undefined,
      Link: ({ to, children, ref, ...rest }) => (
        <a href={to} ref={ref as React.Ref<HTMLAnchorElement>} {...rest}>
          {children}
        </a>
      ),
    };
    const ref = createRef<HTMLAnchorElement>();
    render(
      <HostSeamProvider value={seam}>
        <HostLink to="/vocs?view=inbox" className="row" aria-describedby="tip" ref={ref}>
          열기
        </HostLink>
      </HostSeamProvider>,
    );
    const link = screen.getByRole('link', { name: '열기' });
    expect(link).toHaveAttribute('href', '/vocs?view=inbox');
    expect(link).toHaveClass('row');
    expect(link).toHaveAttribute('aria-describedby', 'tip');
    expect(ref.current).toBe(link);
  });
});
