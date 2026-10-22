import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, type QueryState } from '@ap/kernel';
import type { ApiResponse } from '@ap/contracts';
import { QueryView } from './StateView';
import { InWorkspacePanelProvider } from './workspace/panelContext';

afterEach(cleanup);

function textWithoutDetail(node: HTMLElement) {
  const clone = node.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[role="note"]').forEach(note => note.remove());
  return clone.textContent ?? '';
}

const errorResponse = (): ApiResponse<unknown> =>
  ({ outcome: 'error', message: 'boom', data: null, assessments: [], trust: null, correlationId: 'c1' });
const query = (): QueryState<unknown> => ({ response: errorResponse(), refetch: vi.fn(), missing: [], completedAt: null, status: 'done' });

/** Outside an OutcomeScope the widget never groups (UXA-3): the compact state must still name its widget. */
function View({ hide = false }: { hide?: boolean }) {
  return <I18nProvider><QueryView query={query()} widgetName="지표 쌍 검증" compact hideWidgetName={hide}>{() => null}</QueryView></I18nProvider>;
}

describe('non-grouped compact state names its widget (UXA-3)', () => {
  it('draws the widget name line above a compact error StateMessage', () => {
    render(<View />);
    expect(screen.getByRole('group', { name: '지표 쌍 검증' })).toBeInTheDocument();
    expect(screen.getByText('지표 쌍 검증')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('데이터를 불러오지 못했습니다');
    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('note', { name: '서버 세부' })).toHaveTextContent('boom');
    expect(textWithoutDetail(alert)).not.toContain('boom');
  });

  it.each([
    ['error', 'time_domain_unverified: MEM-PHOTO-0103, MEM-PHOTO-0105', 'alert', ['함께 집계할 수 없습니다', '설비를 좁히거나 기간을 줄이세요'], true],
    ['forbidden', 'no grant', 'status', ['권한 담당자에게 요청하세요'], false],
    ['too_large', 'row cap', 'status', ['조회 조건을 좁혀 다시 시도하세요'], false],
    ['timeout', 'Upstream mart query failed', 'alert', ['조회가 제한 시간 안에 끝나지 않았습니다', '기간을 줄이거나 집계 단위를 키워 다시 시도하세요'], true],
  ] as const)('standalone %s keeps the server message in the named detail', (outcome, message, role, phrases, retry) => {
    const response: ApiResponse<unknown> = { outcome, message, data: null, assessments: [], trust: null, correlationId: 'c-stand' };
    const q: QueryState<unknown> = { response, refetch: vi.fn(), missing: [], completedAt: null, status: 'done' };
    render(<I18nProvider><QueryView query={q}>{() => null}</QueryView></I18nProvider>);
    const region = screen.getByRole(role);
    for (const phrase of phrases) expect(textWithoutDetail(region)).toContain(phrase);
    expect(textWithoutDetail(region)).not.toContain(message);
    expect(within(region).getByRole('note', { name: '서버 세부' })).toHaveTextContent(message);
    expect(region).toHaveTextContent('c-stand');
    if (retry) expect(within(region).getByRole('button', { name: '다시 시도' })).toBeTruthy();
  });

  it('hideWidgetName keeps the name out', () => {
    render(<View hide />);
    expect(screen.queryByText('지표 쌍 검증')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

it('renders idle with localized missing reasons and without loading or outcome content', () => {
  const query: QueryState<unknown> = { status: 'idle', response: null, refetch: vi.fn(), missing: [{ key: 'time', label: { ko: '기간', en: 'Period' } }], completedAt: null };
  render(<I18nProvider><QueryView query={query}>{() => <span>result</span>}</QueryView></I18nProvider>);
  expect(screen.getByRole('status')).toHaveTextContent('아직 조회하지 않았습니다');
  expect(screen.getByRole('listitem')).toHaveTextContent('기간을(를) 선택하세요');
  expect(screen.queryByText('불러오는 중')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

describe('QueryView inside a workspace panel', () => {
  const ok = (): QueryState<string> => ({ response: { outcome: 'ok', data: 'x', assessments: [], trust: null, correlationId: 'c' }, refetch: vi.fn(), missing: [], completedAt: null, status: 'done' });

  it('takes the panel height so a fill chart inside has a bounded parent; elsewhere it is unchanged', () => {
    const { container, unmount } = render(<I18nProvider><InWorkspacePanelProvider value><QueryView query={ok()}>{data => <p>{data}</p>}</QueryView></InWorkspacePanelProvider></I18nProvider>);
    expect(container.querySelector('p')!.parentElement).toHaveClass('h-full', 'min-h-0');
    unmount();
    const plain = render(<I18nProvider><QueryView query={ok()}>{data => <p>{data}</p>}</QueryView></I18nProvider>);
    expect(plain.container.querySelector('p')!.parentElement).not.toHaveClass('h-full');
  });
});
