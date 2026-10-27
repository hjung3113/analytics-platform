// A host that shows the screen's identity itself (the platform page head) drops the inline route kicker (UX-5); the standalone seam keeps it.
import { noticeHost, registerNoticeHost } from '@/test/notice-host';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/registry-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/registry-reads')>()),
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [], total: 0 })),
}));

noticeHost.notify.mockImplementation(() => 'toast-host-title');
beforeAll(registerNoticeHost);

import { HostSeamProvider, useHostSeam } from '@/lib/host/host-seam';
import { VocTriageScreen } from '../VocTriageScreen';

function Screen({ hostOwnsTitle }: { hostOwnsTitle?: boolean }) {
  const base = useHostSeam();
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <HostSeamProvider value={hostOwnsTitle === undefined ? base : { ...base, hostOwnsTitle }}>
        <VocTriageScreen
          items={[]}
          selectedId={null}
          activeTab="unassigned"
          onSelectVoc={vi.fn()}
          onTabChange={vi.fn()}
        />
      </HostSeamProvider>
    </QueryClientProvider>
  );
}

describe('VocTriageScreen toolbar identity', () => {
  it('shows the "콘솔 · Triage" kicker under a host that does not own the title', () => {
    render(<Screen />);
    expect(screen.getByTestId('triage-kicker')).toBeInTheDocument();
  });

  it('drops the kicker, and keeps the rest of the toolbar, when the host owns the title', () => {
    render(<Screen hostOwnsTitle />);
    expect(screen.queryByTestId('triage-kicker')).toBeNull();
    expect(screen.getByTestId('triage-toolbar')).toBeInTheDocument();
  });
});
