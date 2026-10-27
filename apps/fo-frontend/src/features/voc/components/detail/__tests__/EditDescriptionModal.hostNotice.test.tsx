// The stale-write conflict reaches the actor through the host's notice, not a toast library: one warning with a
// "다시 불러오기" action and the 10 s lifetime the standalone toast had.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/voc/hooks/useVocEditDescriptionMutation', () => ({
  useVocEditDescriptionMutation: vi.fn(),
}));

import { useVocEditDescriptionMutation } from '@/features/voc/hooks/useVocEditDescriptionMutation';
import { ApiError } from '@/lib/api/types';
import { type HostNotice, type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { tanstackHost } from '@/lib/host/tanstack-host';
import { EditDescriptionModal } from '../EditDescriptionModal';

const VOC = {
  id: 'voc-uuid-3333',
  title: 'title',
  updated_at: '2026-05-01T00:00:00Z',
  description_rich_content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'body' }] }],
  },
};

const notices: HostNotice[] = [];
const errors: string[] = [];
const HOST: HostSeam = {
  ...tanstackHost,
  notify: (notice) => {
    notices.push(notice);
    return String(notices.length);
  },
  dismiss: () => {},
  notifyError: (message) => {
    errors.push(message);
  },
  notifySuccess: () => {},
};

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(
    QueryClientProvider,
    { client },
    React.createElement(HostSeamProvider, { value: HOST }, children),
  );
}

function mutationFailingWith(error: ApiError) {
  const mutate = vi.fn((_vars: unknown, options?: { onError?: (err: ApiError) => void }) => {
    options?.onError?.(error);
  });
  vi.mocked(useVocEditDescriptionMutation).mockReturnValue({
    mutate,
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useVocEditDescriptionMutation>);
}

beforeEach(() => {
  notices.length = 0;
  errors.length = 0;
});

describe('<EditDescriptionModal> host notices', () => {
  it('raises the stale-write conflict as one warning notice carrying the reload action', async () => {
    mutationFailingWith(new ApiError(409, { code: 'conflict.stale_write', message: 'stale' }));
    render(<EditDescriptionModal voc={VOC} open={true} onClose={vi.fn()} />, { wrapper });

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: '수정 저장' }));
    });

    expect(notices).toHaveLength(1);
    expect(notices[0]).toEqual({
      tone: 'warning',
      message:
        'VOC가 변경되었습니다. 편집 중인 내용을 잃지 않으려면 [다시 불러오기]를 눌러 새로 시작하세요.',
      durationMs: 10000,
      action: { label: '다시 불러오기', onAction: expect.any(Function) },
    });
    expect(errors).toEqual([]);
  });

  it('raises any other failure as an error notice', async () => {
    mutationFailingWith(new ApiError(500, { code: 'rate_limited.actor', message: 'boom' }));
    render(<EditDescriptionModal voc={VOC} open={true} onClose={vi.fn()} />, { wrapper });

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: '수정 저장' }));
    });

    expect(errors).toHaveLength(1);
    expect(notices).toEqual([]);
  });
});
