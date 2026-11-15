import { useSurveyBuilderController } from './hooks/useSurveyBuilderController';
import { ApiError } from '@/lib/api/types';
import { apiPath } from '@/lib/api/path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Survey } from '../../types';
import { SurveyBuilder } from './SurveyBuilder';

const apiClient = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiClient,
}));

// useSurveys imports the client module directly (bridge-safe graph, #653), not the barrel mocked above.
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiClient,
}));

const SURVEY_ID = '00000000-0000-4000-8000-000000000001';

const survey: Survey = {
  id: SURVEY_ID,
  display_id: 'SRV-1',
  title: 'Q3 사용성 진단',
  type: 'discovery',
  status: 'draft',
  description: '기존 설명',
  primary_managed_system_id: '11111111-1111-4111-8111-111111111111',
  analytics_area_id: null,
  operator_actor_id: null,
  responses_identity_protected: true,
  created_by: '22222222-2222-4222-8222-222222222222',
  opened_at: null,
  closed_at: null,
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-20T00:00:00.000Z',
  questions: [],
};

function renderBuilder(current: Survey = survey) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SurveyBuilder survey={current} canManage onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('Survey builder description', () => {
  beforeEach(() => {
    apiClient.mockClear();
    apiClient.mockResolvedValue({ data: { id: SURVEY_ID } });
  });

  it('saves a description-only edit as the exact partial patch', async () => {
    renderBuilder({ ...survey, description: null });

    fireEvent.change(screen.getByRole('textbox', { name: '설명 (선택)' }), {
      target: { value: '배포 맥락' },
    });

    expect(screen.getByText('저장되지 않은 변경 사항')).toBeInTheDocument();
    expect(apiClient).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));

    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith('PATCH', `/surveys/${SURVEY_ID}`, {
        body: { description: '배포 맥락' },
      }),
    );
    expect(apiClient).toHaveBeenCalledTimes(1);
  });

  it('clears a saved description with an empty string that survives reload', async () => {
    let storedSurvey = structuredClone(survey);
    apiClient.mockImplementation(async (method, _path, options) => {
      if (method === 'PATCH') {
        storedSurvey = { ...storedSurvey, ...options.body };
      }
      return { data: structuredClone(storedSurvey) };
    });
    const view = renderBuilder();
    fireEvent.change(screen.getByRole('textbox', { name: '설명 (선택)' }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));

    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith('PATCH', `/surveys/${SURVEY_ID}`, {
        body: { description: '' },
      }),
    );

    await waitFor(() =>
      expect(screen.queryByText('저장되지 않은 변경 사항')).not.toBeInTheDocument(),
    );
    view.unmount();
    const readback = await apiClient('GET', apiPath`/surveys/${SURVEY_ID}`);
    renderBuilder(readback.data);
    expect(screen.getByRole('textbox', { name: '설명 (선택)' })).toHaveValue('');
  });

  it('shows a published description read-only and skips an empty one', () => {
    const published = renderBuilder({ ...survey, status: 'open', description: '배포 맥락' });
    expect(screen.getByText('배포 맥락')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '설명 (선택)' })).not.toBeInTheDocument();
    expect(screen.getByText('진행 중 상태 — 질문 변경은 잠겨 있습니다.')).toBeInTheDocument();
    published.unmount();

    renderBuilder({ ...survey, status: 'open', description: null });
    expect(screen.queryByRole('textbox', { name: '설명 (선택)' })).not.toBeInTheDocument();
    expect(screen.queryByText('배포 맥락')).not.toBeInTheDocument();
    expect(screen.getByText('진행 중 상태 — 질문 변경은 잠겨 있습니다.')).toBeInTheDocument();
  });

  it('shows the edited description in the respondent preview', async () => {
    renderBuilder({ ...survey, description: null });
    fireEvent.change(screen.getByRole('textbox', { name: '설명 (선택)' }), {
      target: { value: '미리보기 설명' },
    });
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));

    const dialog = await screen.findByRole('dialog', { name: '응답자 미리보기' });
    expect(dialog).toHaveTextContent('미리보기 설명');
  });
});


it.each([
  ['not_draft', 'status', '설문이 더 이상 초안 상태가 아닙니다. 변경 내용을 따로 보관한 뒤 설문을 다시 불러와 주세요.'],
  ['invalid', 'question_ids', '질문 목록이 변경되었습니다. 변경 내용을 따로 보관한 뒤 설문을 다시 불러와 주세요.'],
])('keeps the draft and explains %s with reload guidance', async (code, path, message) => {
  apiClient.mockRejectedValueOnce(new ApiError(422, { code: 'validation.failed', message: 'Synthetic failure', detail: { fields: [{ path: [path], code }] } }));
  renderBuilder();
  fireEvent.change(screen.getByRole('textbox', { name: '설명 (선택)' }), { target: { value: 'Unsaved description' } });
  fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(screen.getByRole('textbox', { name: '설명 (선택)' })).toHaveValue('Unsaved description');
});

it('shows the mapped save failure instead of dropping its cause', async () => {
  apiClient.mockRejectedValueOnce(new ApiError(403, { code: 'permission.denied', message: 'Synthetic denial' }));
  renderBuilder();
  fireEvent.change(screen.getByRole('textbox', { name: '설명 (선택)' }), { target: { value: 'Unsaved description' } });
  fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다.');
});

it('replays a lost question creation response with the original body and key, then saves newer edits', async () => {
  const posts: { body: unknown; idempotencyKey: unknown }[] = [];
  apiClient.mockImplementation(async (method, path, options) => {
    if (method === 'POST' && path.endsWith('/questions')) {
      posts.push(options);
      if (posts.length === 1) throw new Error('Synthetic response loss');
      return { data: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' } };
    }
    return { data: { id: SURVEY_ID } };
  });
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useSurveyBuilderController({ survey, canManage: true, onBack: vi.fn() }), { wrapper });
  act(() => result.current.add('text'));
  act(() => { const question = result.current.questions[0]; if (!question) throw new Error('Missing synthetic question'); result.current.patch({ ...question, prompt: 'Original prompt' }); });
  await act(async () => { expect(await result.current.save()).toBe(false); });
  act(() => { const question = result.current.questions[0]; if (!question) throw new Error('Missing synthetic question'); result.current.patch({ ...question, prompt: 'Newer prompt' }); });
  await act(async () => { expect(await result.current.save()).toBe(true); });
  expect(posts).toHaveLength(2);
  expect(posts[0]?.idempotencyKey).toEqual(expect.any(String));
  expect(posts[1]).toEqual(posts[0]);
  expect(apiClient).toHaveBeenCalledWith('PATCH', `/surveys/${SURVEY_ID}/questions/cccccccc-cccc-4ccc-8ccc-cccccccccccc`, expect.objectContaining({ body: expect.objectContaining({ prompt: 'Newer prompt' }) }));
});


it('allows correcting a definitively rejected question creation', async () => {
  apiClient.mockReset();
  apiClient.mockRejectedValueOnce(new ApiError(422, { code: 'validation.failed', message: 'Synthetic validation rejection' })).mockResolvedValue({ data: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' } });
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useSurveyBuilderController({ survey, canManage: true, onBack: vi.fn() }), { wrapper });
  act(() => result.current.add('text'));
  const patchPrompt = (prompt: string) => { const question = result.current.questions[0]; if (!question) throw new Error('Missing synthetic question'); result.current.patch({ ...question, prompt }); };
  act(() => patchPrompt('Rejected prompt'));
  await act(async () => { expect(await result.current.save()).toBe(false); });
  act(() => patchPrompt('Corrected prompt'));
  await act(async () => { expect(await result.current.save()).toBe(true); });
  const creates = apiClient.mock.calls.filter(([method, path]) => method === 'POST' && path.endsWith('/questions'));
  expect(creates[1]?.[2].body.prompt).toBe('Corrected prompt');
  expect(creates[1]?.[2].idempotencyKey).not.toBe(creates[0]?.[2].idempotencyKey);
});

it('keeps replaying the same creation key after a replay conflict instead of creating a duplicate', async () => {
  apiClient.mockReset();
  const keys: unknown[] = [];
  apiClient.mockImplementation(async (method, path, options) => {
    if (method === 'POST' && path.endsWith('/questions')) {
      keys.push(options.idempotencyKey);
      if (keys.length === 1) throw new Error('Synthetic response loss');
      throw new ApiError(409, { code: 'conflict.idempotency_key_reuse', message: 'Synthetic replay conflict' });
    }
    return { data: { id: SURVEY_ID } };
  });
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useSurveyBuilderController({ survey, canManage: true, onBack: vi.fn() }), { wrapper });
  act(() => result.current.add('text'));
  act(() => { const question = result.current.questions[0]; if (!question) throw new Error('Missing synthetic question'); result.current.patch({ ...question, prompt: 'Large prompt' }); });
  for (let attempt = 0; attempt < 3; attempt += 1) await act(async () => { expect(await result.current.save()).toBe(false); });
  expect(keys).toHaveLength(3);
  expect(new Set(keys).size).toBe(1);
});
