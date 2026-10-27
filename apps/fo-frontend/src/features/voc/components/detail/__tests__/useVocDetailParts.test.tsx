import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen } from '@testing-library/react';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cross-system/useVocDetail', () => ({ useVocDetail: vi.fn() }));
vi.mock('@/lib/api/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/me')>()),
  useMeBridge: vi.fn(),
}));
// The body has its own tests (VocDetailPanel.test.tsx); here only that the hook hands it over.
vi.mock('@/features/voc/components/detail/VocDetailBody', () => ({
  VocDetailBody: ({ voc }: { voc: { display_id: string } }) => (
    <div data-testid="body-stub">{voc.display_id}</div>
  ),
}));

import { useMeBridge } from '@/lib/api/me';
import { useVocDetail } from '@/lib/cross-system/useVocDetail';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { tanstackHost } from '@/lib/host/tanstack-host';
import type { DetailCloseGuard } from '../useDetailCloseGuard';
import { useVocDetailParts } from '../useVocDetailParts';
import { DETAIL_ENVELOPE, makeDetailQuery, makeMeQuery } from './_fixtures';

const titles: Array<string | null> = [];
const HOST: HostSeam = {
  ...tanstackHost,
  useTitle: (title) => {
    titles.push(title);
  },
  absoluteHref: (to) => `https://fo.example${to}`,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return (
    <QueryClientProvider client={client}>
      <HostSeamProvider value={HOST}>{children}</HostSeamProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  titles.length = 0;
  vi.mocked(useMeBridge).mockReturnValue(makeMeQuery());
});

describe('useVocDetailParts', () => {
  it('returns the title, header actions and body of a loaded VOC and sets the host title', () => {
    vi.mocked(useVocDetail).mockReturnValue(makeDetailQuery());
    const { result } = renderHook(
      () => useVocDetailParts({ vocId: DETAIL_ENVELOPE.id, onClose: vi.fn() }),
      { wrapper },
    );

    const parts = result.current;
    expect(parts.view.kind).toBe('full');
    expect(parts.title).toBe(`${DETAIL_ENVELOPE.display_id} · ${DETAIL_ENVELOPE.title}`);
    expect(parts.headerActions).toBeTruthy();
    expect(parts.body).toBeTruthy();
    expect(titles.at(-1)).toBe(`${DETAIL_ENVELOPE.display_id} · ${DETAIL_ENVELOPE.title}`);

    render(parts.body as React.ReactElement, { wrapper });
    expect(screen.getByTestId('body-stub')).toHaveTextContent(DETAIL_ENVELOPE.display_id);
  });

  it('reports a loading read as loading parts and releases the host title', () => {
    vi.mocked(useVocDetail).mockReturnValue(
      makeDetailQuery({ data: undefined, isLoading: true, isSuccess: false }),
    );
    const { result } = renderHook(
      () => useVocDetailParts({ vocId: DETAIL_ENVELOPE.id, onClose: vi.fn() }),
      { wrapper },
    );

    expect(result.current.view.kind).toBe('loading');
    expect(titles.at(-1)).toBeNull();
  });

  it('calls onClose for a VOC outside the selected Managed System scope and shows nothing', () => {
    vi.mocked(useVocDetail).mockReturnValue(makeDetailQuery());
    const onClose = vi.fn();
    const { result } = renderHook(
      () =>
        useVocDetailParts({
          vocId: DETAIL_ENVELOPE.id,
          managedSystemId: 'another-managed-system',
          onClose,
        }),
      { wrapper },
    );

    expect(result.current.view.kind).toBe('hidden');
    expect(result.current.body).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('starts a recovered full body with a clean close guard after the body was discarded', () => {
    vi.mocked(useVocDetail).mockReturnValue(makeDetailQuery());
    const onClose = vi.fn();
    const { result, rerender } = renderHook(
      () => useVocDetailParts({ vocId: DETAIL_ENVELOPE.id, onClose }),
      { wrapper },
    );
    const bodyProps = () =>
      (result.current.body as React.ReactElement<{ closeGuard: DetailCloseGuard }>).props
        .closeGuard;

    act(() => bodyProps().setComposerDirty(true));
    act(() => result.current.requestClose());
    expect(bodyProps().dirtyConfirmOpen).toBe(true);

    vi.mocked(useVocDetail).mockReturnValue(
      makeDetailQuery({ data: undefined, isError: true, isSuccess: false, error: new Error('x') }),
    );
    rerender();
    expect(result.current.view.kind).toBe('error');

    vi.mocked(useVocDetail).mockReturnValue(makeDetailQuery());
    rerender();
    expect(result.current.view.kind).toBe('full');
    expect(bodyProps().dirtyConfirmOpen).toBe(false);
    act(() => result.current.requestClose());
    expect(onClose).toHaveBeenCalledOnce();
  });
});
