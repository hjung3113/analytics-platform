import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';

const mutate = vi.fn();
vi.mock('@/features/voc-cluster/hooks/useCreateFindingFromCluster', () => ({
  useCreateFindingFromCluster: () => ({ mutate, reset: vi.fn(), isPending: false }),
}));

import { CreateFindingFromClusterModal } from './CreateFindingFromClusterModal';

function renderModal(canLink: boolean) {
  const navigate = vi.fn();
  const notifySuccess = vi.fn();
  const seam: HostSeam = {
    canLink: () => canLink,
    Link: ({ children }) => <a href="#host">{children}</a>,
    notifyError: vi.fn(),
    notifySuccess,
    useNavigate: () => navigate,
  };
  const onClose = vi.fn();
  render(
    <HostSeamProvider value={seam}>
      <CreateFindingFromClusterModal open clusterId="c-1" onClose={onClose} />
    </HostSeamProvider>,
  );
  return { navigate, notifySuccess, onClose };
}

async function submit() {
  fireEvent.change(screen.getByLabelText(/제목/), { target: { value: '로그 유실' } });
  fireEvent.change(screen.getByLabelText(/요약/), { target: { value: '수집 누락' } });
  fireEvent.click(screen.getByTestId('create-finding-from-cluster-submit'));
  await waitFor(() => expect(mutate).toHaveBeenCalled());
  const [, options] = mutate.mock.calls.at(-1) as [
    unknown,
    { onSuccess: (f: { id: string }) => void },
  ];
  options.onSuccess({ id: 'f-9' });
}

describe('CreateFindingFromClusterModal success', () => {
  it('opens the new Finding when the host can link to it', async () => {
    const { navigate, notifySuccess, onClose } = renderModal(true);
    await submit();
    expect(onClose).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/findings/f-9');
    expect(notifySuccess).not.toHaveBeenCalled();
  });

  it('closes with a success notice and moves nowhere when the host cannot open Findings', async () => {
    const { navigate, notifySuccess, onClose } = renderModal(false);
    await submit();
    expect(onClose).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(notifySuccess).toHaveBeenCalledWith('Finding이 생성되었습니다.');
  });
});
