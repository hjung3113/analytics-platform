import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Attempt, DiagnosticItem, DiagnosticList, Presentation, Project, RequestDetail, RoundDetail, RuleResult, ScreenProps, TableParts } from '../contracts';
import { RoundScreen } from '../RoundScreen';
const project = { id: 'project', model: { code: 'ETCH-300' }, softwareLabel: '3.2.1' } as Project;
const attempt: Attempt = { id: 'attempt-1', attemptNo: 1, outcome: 'succeeded', verdict: 'incomplete', workerActorId: 'worker-1', manifestMatches: true, counts: { ERROR: 1, NOT_CHECKED: 1, PASS: 1 }, requiredUnchecked: 2, ruleCount: 3, startedAt: '', endedAt: '', ruleSetRevision: null, inputManifestDigest: '' };
const request = { id: 'request-1', roundId: 'round-1', state: 'succeeded', attempts: [attempt] } as RequestDetail;
const rule: RuleResult = { id: 'rule-1', ruleId: 'TIME-001', result: 'ERROR', required: true, expected: '기대', observed: '관측', evidence: [], hasExcerpt: false };
const round: RoundDetail = { id: 'round-1', projectId: 'project', seq: 3, stage: 'alpha', status: 'open', version: '1', createdAt: '', specPin: null, sampleManifestDigest: '', note: null, sampleSet: { sourceOwner: 'synthetic-team', files: [{ fileRef: 'synthetic.log', order: 1, sha256: 'a'.repeat(64) }] }, gateDecisions: [], gateAvailability: { targetStage: 'beta', projectVersion: '1', reasons: [], decisions: { approved: { allowed: false, reasons: ['verdict_not_pass'] }, rejected: { allowed: true, reasons: [] }, exception: { allowed: true, reasons: [] } }, basis: { decisiveAttemptId: 'attempt-1', decisiveVerdict: 'incomplete', attempts: [{ attemptId: 'attempt-1', requestId: 'request-1', attemptNo: 1, verdict: 'incomplete' }] } } };

const listData: DiagnosticList = {
  access: 'granted',
  documents: [{ producer: 'synthetic-validator', producerVersion: '1.0.0', schemaVersion: 1, itemCount: 4, createdAt: '' }],
  total: 4,
  rows: [
    { producer: 'synthetic-validator', itemKey: 'synthetic-timing', origin: 'rule', ruleResultId: 'rule-1', bodyState: 'live', title: '이벤트 간격 차이', evidenceCount: 1, tableCount: 2, rowCounts: [3, 2] },
    { producer: 'synthetic-validator', itemKey: 'synthetic-long', origin: 'analysis', ruleResultId: null, bodyState: 'live', title: '시도 전체 분석 · 긴 설명', evidenceCount: 1, tableCount: 1, rowCounts: [3] },
    { producer: 'synthetic-validator', itemKey: 'synthetic-erased_retention', origin: 'analysis', ruleResultId: null, bodyState: 'erased_retention', title: null, evidenceCount: 1, tableCount: 1, rowCounts: [3] },
    { producer: 'synthetic-validator', itemKey: 'synthetic-erased_admin', origin: 'analysis', ruleResultId: null, bodyState: 'erased_admin', title: null, evidenceCount: 1, tableCount: 1, rowCounts: [3] },
  ],
};

const timingItem: DiagnosticItem = {
  producer: 'synthetic-validator',
  itemKey: 'synthetic-timing',
  origin: 'rule',
  ruleResultId: 'rule-1',
  bodyState: 'live',
  title: '이벤트 간격 차이',
  explanation: '<b>해석하지 않는 HTML</b>\n=SUM(A1:A2) https://example.invalid',
  evidenceRefs: [{ fileRef: 'synthetic.log', line: 184, fileSha256: 'a'.repeat(64) }],
  tables: [
    {
      tableKey: 'timing',
      title: '합성 이벤트 간격',
      columns: [
        { key: 'event', label: '이벤트', type: 'string' },
        { key: 'expected', label: '기대 (밀리초)', type: 'number' },
        { key: 'observed', label: '관측 (밀리초)', type: 'number' },
      ],
      totalRows: 1,
      rowOffset: 0,
      rows: [{ event: '<b>시작</b> **강조 아님**', expected: 120, observed: 182.5 }],
    },
    {
      tableKey: 'summary',
      title: '합성 구간 요약',
      columns: [
        { key: 'segment', label: '구간', type: 'string' },
        { key: 'count', label: '이벤트 수', type: 'number' },
        { key: 'matched', label: '일치', type: 'boolean' },
      ],
      totalRows: 2,
      rowOffset: 0,
      rows: [
        { segment: '구간 A', count: 1280, matched: false },
        { segment: '구간 B', count: 32, matched: true },
      ],
    },
  ],
};

function required<T>(value: T | undefined): T { if (value === undefined) throw new Error('Missing synthetic fixture'); return value; }
function Table<T extends { id: string }>(p: TableParts<T>) {
  return <><table aria-label={p.title}><thead><tr>{p.columns.map(c => <th key={c.id}>{c.header}</th>)}</tr></thead><tbody>{p.rows.map(r => <tr key={r.id}>{p.columns.map(c => <td key={c.id}>{c.cell(r)}</td>)}</tr>)}</tbody></table>{p.pagination}</>;
}
const ui: Presentation = { table: Table, drawer: p => <section role="dialog" aria-label={String(p.title)}>{p.body}</section>, timeline: () => null, trust: () => null, sourceView: () => <p>합성 원본</p> };
function setup(options: { state?: Record<string, string>; list?: DiagnosticList; item?: DiagnosticItem | null; attempt?: Attempt | null; denied?: boolean } = {}) {
  const reads: { name: string; params: Record<string, unknown> }[] = [];
  const patches = vi.fn();
  function Host() {
    const [state, setState] = useState<Record<string, string>>(options.state ?? { view: 'diagnostics' });
    const selectedAttempt = options.attempt === undefined ? attempt : options.attempt;
    const requestData = { ...request, attempts: selectedAttempt ? [selectedAttempt] : [] };
    const props: ScreenProps = { ui, state, setState: patch => { patches(patch); setState(previous => { const next = { ...previous }; for (const [key, value] of Object.entries(patch)) { if (value === undefined) delete next[key]; else next[key] = value; } return next; }); }, actorId: 'actor', canProject: false, canRound: false, setSelection: vi.fn(), api: {
      useAction: () => ({ pending: false, run: vi.fn() }),
      useRead: <T,>(name: string, params: Record<string, unknown>, enabled = true) => {
        if (enabled) reads.push({ name, params });
        const item = options.item ?? timingItem;
        const detailItem = params.tableKey ? { ...item, tables: item.tables.filter(table => table.tableKey === params.tableKey).map(table => ({ ...table, rowOffset: Number(params.rowOffset), rows: [{ event: '합성 다음 페이지' }] })) } : item;
        return { status: name === 'diagnosticItem' && options.denied ? 'error' : 'done', denied: name === 'diagnosticItem' && !!options.denied, data: ({ roundDetail: round, requests: { rows: [requestData], total: 1 }, requestDetail: requestData, ruleResults: { rows: [rule], total: 1 }, diagnostics: options.list ?? listData, diagnosticItem: options.item === null ? null : { item: detailItem } }[name] ?? null) as T, retry: vi.fn() };
      },
    } };
    return <RoundScreen {...props} project={project} roundId={round.id} />;
  }
  return { ...render(<Host />), reads, patches };
}
afterEach(cleanup);
describe('attempt diagnostics (#1815 B2)', () => {
  it('makes no diagnostic reads outside its tab, including attempt history', () => {
    const t = setup({ state: {} });
    expect(t.reads.filter(r => r.name.startsWith('diagnostic'))).toEqual([]);
    fireEvent.mouseDown(screen.getByRole('tab', { name: '설정·이력' }), { button: 0 });
    expect(t.reads.filter(r => r.name.startsWith('diagnostic'))).toEqual([]);
  });
  it('shows plain text, shape, producer slugs and evidence locations with a Source link', async () => {
    const t = setup(); const user = userEvent.setup();
    expect(screen.getByRole('heading', { name: '시도 진단 · 시도 #1' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: '진단 목록' })).toBeNull();
    expect(screen.queryByText('합성 검증기')).toBeNull();
    await user.click(screen.getByRole('button', { name: '이벤트 간격 차이' }));
    expect(screen.getByText(/<b>해석하지 않는 HTML<\/b>/)).toBeVisible();
    expect(screen.getByText('<b>시작</b> **강조 아님**')).toBeVisible();
    expect(document.querySelector('b')).toBeNull();
    expect(document.querySelector('a')).toBeNull();
    expect(screen.getByText('아니오')).toBeVisible();
    expect(screen.getByText('synthetic.log:184')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '원본에서 보기' }));
    expect(t.patches).toHaveBeenLastCalledWith({ view: 'source', sourceTab: undefined, sourceFocus: '1:184', sourceDrawer: 'record' });
  });
  it.each(['erased_retention', 'erased_admin', 'no_permission'] as const)('uses one framed body state with shape metadata for %s', state => {
    const item: DiagnosticItem = { ...timingItem, bodyState: state === 'no_permission' ? 'live' : state, title: null, explanation: null, tables: timingItem.tables.map(table => ({ ...table, title: null, rows: [] })) };
    setup({ state: { view: 'diagnostics', diagnostic: 'synthetic-validator:synthetic-timing' }, item, denied: state === 'no_permission' });
    expect(screen.getByLabelText('형태 요약')).toHaveTextContent('synthetic-timing');
    expect(screen.getByLabelText('형태 요약')).toHaveTextContent('근거 위치1');
    expect(screen.getByLabelText('형태 요약').closest('[role="status"]')).toBeTruthy();
    if (state !== 'no_permission') expect(screen.getByRole('button', { name: '원본에서 보기' })).toBeEnabled();
  });
  it('keeps metadata without making a forbidden detail read when the list denies Source access', async () => {
    const t = setup({ list: { ...listData, access: 'no_permission', rows: listData.rows.map(row => ({ ...row, title: null })) } });
    await userEvent.setup().click(required(screen.getAllByRole('button', { name: '제목 열람 불가' })[0]));
    expect(screen.getByText('본문 열람 권한 없음')).toBeVisible();
    expect(screen.getByLabelText('형태 요약')).toHaveTextContent('synthetic-timing');
    expect(t.reads.some(r => r.name === 'diagnosticItem')).toBe(false);
  });
  it.each([null, { ...timingItem, itemKey: 'wrong-item' }])('shows not found for an unknown or mismatched selection without fallback', item => {
    setup({ state: { view: 'diagnostics', diagnostic: 'synthetic-validator:unknown' }, item });
    expect(screen.getByText(/찾을 수 없음/)).toBeVisible();
    expect(screen.queryByText('<b>해석하지 않는 HTML</b> =SUM(A1:A2) https://example.invalid')).toBeNull();
  });
  it('distinguishes a missing submission from an empty rule filter and allows clearing that filter', async () => {
    const t = setup({ state: { view: 'diagnostics', diagnosticRule: rule.id }, list: { ...listData, rows: [], total: 0 } });
    expect(screen.getByText('이 규칙에 연결된 진단이 없습니다')).toBeVisible();
    await userEvent.setup().click(required(screen.getAllByRole('button', { name: '규칙 필터 해제' })[0]));
    expect(t.patches).toHaveBeenLastCalledWith({ diagnosticRule: undefined, diagnostic: undefined });
  });
  it('shows the not-submitted state for documents: []', () => {
    setup({ list: { ...listData, documents: [], rows: [], total: 0 } });
    expect(screen.getByText('이 시도에 제출된 진단이 없습니다')).toBeVisible();
    expect(screen.queryByRole('table', { name: '진단 목록' })).toBeNull();
  });
  it.each([null, { ...attempt, outcome: 'failed' }])('explains an unavailable attempt without diagnostic reads', selected => {
    const t = setup({ state: { view: 'diagnostics', ...(selected ? { attempt: selected.id } : {}) }, attempt: selected });
    expect(screen.getByText(selected ? /선택한 시도는 결과 저장이 완료되지/ : /선택한 시도가 없습니다/)).toBeVisible();
    expect(t.reads.some(r => r.name.startsWith('diagnostic'))).toBe(false);
  });
  it('contains a 16-column table in a horizontal scroll wrapper without a duplicate region landmark', () => {
    const item = { ...timingItem, tables: [{ ...required(timingItem.tables[0]), columns: Array.from({ length: 16 }, (_, i) => ({ key: `col_${i}`, label: `열 ${i + 1}`, type: 'string' as const })) }] };
    setup({ state: { view: 'diagnostics', diagnostic: 'synthetic-validator:synthetic-timing' }, item });
    expect(screen.queryByRole('region', { name: '합성 이벤트 간격' })).toBeNull();
    const wrapper = required(screen.getByRole('table', { name: '합성 이벤트 간격' }).parentElement ?? undefined);
    expect(wrapper).toHaveClass('min-w-0', 'max-w-full', 'overflow-x-auto');
    expect(within(wrapper).getAllByRole('columnheader')).toHaveLength(16);
  });
  it('reads the next 100-row table page explicitly and returns to all tables on request', async () => {
    const item: DiagnosticItem = { ...timingItem, tables: [{ ...required(timingItem.tables[0]), totalRows: 101 }, required(timingItem.tables[1])] };
    const t = setup({ state: { view: 'diagnostics', diagnostic: 'synthetic-validator:synthetic-timing' }, item });
    const user = userEvent.setup();
    const wrapper = required(screen.getByRole('table', { name: '합성 이벤트 간격' }).parentElement ?? undefined);
    await user.click(within(wrapper).getByRole('button', { name: '다음' }));
    expect(t.reads).toContainEqual({ name: 'diagnosticItem', params: { attemptId: attempt.id, producer: item.producer, itemKey: item.itemKey, tableKey: 'timing', rowOffset: 100 } });
    expect(screen.getByText('합성 다음 페이지')).toBeVisible();
    expect(screen.queryByRole('table', { name: '합성 구간 요약' })).toBeNull();
    const readsBeforeAllTables = t.reads.length;
    await user.click(screen.getByRole('button', { name: '전체 표 보기' }));
    expect(t.reads.slice(readsBeforeAllTables)).toContainEqual({ name: 'diagnosticItem', params: { attemptId: attempt.id, producer: item.producer, itemKey: item.itemKey } });
    expect(screen.getByRole('table', { name: '합성 구간 요약' })).toBeVisible();
  });
  it('starts a new list read on every page transition including revisiting an earlier page', async () => {
    const t = setup({ list: { ...listData, total: 30 } });
    const user = userEvent.setup();
    const readsBeforePaging = t.reads.length;
    const listWrapper = required(screen.getByRole('table', { name: '진단 목록' }).parentElement ?? undefined);
    await user.click(within(listWrapper).getByRole('button', { name: '다음' }));
    const nextWrapper = required(screen.getByRole('table', { name: '진단 목록' }).parentElement ?? undefined);
    await user.click(within(nextWrapper).getByRole('button', { name: '이전' }));
    const listPages = t.reads.slice(readsBeforePaging).filter(r => r.name === 'diagnostics').map(r => r.params.page);
    expect(listPages).toEqual([1, 0]);
  });

  it('hides previously listed Source titles when the selected detail read denies access', () => {
    setup({ state: { view: 'diagnostics', diagnostic: 'synthetic-validator:synthetic-timing' }, denied: true });
    expect(screen.queryByRole('button', { name: '이벤트 간격 차이' })).toBeNull();
    expect(screen.getByText('본문 열람 권한 없음')).toBeVisible();
    expect(screen.getByLabelText('형태 요약')).toHaveTextContent('synthetic-timing');
  });

});
