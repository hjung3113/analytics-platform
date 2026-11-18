import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { VocClusterDto } from '@ap/feature-shared';
import { type HostSeam, HostSeamProvider } from '../../../../lib/host/host-seam';

const mutate = vi.fn();
vi.mock('../../hooks/useCreateFindingFromCluster', () => ({
  useCreateFindingFromCluster: () => ({ mutate, reset: vi.fn(), isPending: false }),
}));

import { CreateFindingFromClusterModal } from './CreateFindingFromClusterModal';

const cluster: Pick<VocClusterDto, 'id' | 'title' | 'summary' | 'members'> = {
  id: '00000000-0000-4000-8000-000000000001',
  title: '결제 단계에서 반복되는 오류',
  summary: '결제 요청이 실패한다는 보고가 반복됩니다.',
  members: [
    {
      voc_id: '00000000-0000-4000-8000-000000000011',
      added_by: '00000000-0000-4000-8000-000000000021',
      added_at: '2026-11-18T00:00:00.000Z',
      display_id: 'VOC-11',
      title: '결제 요청 실패',
    },
    {
      voc_id: '00000000-0000-4000-8000-000000000012',
      added_by: '00000000-0000-4000-8000-000000000021',
      added_at: '2026-11-18T00:01:00.000Z',
      display_id: 'VOC-12',
      title: '결제 후 응답 지연',
    },
  ],
};

function renderModal(clusterValue = cluster) {
  const seam: HostSeam = {
    canLink: () => false,
    Link: ({ children }) => <a href="#host">{children}</a>,
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
    useNavigate: () => vi.fn(),
  };
  render(
    <HostSeamProvider value={seam}>
      <CreateFindingFromClusterModal open cluster={clusterValue} onClose={vi.fn()} />
    </HostSeamProvider>,
  );
}

describe('CreateFindingFromClusterModal evidence selection', () => {
  it('prefills from the cluster, starts with all members selected, and submits the checked ids', async () => {
    renderModal();

    expect(screen.getByLabelText(/제목/)).toHaveValue(cluster.title);
    expect(screen.getByLabelText(/요약/)).toHaveValue(cluster.summary);
    expect(screen.getByText('근거로 가져올 VOC 2건')).toBeInTheDocument();

    const first = screen.getByRole('checkbox', { name: /VOC-11/ });
    const second = screen.getByRole('checkbox', { name: /VOC-12/ });
    expect(first).toBeChecked();
    expect(second).toBeChecked();

    fireEvent.click(second);
    expect(screen.getByText('근거로 가져올 VOC 1건')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('create-finding-from-cluster-submit'));
    await waitFor(() => expect(mutate).toHaveBeenCalled());

    expect(mutate).toHaveBeenCalledWith(
      {
        clusterId: cluster.id,
        body: {
          title: cluster.title,
          summary: cluster.summary,
          severity: 'medium',
          evidence_voc_ids: [cluster.members?.[0]?.voc_id],
        },
      },
      expect.any(Object),
    );
  });

  it('hides the checklist when the authorized cluster has no visible members', () => {
    renderModal({ ...cluster, members: [] });

    expect(screen.queryByText(/근거로 가져올 VOC/)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
