// F1–F3, F5, F6 — the platform drawer's VOC form. fetch is mocked directly (house style); the editor is a textarea
// because ProseMirror refuses text in jsdom (same as VocCreateScreen.integration.test.tsx).

import { configureApiClient } from '@/lib/api/client';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { SHARED_ALLOWLISTS } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VocComposeScreen, type VocComposeScreenProps } from '../VocComposeScreen';
import type { VocComposeContextBlock } from '../context-block';

vi.mock('@ap/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ap/ui')>()),
  RichEditor: ({ onChange }: { onChange: (doc: unknown) => void }) => (
    <textarea
      data-testid="mock-rich-editor"
      aria-label="상세 설명"
      onChange={(e) =>
        onChange({
          type: 'doc',
          content: e.target.value
            ? [{ type: 'paragraph', content: [{ type: 'text', text: e.target.value }] }]
            : [],
        })
      }
    />
  ),
}));

const MS_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MS_OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
const AA_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VOC_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const MS_ITEM = {
  id: MS_ID,
  workspace_id: 'ws-1',
  slug: 'analytics',
  name: 'Analytics MS',
  external_key: null,
  default_owner_actor_id: null,
  default_owner_team_id: null,
  default_reviewer_actor_id: null,
  default_reviewer_team_id: null,
  archived_at: null,
  archived_by_actor_id: null,
  created_at: '2026-05-20T00:00:00Z',
  updated_at: '2026-05-20T00:00:00Z',
};
const AA_ITEM = {
  id: AA_ID,
  workspace_id: 'ws-1',
  managed_system_id: MS_ID,
  slug: 'usage',
  name: 'Usage AA',
  owner_team_id: null,
  archived_at: null,
  archived_by_actor_id: null,
  created_at: '2026-05-20T00:00:00Z',
  updated_at: '2026-05-20T00:00:00Z',
};

const BLOCK: VocComposeContextBlock = {
  items: [
    { label: '메뉴', value: '생산성 분석' },
    { label: '기간', value: '2026-10-01 ~ 2026-10-07' },
  ],
  href: 'https://platform.example/analytics/productivity?period=7d',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Call = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  credentials?: RequestCredentials | undefined;
};
let calls: Call[] = [];

function installFetch(post: Response = json({ id: VOC_ID, display_id: 'VOC-7' }, 201)) {
  calls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      credentials: init?.credentials,
    });
    const path = new URL(url, 'http://x').pathname;
    if (path === '/api/fo/managed-systems') return json({ items: [MS_ITEM], total: 1 });
    if (path === '/api/fo/analytics-areas') return json({ items: [AA_ITEM], total: 1 });
    if (path === '/api/fo/vocs' && init?.method === 'POST') return post.clone();
    return new Response('not mocked', { status: 500 });
  }) as typeof fetch;
}

function mount(over: Partial<VocComposeScreenProps> = {}) {
  const seam = {
    canLink: () => false,
    Link: () => null,
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
  } satisfies HostSeam;
  const props: VocComposeScreenProps = {
    contextBlock: BLOCK,
    initialManagedSystemId: null,
    onSubmitted: vi.fn(),
    onCancel: vi.fn(),
    onDirtyChange: vi.fn(),
    ...over,
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = (p: VocComposeScreenProps): React.ReactElement => (
    <QueryClientProvider client={client}>
      <HostSeamProvider value={seam}>
        <VocComposeScreen {...p} />
      </HostSeamProvider>
    </QueryClientProvider>
  );
  const view = render(tree(props));
  return {
    seam,
    props,
    client,
    rerender: (next: Partial<VocComposeScreenProps>) => view.rerender(tree({ ...props, ...next })),
  };
}

async function fillAndPick(description = '재현 절차와 기대 동작') {
  fireEvent.change(screen.getByRole('textbox', { name: /제목/ }), {
    target: { value: '차트가 비어 있습니다' },
  });
  fireEvent.blur(screen.getByRole('textbox', { name: /제목/ }));
  fireEvent.change(screen.getByTestId('mock-rich-editor'), { target: { value: description } });
  fireEvent.click(await screen.findByRole('radio', { name: 'Analytics MS' }));
}

const submit = async () => {
  await waitFor(() => expect(screen.getByRole('button', { name: 'VOC 제출' })).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: 'VOC 제출' }));
};
const postBody = () =>
  calls.find((c) => c.method === 'POST')?.body as {
    description_rich_content: { content: unknown[] };
  } & Record<string, unknown>;

const typed = { type: 'paragraph', content: [{ type: 'text', text: '재현 절차와 기대 동작' }] };
const heading = {
  type: 'paragraph',
  content: [{ type: 'text', text: '화면 정보', marks: [{ type: 'bold' }] }],
};
const bullets = (items: string[]) => ({
  type: 'bulletList',
  content: items.map((t) => ({
    type: 'listItem',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }],
  })),
});
const open = (href: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text: '화면 열기', marks: [{ type: 'link', attrs: { href } }] }],
});

// Nodes, marks and link targets the server's `voc-description` allowlist (packages/feature-shared) would reject.
type RichNode = {
  type: string;
  marks?: { type: string; attrs?: { href?: string } }[];
  content?: RichNode[];
};
function disallowed(node: RichNode, rules = SHARED_ALLOWLISTS['voc-description']): string[] {
  const found: string[] = [];
  if (node.type !== 'doc' && !rules.nodes.has(node.type)) found.push(`node ${node.type}`);
  for (const mark of node.marks ?? []) {
    if (!rules.marks.has(mark.type)) found.push(`mark ${mark.type}`);
    if (mark.type === 'link' && !/^https?:\/\/.{1,2040}$/.test(mark.attrs?.href ?? ''))
      found.push('link href');
  }
  return [...found, ...(node.content ?? []).flatMap((child) => disallowed(child, rules))];
}

// Each of these in the request body is a regression on its own (the brief keeps severity, reporter and owner out).
const FORBIDDEN_BODY_KEYS = [
  'severity',
  'reporter_id',
  'owner_user_id',
  'owner_team_id',
  'reporter_facing_status',
  'triage_state',
  'display_id',
] as const;

const originalFetch = globalThis.fetch;
beforeEach(() => configureApiClient({ basePath: '/api/fo' }));
afterEach(() => {
  globalThis.fetch = originalFetch;
  configureApiClient({ basePath: '' });
});

describe('<VocComposeScreen> submit (F1)', () => {
  it('posts to /api/fo/vocs with the typed text first and the Context block after it, then reports success once', async () => {
    installFetch();
    const { seam, props } = mount();
    await fillAndPick();
    await submit();

    await waitFor(() => expect(props.onSubmitted).toHaveBeenCalledTimes(1));
    expect(props.onSubmitted).toHaveBeenCalledWith({ vocId: VOC_ID, displayId: 'VOC-7' });
    expect(seam.notifySuccess).toHaveBeenCalledWith('접수 완료: VOC-7');
    expect(seam.notifyError).not.toHaveBeenCalled();

    const post = calls.find((c) => c.method === 'POST');
    expect(post?.url).toBe('/api/fo/vocs');
    expect(post?.headers['Idempotency-Key']).toBeTruthy();
    const body = postBody();
    expect(body).toMatchObject({
      primary_managed_system_id: MS_ID,
      title: '차트가 비어 있습니다',
      source_context: 'direct_use',
    });
    for (const key of FORBIDDEN_BODY_KEYS) expect(body).not.toHaveProperty(key);
    expect(body.description_rich_content.content).toEqual([
      typed,
      heading,
      bullets(['메뉴: 생산성 분석', '기간: 2026-10-01 ~ 2026-10-07']),
      open(BLOCK.href as string),
    ]);
    expect(disallowed(body.description_rich_content as unknown as RichNode)).toEqual([]);
  });

  it.each([
    [429, 'rate_limit.exceeded'],
    [409, 'conflict.idempotency_key_reuse'],
    [404, 'not_found'],
  ])('reports a %s failure through notifyError and does not close', async (status, code) => {
    installFetch(json({ code, message: 'x' }, status));
    const { seam, props } = mount();
    await fillAndPick();
    await submit();
    await waitFor(() => expect(seam.notifyError).toHaveBeenCalledTimes(1));
    expect(vi.mocked(seam.notifyError).mock.calls[0]?.[0]).toBeTruthy();
    expect(props.onSubmitted).not.toHaveBeenCalled();
    expect(seam.notifySuccess).not.toHaveBeenCalled();
  });

  it('puts a 422 field error under its field instead of a toast', async () => {
    installFetch(
      json(
        {
          code: 'validation.failed',
          message: 'x',
          detail: {
            fields: [{ path: ['title'], code: 'too_long', message: '제목이 너무 깁니다' }],
          },
        },
        422,
      ),
    );
    const { seam } = mount();
    await fillAndPick();
    await submit();
    expect(await screen.findByText('제목이 너무 깁니다')).toBeTruthy();
    expect(seam.notifyError).not.toHaveBeenCalled();
  });
});

describe('<VocComposeScreen> Context block (F2)', () => {
  const long = `https://platform.example/x?${'a'.repeat(2048)}`;
  it.each([
    ['no items', { items: [], href: BLOCK.href }, [typed]],
    [
      'no href',
      { items: BLOCK.items, href: null },
      [typed, heading, bullets(['메뉴: 생산성 분석', '기간: 2026-10-01 ~ 2026-10-07'])],
    ],
    [
      'an href over 2048 characters',
      { items: BLOCK.items, href: long },
      [typed, heading, bullets(['메뉴: 생산성 분석', '기간: 2026-10-01 ~ 2026-10-07'])],
    ],
  ])('appends %s as expected', async (_name, contextBlock, expected) => {
    installFetch();
    mount({ contextBlock });
    await fillAndPick();
    await submit();
    await waitFor(() => expect(postBody()).toBeDefined());
    expect(postBody().description_rich_content.content).toEqual(expected);
  });

  it('rejects a whitespace-only description with the blank error and sends nothing', async () => {
    installFetch();
    mount();
    await fillAndPick('   ');
    fireEvent.submit(document.getElementById('voc-compose-form') as HTMLFormElement);
    expect(await screen.findByText('상세 설명을 입력해 주세요.')).toBeTruthy();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });
});

describe('<VocComposeScreen> Managed System default (F3)', () => {
  it.each([
    ['listed', MS_ID, true],
    ['not in the list', MS_OTHER, false],
    ['null', null, false],
  ])('initialManagedSystemId %s → preselected: %s', async (_name, initial, preselected) => {
    installFetch();
    mount({ initialManagedSystemId: initial });
    const radio = await screen.findByRole('radio', { name: 'Analytics MS' });
    await waitFor(() => expect(radio.getAttribute('aria-checked')).toBe(String(preselected)));
    const areaRequested = calls.some(
      (c) =>
        c.url.startsWith('/api/fo/analytics-areas') && c.url.includes(`managed_system_id=${MS_ID}`),
    );
    expect(areaRequested).toBe(preselected);
    // No link to an Analytics Area exists, so none is ever chosen.
    if (preselected) {
      const area = await screen.findByRole('radio', { name: 'Usage AA' });
      expect(area.getAttribute('aria-checked')).toBe('false');
    }
  });

  it('keeps an Analytics Area picked after the default Managed System was applied', async () => {
    installFetch();
    mount({ initialManagedSystemId: MS_ID });
    fireEvent.click(await screen.findByRole('radio', { name: 'Usage AA' }));
    fireEvent.change(screen.getByRole('textbox', { name: /제목/ }), {
      target: { value: '영역 선택' },
    });
    fireEvent.change(screen.getByTestId('mock-rich-editor'), { target: { value: '내용' } });
    await submit();
    await waitFor(() => expect(postBody()).toBeDefined());
    expect(postBody()).toMatchObject({
      primary_managed_system_id: MS_ID,
      analytics_area_id: AA_ID,
    });
  });
});

describe('<VocComposeScreen> dirty state (F5)', () => {
  it('is not dirty untouched, is dirty after a title, and ignores a Context change', async () => {
    installFetch();
    const { props, rerender } = mount();
    await screen.findByRole('radio', { name: 'Analytics MS' });
    rerender({ contextBlock: { items: [{ label: '메뉴', value: '다른 화면' }], href: null } });
    expect(vi.mocked(props.onDirtyChange).mock.calls.some(([dirty]) => dirty)).toBe(false);

    fireEvent.change(screen.getByRole('textbox', { name: /제목/ }), {
      target: { value: '쓰는 중' },
    });
    await waitFor(() => expect(vi.mocked(props.onDirtyChange)).toHaveBeenLastCalledWith(true));
  });

  it('does not count the defaulted Managed System as an edit', async () => {
    installFetch();
    const { props } = mount({ initialManagedSystemId: MS_ID });
    const radio = await screen.findByRole('radio', { name: 'Analytics MS' });
    await waitFor(() => expect(radio.getAttribute('aria-checked')).toBe('true'));
    expect(vi.mocked(props.onDirtyChange).mock.calls.some(([dirty]) => dirty)).toBe(false);
  });
});

describe('<VocComposeScreen> network (F6)', () => {
  it('asks only for Managed Systems and Analytics Areas while composing', async () => {
    installFetch();
    mount({ initialManagedSystemId: MS_ID });
    await screen.findByRole('radio', { name: 'Usage AA' });
    fireEvent.change(screen.getByRole('textbox', { name: /제목/ }), {
      target: { value: '입력 중' },
    });
    fireEvent.change(screen.getByTestId('mock-rich-editor'), { target: { value: '내용' } });
    const paths = calls.map((c) => new URL(c.url, 'http://x').pathname);
    expect(paths.filter((p) => /recommendations|similarity|\/me(\/|$)/.test(p))).toEqual([]);
    expect(new Set(paths)).toEqual(new Set(['/api/fo/managed-systems', '/api/fo/analytics-areas']));
  });
});

describe('<VocComposeScreen> narrow drawer layout and helper texts (UX-3, UX-4)', () => {
  it('lets the four 출처 options wrap instead of scrolling sideways (jsdom cannot measure: asserts the classes)', async () => {
    installFetch();
    mount();
    const segmented = screen.getByTestId('source-context-segmented');
    expect(screen.getAllByRole('radio').filter((r) => segmented.contains(r))).toHaveLength(4);
    expect(screen.getByTestId('source-context-list').className).toMatch(/\bflex-wrap\b/);
    for (let el: HTMLElement | null = segmented; el; el = el.parentElement)
      expect(el.className).not.toMatch(/overflow-x-/);
  });

  it.each([
    ['출처', '타인 대신 보고는 다른 팀원이나 고객의 경험을 대신 등록하는 경우입니다.'],
    [
      'Analytics Area, before a Managed System is chosen',
      'Analytics Area는 VOC를 분석할 때 함께 볼 주제에 맞춰 선택하세요.',
    ],
  ])('shows the %s helper text', async (_field, text) => {
    installFetch();
    mount();
    expect(await screen.findByText(text)).toBeTruthy();
  });
});

// Migrated from the retired standalone create screen suite (#597): the same assertions over the retained drawer screen.
describe('<VocComposeScreen> required fields and independent choices (migrated from VocCreateScreen)', () => {
  it('names the missing required fields next to the disabled submit button and clears the line when all are set', async () => {
    installFetch();
    mount();
    await screen.findByRole('radio', { name: 'Analytics MS' });
    expect(screen.getByTestId('voc-submit-missing')).toHaveTextContent(
      '필수 항목: 제목, 상세 설명, Managed System',
    );
    expect(screen.getByRole('button', { name: 'VOC 제출' })).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: 'Analytics MS' }));
    fireEvent.change(screen.getByRole('textbox', { name: /제목/ }), {
      target: { value: '테스트 제목입니다' },
    });
    await waitFor(() =>
      expect(screen.getByTestId('voc-submit-missing')).toHaveTextContent('필수 항목: 상세 설명'),
    );

    fireEvent.change(screen.getByTestId('mock-rich-editor'), {
      target: { value: '재현 절차와 기대 동작' },
    });
    await waitFor(() => expect(screen.queryByTestId('voc-submit-missing')).toBeNull());
  });

  it('submits the source and the Analytics Area as independent values without a warning dialog', async () => {
    installFetch();
    mount();
    fireEvent.click(await screen.findByRole('radio', { name: 'Analytics MS' }));
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: '출처' })).getByRole('radio', {
        name: '타인 대신 보고',
      }),
    );
    fireEvent.click(await screen.findByRole('radio', { name: 'Usage AA' }));
    fireEvent.change(screen.getByRole('textbox', { name: /제목/ }), {
      target: { value: '분류와 출처가 독립적인 VOC' },
    });
    fireEvent.blur(screen.getByRole('textbox', { name: /제목/ }));
    fireEvent.change(screen.getByTestId('mock-rich-editor'), {
      target: { value: '재현 절차와 기대 동작' },
    });
    await submit();

    await waitFor(() => expect(postBody()).toBeDefined());
    expect(postBody()).toMatchObject({
      primary_managed_system_id: MS_ID,
      analytics_area_id: AA_ID,
      source_context: 'proxy_report',
      title: '분류와 출처가 독립적인 VOC',
      attachment_ids: [],
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('<VocComposeScreen> Managed System list states (migrated from VocCreateScreen)', () => {
  it('shows the empty-state copy when the user has no Managed System', async () => {
    installFetch();
    const base = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      new URL(String(input), 'http://x').pathname === '/api/fo/managed-systems'
        ? json({ items: [], total: 0 })
        : base(input, init),
    ) as typeof fetch;
    mount();
    expect(await screen.findByText('선택할 수 있는 Managed System이 없습니다')).toBeTruthy();
    expect(screen.queryByTestId('ms-picker')).toBeNull();
  });

  it('a background 401 on the Managed System list keeps the draft mounted and shows the login copy', async () => {
    installFetch();
    const base = globalThis.fetch;
    let listFails = false;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      listFails && new URL(String(input), 'http://x').pathname === '/api/fo/managed-systems'
        ? json({ code: 'auth.session_required', message: 'Unauthorized' }, 401)
        : base(input, init),
    ) as typeof fetch;
    const { client } = mount();
    await screen.findByTestId('ms-picker');
    fireEvent.change(screen.getByRole('textbox', { name: /제목/ }), {
      target: { value: '작성 중인 VOC' },
    });

    listFails = true;
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['managed-systems', { includeArchived: false }] });
    });

    await waitFor(() => expect(screen.getByText('로그인이 필요합니다.')).toBeTruthy());
    expect(screen.getByRole('textbox', { name: /제목/ })).toHaveValue('작성 중인 VOC');
  });
});

describe('<VocComposeScreen> attachment errors block the submit (migrated from VocCreateScreen)', () => {
  it('an attachment row in error shows the alert and disables the submit until the row is removed', async () => {
    installFetch();
    mount();
    await fillAndPick();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'VOC 제출' })).not.toBeDisabled(),
    );
    expect(screen.queryByTestId('attachment-submit-blocked-alert')).toBeNull();

    const input = screen
      .getByTestId('attachment-dropzone')
      .querySelector('input[type="file"]') as HTMLInputElement;
    const big = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024, configurable: true });
    fireEvent.change(input, { target: { files: [big] } });

    const alert = await screen.findByTestId('attachment-submit-blocked-alert');
    expect(alert.textContent).toContain('첨부 파일에 오류가 있어 제출할 수 없습니다');
    expect(screen.getByRole('button', { name: 'VOC 제출' })).toBeDisabled();

    fireEvent.click(screen.getByLabelText('첨부 제거'));
    await waitFor(() => expect(screen.queryByTestId('attachment-submit-blocked-alert')).toBeNull());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'VOC 제출' })).not.toBeDisabled(),
    );
  });
});
