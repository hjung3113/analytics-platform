import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { HostSeam } from '../../../lib/host/host-seam';
import { BaselinePanel } from '../BaselinePanel';
import type { Baseline, DatasetApi, DatasetDetail, Presentation, Revision, Run, ScreenProps, SuiteDetail, TableParts } from '../contracts';
import { DatasetScreen } from '../DatasetScreen';
import { DatasetsScreen } from '../DatasetsScreen';
import { DatasetHost } from '../host';
import { RunsPanel } from '../RunsPanel';

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(cleanup);

/** Tags each value with the notation the screen asked for, so a test sees the Kernel notation choice, not a formatter. */
const time: NonNullable<HostSeam['time']> = {
  list: (at, options) => options?.timeZone ? `list@${options.timeZone}:${at}` : `list:${at}`,
  summary: at => `summary:${at}`,
  feed: at => ({ text: `feed:${at}`, title: `title:${at}` }),
};
const AT = '2026-11-08T11:40:00Z';
/** The legacy `YY. M. D.` text of `formatDateTime(value, '2-digit')`. */
const TWO_DIGIT_YEAR = /(^|[^\d])\d{2}\. \d{1,2}\. \d{1,2}\./;
const wrap = (node: ReactNode) => render(<DatasetHost time={time}>{node}</DatasetHost>);

const tables: TableParts<{ id: string }>[] = [];
const ui: Presentation = {
  page: ({ children, primaryAction }) => <>{primaryAction}{children}</>,
  cellLink: ({ children }) => <span>{children}</span>,
  table: parts => { tables.push(parts as unknown as TableParts<{ id: string }>); return <section aria-label={parts.title}>{parts.rows.map(r => <div key={r.id} role="row">{parts.columns.map(c => <span key={c.id} role="cell">{c.cell(r)}</span>)}</div>)}</section>; },
  drawer: ({ title, body }) => <div role="dialog" aria-label={String(title)}>{body}</div>,
  timeline: () => null,
  trust: () => null,
};
const owner = { id: 'me', displayName: '김검토' };
const revision: Revision = { id: 'rev', seq: 3, sourceOwner: 'synthetic', fileCount: 2, digest: 'sha256:abc', inputMeta: {}, note: null, createdBy: owner, createdAt: AT, availability: 'available', availabilityChecked: true, baselines: { draftCount: 0, supersededCount: 0, approved: null } };
const dataset: DatasetDetail = { id: 'ds', name: '전원 복구 경계 01', purpose: null, owner, shareScope: 'private', modelIds: [], scenarioTags: [], status: 'active', synthetic: false, revisionCount: 1, latestRevisionSeq: 3, version: '1', createdAt: AT, updatedAt: AT, revisions: [revision] };
const baseline: Baseline = { id: 'b', datasetId: 'ds', datasetRevisionId: 'rev', revisionSeq: 3, seq: 2, status: 'approved', profilePin: {}, expectationCount: 0, scopeCount: 0, author: owner, approvedBy: owner, approvedAt: AT, version: '4', stale: null, expectedScope: [], expectations: [], events: [] };
const suite: SuiteDetail = { id: 'suite', name: '회귀 묶음', engineProfileRef: null, items: [], version: '1' };
const run: Run = { id: 'run', suiteId: 'suite', state: 'succeeded', createdAt: AT, engineProfileRef: null, items: [] };
function props(data: Record<string, unknown>): ScreenProps {
  const api: DatasetApi = { useRead: <T,>(name: string) => ({ status: 'done', data: (data[name] ?? null) as T | null, retry: vi.fn() }), useAction: () => ({ pending: false, run: vi.fn() }) };
  return { api, ui, actorId: 'me', canManage: true, canApprove: true, canRun: true, navigate: vi.fn() };
}

describe('dataset instants use the host Kernel notation (#2587)', () => {
  it('renders the dataset list update cell and its export in the list notation', () => {
    tables.length = 0;
    wrap(<DatasetsScreen {...props({ datasets: { rows: [dataset], total: 1 } })} />);
    const table = screen.getByRole('region', { name: '테스트 데이터셋 목록' });
    expect(within(table).getByText(`list:${AT}`)).toBeVisible();
    const column = tables.at(-1)?.columns.find(c => c.id === 'updatedAt');
    expect(column?.exportValue?.(dataset)).toBe(`list:${AT}`);
    expect(document.body.textContent).not.toMatch(TWO_DIGIT_YEAR);
  });
  it('renders the overview update line in the summary notation and a Revision history row in the feed notation', async () => {
    wrap(<DatasetScreen {...props({ datasetDetail: dataset })} datasetId="ds" />);
    expect(screen.getByText(`summary:${AT}`)).toBeVisible();
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Revision' }));
    const entry = screen.getByText(`feed:${AT}`);
    expect(entry).toHaveAttribute('title', `title:${AT}`);
    expect(entry.closest('p')?.textContent).toBe(`r3 · 2개 파일 · feed:${AT}`);
    expect(document.body.textContent).not.toMatch(TWO_DIGIT_YEAR);
  });
  it.each([
    ['an approval time', baseline, `승인자 김검토 · summary:${AT}`],
    ['no approval time', { ...baseline, approvedBy: null, approvedAt: null }, '승인자 없음 · —'],
  ] as const)('renders the Baseline approval line with %s in the summary notation', (_, b, text) => {
    wrap(<BaselinePanel {...props({ baselines: { rows: [b] }, baselineDetail: b })} dataset={dataset} revisionId="rev" />);
    expect(screen.getByText(/^승인자 /).textContent).toBe(text);
    expect(document.body.textContent).not.toMatch(TWO_DIGIT_YEAR);
  });
  it('renders a regression run row in the list notation', () => {
    wrap(<RunsPanel {...props({ suites: { rows: [suite], total: 1 }, suiteDetail: suite, suiteRuns: { rows: [run], total: 1 } })} dataset={dataset} />);
    expect(screen.getByText('run').parentElement?.textContent).toContain(`list:${AT}`);
    expect(document.body.textContent).not.toMatch(TWO_DIGIT_YEAR);
  });
  it('names a comparison run choice by its list-notation time', async () => {
    wrap(<RunsPanel {...props({ suites: { rows: [suite], total: 1 }, suiteDetail: suite, suiteRuns: { rows: [{ ...run, items: [{ ordinal: 1, restricted: false, datasetId: 'ds', requestState: 'succeeded', attemptCount: 1, latestVerdict: 'pass' }] }], total: 1 } })} dataset={dataset} compare />);
    await userEvent.setup().click(screen.getByRole('combobox', { name: '비교할 회귀 실행' }));
    expect(screen.getByRole('option', { name: `list:${AT} · 완료` })).toBeVisible();
    expect(document.body.textContent).not.toMatch(TWO_DIGIT_YEAR);
  });
});
