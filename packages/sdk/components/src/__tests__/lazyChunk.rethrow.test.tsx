import { Component, type ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChunkLoadBoundary } from '../lazyChunk';

// ChunkLoadBoundary contains a rejected chunk import only. Any other render error goes on to the nearest screen boundary (it reports it).
class Outer extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  render() { return this.state.error ? <div data-testid="outer">caught {(this.state.error as Error).message}</div> : this.props.children; }
}
function Boom({ error }: { error: Error }): ReactNode { throw error; }

afterEach(cleanup);

describe('ChunkLoadBoundary', () => {
  it('rethrows a non-chunk error to the next boundary and does not call onError', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    render(<Outer><ChunkLoadBoundary onError={onError}><Boom error={new Error('render exploded')} /></ChunkLoadBoundary></Outer>);
    expect(screen.getByTestId('outer')).toHaveTextContent('caught render exploded');
    expect(onError).not.toHaveBeenCalled();
  });

  it('keeps a chunk-load failure: calls onError and renders nothing, the outer boundary is not reached', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    render(<Outer><ChunkLoadBoundary onError={onError}><Boom error={new TypeError('Failed to fetch dynamically imported module: /a.js')} /></ChunkLoadBoundary></Outer>);
    expect(screen.queryByTestId('outer')).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
