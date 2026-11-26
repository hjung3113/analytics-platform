import { cleanup, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostSeam } from '../../../lib/host/host-seam';
import type { Attempt, LifecycleApi, Model, QueueStatus, ReadState, RequestDetail, RequestRow, ScreenProps } from '../contracts';
import { LifecycleHost } from '../host';
import { pageCopy } from '../messages';
import { ModelsScreen } from '../ModelsScreen';
import { QueueWindow, RequestDrawer, RequestsScreen } from '../RequestsScreen';
import { fakeUi } from './presentation';

/** Tags each value with the notation the screen asked for, so a test sees the Kernel notation choice, not a formatter. */
const time: NonNullable<HostSeam['time']> = {
  list: (at, options) => options?.timeZone ? `list@${options.timeZone}:${at}` : `list:${at}`,
  summary: at => `summary:${at}`,
  feed: at => ({ text: `feed:${at}`, title: `title:${at}` }),
};
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AT = '2026-11-08T11:40:00Z';
const SERVER_AT = '2026-11-15T00:00:00Z';
const wrap = (node: ReactNode) => render(<LifecycleHost navigate={vi.fn()} time={time}>{node}</LifecycleHost>);
function props(data: Record<string, unknown>): ScreenProps {
  const api: LifecycleApi = { useRead: <T,>(name: string): ReadState<T> => ({ status: 'done', data: (data[name] ?? null) as T | null, retry: vi.fn() }), useAction: () => ({ pending: false, run: vi.fn() }) };
  return { api, ui: fakeUi(), canProject: true, canRound: true, actorId: ID, setSelection: vi.fn() };
}
const model: Model = { id: ID, code: 'ETCH-300', name: '식각', vendorName: '설비사', vendorId: ID, processes: [], updatedAt: AT, validation: 'none', pendingRequests: 0, gateDecision: null, project: null };
const attempt: Attempt = { id: 'attempt', attemptNo: 1, outcome: 'succeeded', workerActorId: ID, verdict: 'pass', manifestMatches: true, counts: {}, requiredUnchecked: 0, ruleCount: 1, startedAt: AT, endedAt: AT, ruleSetRevision: null, inputManifestDigest: '' };
const row: RequestRow = { id: ID, roundId: ID, roundSeq: 3, projectId: ID, modelId: ID, modelCode: 'ETCH-300', softwareLabel: null, priority: 1, immediate: false, state: 'claimed', attemptCount: 1, maxAttempts: 3, leaseExpiresAt: AT, lastHeartbeatAt: AT, requestedBy: { id: ID, displayName: 'Worker' }, createdAt: AT, endedAt: null, latestVerdict: null, version: '1' };
const detail: RequestDetail = { ...row, attempts: [attempt], cancelReason: null };
const queue = (timezone: string): QueueStatus => ({ runWindow: { timezone, weekday: { fromHour: 9, toHour: 18 }, weekendAllDay: true }, immediateLimit: 2, serverAt: SERVER_AT, withinWindow: false });
afterEach(cleanup);

describe('lifecycle instants use the host Kernel notation (#2587)', () => {
  it('renders a model table cell in the list notation without a KST header', () => {
    wrap(<ModelsScreen {...props({ models: { rows: [model], total: 1 } })} />);
    const table = screen.getByRole('table', { name: /모델/ });
    expect(within(table).getByText(`list:${AT}`)).toBeVisible();
    expect(within(table).getByRole('columnheader', { name: '갱신' })).toBeVisible();
    expect(document.body.textContent).not.toMatch(/KST/);
  });
  it('renders request detail lines in the summary notation without a KST suffix', () => {
    wrap(<RequestDrawer {...props({ requestDetail: detail })} requestId={ID} onClose={vi.fn()} />);
    const drawer = screen.getByRole('dialog', { name: '검증 요청 상세' });
    expect(within(drawer).getAllByText(`summary:${AT}`).map(node => node.closest('p, dd')?.textContent)).toEqual([`우선순위 1 · lease 만료 summary:${AT}`, `summary:${AT}`]);
    expect(within(drawer).getByText('시작').nextElementSibling?.textContent).toBe(`summary:${AT}`);
    expect(drawer.textContent).not.toMatch(/KST/);
  });
  it.each([
    ['a heartbeat', AT, `하트비트 list:${AT}`],
    ['no heartbeat yet', null, '하트비트 없음'],
  ] as const)('renders the request list progress with %s', (_, lastHeartbeatAt, text) => {
    wrap(<RequestsScreen {...props({ requests: { rows: [{ ...row, lastHeartbeatAt }], total: 1 }, queueStatus: queue('Asia/Seoul') })} />);
    const table = screen.getByRole('table', { name: '검증 요청' });
    expect(within(table).getByText(/^하트비트/).textContent).toBe(text);
    expect(within(table).getByRole('columnheader', { name: '진행' })).toBeVisible();
    expect(table.textContent).not.toMatch(/KST/);
  });
});

describe('the run window keeps its own zone (#2587)', () => {
  it('names the window zone and shows the server time in that zone', () => {
    wrap(<QueueWindow api={props({ queueStatus: queue('Europe/Berlin') }).api} />);
    expect(screen.getByText(/평일 09:00–18:00 · 주말 종일 \(Europe\/Berlin\)/)).toBeVisible();
    expect(screen.getByText(new RegExp(`^서버 시각 list@Europe/Berlin:${SERVER_AT} \\(Europe/Berlin\\) ·`))).toBeVisible();
    expect(document.body.textContent).not.toMatch(/KST/);
  });
  it('labels the compact window detail with the window zone, not KST', () => {
    expect(pageCopy.queueDetail('Europe/Berlin', `list@Europe/Berlin:${SERVER_AT}`, 2)).toBe(`시간대 Europe/Berlin · 서버 시각 list@Europe/Berlin:${SERVER_AT} · 사용자당 즉시 대기 요청 동시 2건까지`);
  });
});
