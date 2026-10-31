// The slot title switch (#1168 C-1): the drawer path builds the parts with
// `titleInHeader`, the hook forwards it to the body, and the header title stays.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cross-system/useVocDetail', () => ({ useVocDetail: vi.fn() }));
vi.mock('@/lib/api/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/me')>()),
  useMeBridge: vi.fn(),
}));
vi.mock('@/features/voc/components/detail/VocDetailBody', () => ({
  VocDetailBody: ({
    titleInHeader,
    voc,
  }: {
    titleInHeader?: boolean;
    voc: { display_id: string };
  }) => (
    <div data-testid="body-stub" data-title-in-header={titleInHeader ? 'true' : undefined}>
      {voc.display_id}
    </div>
  ),
}));

import { useMeBridge } from '@/lib/api/me';
import { useVocDetail } from '@/lib/cross-system/useVocDetail';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { tanstackHost } from '@/test/host-adapters/lib/host/tanstack-host';
import { useVocDetailParts } from '../useVocDetailParts';
import { DETAIL_ENVELOPE, makeDetailQuery, makeMeQuery } from './_fixtures';

const HOST: HostSeam = {
  ...tanstackHost,
  useTitle: () => {},
  absoluteHref: (to) => `https://fo.example${to}`,
};

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <HostSeamProvider value={HOST}>{children}</HostSeamProvider>
    </QueryClientProvider>
  );
}

const bodyProps = (result: { current: { body: unknown } }) =>
  (result.current.body as React.ReactElement<{ titleInHeader?: boolean }>).props;

beforeEach(() => {
  vi.mocked(useMeBridge).mockReturnValue(makeMeQuery());
  vi.mocked(useVocDetail).mockReturnValue(makeDetailQuery());
});

describe('useVocDetailParts slot title switch (#1168 C-1)', () => {
  it('the drawer path (titleInHeader) forwards the switch to the body and keeps the header title', () => {
    const { result } = renderHook(
      () =>
        useVocDetailParts({ vocId: DETAIL_ENVELOPE.id, onClose: vi.fn(), titleInHeader: true }),
      { wrapper },
    );

    expect(result.current.title).toBe(`${DETAIL_ENVELOPE.display_id} · ${DETAIL_ENVELOPE.title}`);
    expect(bodyProps(result).titleInHeader).toBe(true);
  });

  it('the full-page frame (no switch) leaves the body title on', () => {
    const { result } = renderHook(
      () => useVocDetailParts({ vocId: DETAIL_ENVELOPE.id, onClose: vi.fn() }),
      { wrapper },
    );

    expect(bodyProps(result).titleInHeader).toBeUndefined();
  });
});
