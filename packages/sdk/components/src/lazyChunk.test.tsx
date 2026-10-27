import { Suspense } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChunkLoadBoundary, lazyChunk, useLazyChunk } from './lazyChunk';

afterEach(cleanup);

function Probe({ chunk }: { chunk: ReturnType<typeof lazyChunk<{ label: string }>> }) {
  const { Component, failed, attempt, onError, retry } = useLazyChunk(chunk);
  if (failed) return <button onClick={retry}>retry</button>;
  return <ChunkLoadBoundary key={attempt} onError={onError}><Suspense fallback="loading"><Component label="loaded" /></Suspense></ChunkLoadBoundary>;
}

describe('useLazyChunk', () => {
  it('shows the failed state, then loads the component after a retry', async () => {
    let fail = true;
    const chunk = lazyChunk<{ label: string }>(() => (fail ? Promise.reject(new Error('chunk')) : Promise.resolve({ default: ({ label }) => <p>{label}</p> })));
    render(<Probe chunk={chunk} />);
    const button = await screen.findByRole('button', { name: 'retry' });
    fail = false;
    fireEvent.click(button);
    expect(await screen.findByText('loaded')).toBeTruthy();
  });
});
