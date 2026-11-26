import { cleanup, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostSeam } from '../../../lib/host/host-seam';
import type { Attempt, GateDecision, LifecycleApi, Model, Project, QueueStatus, ReadState, RequestDetail, RequestRow, RoundDetail, ScreenProps } from '../contracts';
import { GatePanel } from '../GatePanel';
import { RoundScreen } from '../RoundScreen';
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
function props(data: Record<string, unknown>, state?: Record<string, string>): ScreenProps {
  const api: LifecycleApi = { useRead: <T,>(name: string): ReadState<T> => ({ status: 'done', data: (data[name] ?? null) as T | null, retry: vi.fn() }), useAction: () => ({ pending: false, run: vi.fn() }) };
  return { api, ui: fakeUi(), canProject: true, canRound: true, actorId: ID, setSelection: vi.fn(), ...(state ? { state, setState: vi.fn() } : {}) };
}
const model: Model = { id: ID, code: 'ETCH-300', name: '식각', vendorName: '설비사', vendorId: ID, processes: [], updatedAt: AT, validation: 'none', pendingRequests: 0, gateDecision: null, project: null };
const attempt: Attempt = { id: 'attempt', attemptNo: 1, outcome: 'succeeded', workerActorId: ID, verdict: 'pass', manifestMatches: true, counts: {}, requiredUnchecked: 0, ruleCount: 1, startedAt: AT, endedAt: AT, ruleSetRevision: null, inputManifestDigest: '' };
const row: RequestRow = { id: ID, roundId: ID, roundSeq: 3, projectId: ID, modelId: ID, modelCode: 'ETCH-300', softwareLabel: null, priority: 1, immediate: false, state: 'claimed', attemptCount: 1, maxAttempts: 3, leaseExpiresAt: AT, lastHeartbeatAt: AT, requestedBy: { id: ID, displayName: 'Worker' }, createdAt: AT, endedAt: null, latestVerdict: null, version: '1' };
const detail: RequestDetail = { ...row, attempts: [attempt], cancelReason: null };
const round: RoundDetail = { id: ID, projectId: ID, seq: 3, stage: 'alpha', status: 'open', version: '1', createdAt: AT, specPin: null, sampleManifestDigest: '', note: null, sampleSet: { sourceOwner: 'synthetic', files: [] }, gateDecisions: [], gateAvailability: { targetStage: 'beta', projectVersion: '1', reasons: [], decisions: { approved: { allowed: false, reasons: [] }, rejected: { allowed: true, reasons: [] }, exception: { allowed: true, reasons: [] } }, basis: {} } };
const decision: GateDecision = { id: 'decision', decision: 'rejected', targetStage: 'beta', reason: '합성 사유', selfApproved: false, decidedBy: { id: ID, displayName: '김개발' }, at: AT, exception: null, basis: {}, basisSummary: { attemptCount: 0, decisiveVerdict: null, evidenceLinkCount: 0 } };
const project = { id: ID, model: { code: 'ETCH-300' }, softwareLabel: null } as Project;
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

describe('lifecycle feeds and Round cells (#2587)', () => {
  it('renders a Gate decision history entry in the feed notation with its absolute title', () => {
    wrap(<GatePanel {...props({})} round={{ ...round, gateDecisions: [decision] }} />);
    const entry = screen.getByText(`feed:${AT}`);
    expect(entry).toHaveAttribute('title', `title:${AT}`);
    expect(entry.closest('p')?.textContent).toBe(`김개발 · feed:${AT}`);
    expect(document.body.textContent).not.toMatch(/KST/);
  });
  it.each([
    ['a heartbeat', AT, `list:${AT}`],
    ['no heartbeat yet', null, '없음'],
  ] as const)('renders the Round request table lease and %s in the list notation', (_, lastHeartbeatAt, heartbeat) => {
    wrap(<RoundScreen {...props({ roundDetail: round, requests: { rows: [{ ...row, lastHeartbeatAt }], total: 1 }, queueStatus: queue('Asia/Seoul') }, { view: 'history' })} project={project} roundId={ID} />);
    const table = screen.getByRole('table', { name: 'Round 검증 요청' });
    const cells = within(table).getAllByRole('cell').map(cell => cell.textContent);
    expect(cells.slice(-2)).toEqual([`list:${AT}`, heartbeat]);
    expect(within(table).getByRole('columnheader', { name: 'lease 만료' })).toBeVisible();
    expect(within(table).getByRole('columnheader', { name: '마지막 하트비트' })).toBeVisible();
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
  it('names the window zone on the compact line and shows the server time in that zone in its detail', () => {
    wrap(<QueueWindow api={props({ queueStatus: queue('Europe/Berlin') }).api} compact />);
    expect(screen.getByText(`${pageCopy.window(9, 18)} · ${pageCopy.weekend(true)} (Europe/Berlin)`)).toBeVisible();
    expect(screen.getByRole('button', { name: pageCopy.queueInfo })).toHaveAccessibleDescription(`시간대 Europe/Berlin · 서버 시각 list@Europe/Berlin:${SERVER_AT} · 사용자당 즉시 대기 요청 동시 2건까지`);
    expect(document.body.textContent).not.toMatch(/KST/);
  });
});
