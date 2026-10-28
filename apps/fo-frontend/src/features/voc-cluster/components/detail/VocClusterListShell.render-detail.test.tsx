import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IDS, confirmedNoFinding, populatedList } from '@/test/fixtures/voc-clusters';
import { VocClusterListShell } from './VocClusterListShell';

const apiRequestMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiRequest: apiRequestMock,
}));
vi.mock('@/lib/api/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/me')>()),
  useMeBridge: () => ({ data: undefined }),
}));

// The real ListShell registers the panel in the same slot contract as the standalone AppFrame.
function SlotHost() {
  const { ref } = useDetailPanelSlotHost();
  return <div ref={ref} />;
}

function renderList(renderDetail?: Parameters<typeof VocClusterListShell>[0]['renderDetail']) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DetailPanelSlotProvider>
        <VocClusterListShell
          selectedId={confirmedNoFinding.id}
          onSelect={() => undefined}
          onCloseDetail={onCloseDetail}
          managedSystemId={IDS.managedSystem}
          {...(renderDetail !== undefined ? { renderDetail } : {})}
        />
        <SlotHost />
      </DetailPanelSlotProvider>
    </QueryClientProvider>,
  );
}

const onCloseDetail = vi.fn();

describe('VocClusterListShell renderDetail (761p2)', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    onCloseDetail.mockReset();
    apiRequestMock.mockResolvedValue({ data: populatedList });
  });

  it('places what the host returns as the detail panel and routes its close to onCloseDetail', async () => {
    const user = userEvent.setup();
    const renderDetail = vi.fn((id: string, { onClose }: { onClose: () => void }) => (
      <button type="button" data-testid="host-detail" onClick={onClose}>
        {id}
      </button>
    ));
    renderList(renderDetail);
    const detail = await screen.findByTestId('host-detail');
    expect(detail).toHaveTextContent(confirmedNoFinding.id);
    expect(renderDetail).toHaveBeenCalledWith(confirmedNoFinding.id, {
      onClose: expect.any(Function),
    });
    expect(screen.queryByTestId('cluster-detail-skeleton')).not.toBeInTheDocument();
    await user.click(detail);
    expect(onCloseDetail).toHaveBeenCalledWith();
  });

  it('draws no panel when the host returns undefined', async () => {
    renderList(() => undefined);
    await screen.findByText(confirmedNoFinding.title);
    expect(screen.queryByTestId('cluster-detail-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cluster-detail-title')).not.toBeInTheDocument();
  });

  it('keeps the built-in detail panel when no renderDetail is given (standalone)', async () => {
    renderList();
    expect(await screen.findByTestId('cluster-detail-skeleton')).toBeInTheDocument();
  });
});
