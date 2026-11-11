import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { RoundScreen } from '../RoundScreen';
import { OpinionCell } from '../Opinions';
import type { Attempt, LifecycleApi, Opinion, OpinionSummary, Presentation, Project, ReadState, RequestDetail, RoundDetail, RuleResult, TableParts } from '../contracts';

const summary = { grade: { key: 'g2', label: '등급 2' }, mark: { key: 'm1', label: '표식 1' }, hasNote: true, at: '2026-11-07T00:30:00Z', count: 2 };
const evidence = [{ fileRef: 'sample.log', line: 12, fileSha256: 'abc', hasExcerpt: false }];
const rules: RuleResult[] = [
  { id: 'fail', ruleId: 'R-FAIL', result: 'FAIL', required: true, expected: '일치', observed: '불일치', evidence, hasExcerpt: false, opinion: summary },
  { id: 'none', ruleId: 'R-NONE', result: 'PASS', required: true, expected: null, observed: null, evidence: [], hasExcerpt: false, opinion: null },
];
const attempt: Attempt = { id: 'attempt', attemptNo: 1, outcome: 'succeeded', workerActorId: 'worker', verdict: 'fail', manifestMatches: true, counts: { FAIL: 1, PASS: 1 }, requiredUnchecked: 0, ruleCount: 2, startedAt: summary.at, endedAt: summary.at, ruleSetRevision: null, inputManifestDigest: 'abc', opinionCount: 3 };
const project = { id: 'project' } as Project;
const round = { id: 'round', projectId: project.id, seq: 1, status: 'open', gateDecisions: [], sampleSet: { sourceOwner: 'test', files: [] }, gateAvailability: { targetStage: null, projectVersion: '1', reasons: [], decisions: { approved: { allowed: false, reasons: [] }, rejected: { allowed: false, reasons: [] }, exception: { allowed: false, reasons: [] } }, basis: {} } } as unknown as RoundDetail;
const note = '<script>alert("query")</script>\n둘째 줄';
const history: Opinion[] = [
  { id: 'latest', itemKey: 'R-FAIL', ruleResultId: 'fail', ...summary, author: { id: 'author2', displayName: '작성자 2' }, note, evidence, inputRevision: '<r2>', producer: '<producer2>' },
  { id: 'older', itemKey: 'R-FAIL', ruleResultId: 'fail', ...summary, at: '2026-11-06T00:00:00Z', author: { id: 'author1', displayName: '작성자 1' }, note: null, evidence: [], inputRevision: null, producer: null },
];
function Table<T extends { id: string }>(p: TableParts<T>) { return <><table aria-label={p.title}><thead><tr>{p.columns.map(c => <th key={c.id}>{c.header}</th>)}</tr></thead><tbody>{p.rows.map(r => <tr key={r.id}>{p.columns.map(c => <td key={c.id}>{c.cell(r)}</td>)}</tr>)}</tbody></table>{p.pagination}</>; }
const ui: Presentation = { table: Table, drawer: p => <section role="dialog" aria-label={String(p.title)}>{p.subtitle}{p.body}<button type="button" onClick={p.requestClose}>닫기</button></section>, timeline: () => null, trust: () => null };
function setup(options: { opinionCount?: number; undeclared?: boolean; scaleState?: 'loading' | 'error'; history?: Opinion[] } = {}) {
  const read = vi.fn((name: string, params: Record<string, unknown>, enabled = true): unknown => {
    if (!enabled) return null;
    if (name === 'roundDetail') return round;
    if (name === 'requests') return { rows: [{ id: 'request' }], total: 1 };
    if (name === 'requestDetail') return { roundId: 'round', attempts: [{ ...attempt, opinionCount: options.opinionCount ?? 3 }] } as RequestDetail;
    if (name === 'opinionScale') return { grades: options.undeclared ? [] : [{ key: 'g2', label: '등급 2' }, { key: 'g1', label: '등급 1' }], marks: [] };
    if (name === 'ruleResults') { const rows = rules.filter(r => !params.opinionGrade || (params.opinionGrade === 'none' ? !r.opinion : r.opinion?.grade.key === params.opinionGrade)); return { rows, total: rows.length }; }
    if (name === 'opinions') return params.unlinked ? { rows: [{ id: 'unlinked', itemKey: 'extra', ...summary }], total: 1 } : { rows: options.history ?? history, total: 2 };
    return null;
  });
  const api: LifecycleApi = { useRead: <T,>(name: string, params: Record<string, unknown>, enabled = true): ReadState<T> => ({ status: name === 'opinionScale' ? options.scaleState ?? 'done' : 'done', data: read(name, params, enabled) as T | null, retry: vi.fn() }), useAction: () => ({ pending: false, run: vi.fn() }) };
  const presentation = { ...ui };
  const table = vi.spyOn(presentation, 'table');
  const mounted = render(<RoundScreen api={api} ui={presentation} roundId="round" project={project} actorId="actor" canRound={false} canProject={false} setSelection={vi.fn()} />);
  return { read, table, ...mounted };
}
afterEach(cleanup);
it.each([
  [null, '—'],
  [{ ...summary, mark: null, hasNote: false, count: 1 }, '등급 2'],
  [summary, '등급 2표식 1설비사 질의2건'],
  [{ ...summary, grade: { key: 'retired', label: null }, mark: { key: 'old_mark', label: null }, hasNote: false, count: 1 }, 'retiredold_mark'],
] satisfies [OpinionSummary | null, string][])('renders an opinion cell with text %s', (opinion, text) => {
  const onOpen = vi.fn(); const { container } = render(<OpinionCell itemKey="item" opinion={opinion} onOpen={onOpen} />);
  expect(container.textContent).toBe(text);
  if (opinion) { fireEvent.click(screen.getByRole('button', { name: 'item 의견 이력' })); expect(onOpen).toHaveBeenCalledOnce(); } else expect(screen.queryByRole('button')).toBeNull();
});
it('keeps FAIL and fixed column widths while appending the opinion column', () => {
  const { table } = setup(); const grid = screen.getByRole('table', { name: '규칙 결과' });
  expect(within(grid).getByText('실패')).toBeVisible();
  expect(within(grid).getByRole('button', { name: 'R-FAIL 의견 이력' })).toBeVisible();
  const parts = table.mock.calls.map(([p]) => p).find(p => p.title === '규칙 결과');
  expect(parts?.columns.map(c => [c.header, c.size])).toEqual([['규칙·필수', 100], ['결과', 90], ['기대·관측', 210], ['근거 위치·발췌', 280], ['의견', undefined]]);
});
it('filters only rule rows in scale order, preserving result chips, summary and the unlinked list', async () => {
  const user = userEvent.setup(); const { read } = setup();
  const counts = screen.getByRole('group', { name: '규칙 결과 필터' }).textContent;
  fireEvent.keyDown(screen.getByRole('combobox', { name: '의견 등급' }), { key: 'Enter' });
  expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['전체', '등급 2', '등급 1', '의견 없음']);
  await user.click(screen.getByRole('option', { name: '의견 없음' }));
  expect(within(screen.getByRole('table', { name: '규칙 결과' })).queryByText('R-FAIL')).toBeNull();
  expect(screen.getByRole('group', { name: '규칙 결과 필터' }).textContent).toBe(counts);
  expect(screen.getByRole('button', { name: 'extra 의견 이력' })).toBeVisible();
  expect(read).toHaveBeenCalledWith('ruleResults', expect.objectContaining({ opinionGrade: 'none', page: 0 }), true);
  expect(read.mock.calls.filter(([name]) => name === 'opinions').every(([, params]) => !('opinionGrade' in params))).toBe(true);
});
it('reads history only on opening and renders query and revision references as plain text, newest first', async () => {
  const { container, read } = setup();
  expect(read.mock.calls.filter(([name, p]) => name === 'opinions' && !p.unlinked)).toHaveLength(0);
  await userEvent.setup().click(screen.getByRole('button', { name: 'R-FAIL 의견 이력' }));
  const drawer = screen.getByRole('dialog', { name: '의견 이력' });
  expect(within(drawer).getByText(note, { normalizer: s => s })).toHaveClass('whitespace-pre-wrap');
  expect(container.querySelector('script')).toBeNull();
  expect(within(drawer).getByText('입력 리비전 <r2> · 생산자 <producer2>')).toBeVisible();
  expect(within(drawer).getAllByRole('listitem').map(li => li.textContent)).toEqual([expect.stringContaining('작성자 2'), expect.stringContaining('작성자 1')]);
  await userEvent.setup().click(within(drawer).getByRole('button', { name: '근거 1 · sample.log:12' }));
  expect(screen.queryByRole('dialog', { name: '의견 이력' })).toBeNull();
  expect(within(screen.getByRole('dialog', { name: '근거 위치' })).getByText('sample.log:12')).toBeVisible();
});
it('opens the same history and evidence drawer from the unlinked list', async () => {
  const { read } = setup({ history: history.map(o => ({ ...o, itemKey: 'extra', ruleResultId: null })) });
  const list = screen.getByRole('table', { name: '규칙 결과에 연결되지 않은 의견' });
  expect(within(list).getByText('표식 1')).toBeVisible(); expect(within(list).getByText('설비사 질의', { selector: 'span' })).toBeVisible();
  await userEvent.setup().click(within(list).getByRole('button', { name: 'extra 의견 이력' }));
  expect(read).toHaveBeenCalledWith('opinions', expect.objectContaining({ itemKey: 'extra' }), true);
  await userEvent.setup().click(screen.getByRole('button', { name: '근거 1 · sample.log:12' }));
  expect(screen.getByRole('dialog', { name: '근거 위치' })).toHaveTextContent('abc');
});
it('keeps the original table and has no opinion UI or reads for opinionCount zero', () => {
  const { read, table } = setup({ opinionCount: 0 });
  expect(screen.queryByRole('combobox', { name: '의견 등급' })).toBeNull();
  expect(screen.queryByText('규칙 결과에 연결되지 않은 의견')).toBeNull(); expect(screen.queryByText('의견 척도 미선언')).toBeNull();
  const parts = table.mock.calls.map(([p]) => p).find(p => p.title === '규칙 결과');
  expect(parts?.columns.map(c => c.id)).toEqual(['rule', 'result', 'observed', 'evidence']);
  expect(parts?.preferenceKey).toBe('log-lifecycle-rule-results');
  expect(read.mock.calls.filter(([name, , enabled]) => (name === 'opinionScale' || name === 'opinions') && enabled)).toHaveLength(0);
});
it('shows one muted note and hides the opinion column/filter when the scale is undeclared', () => {
  setup({ undeclared: true });
  expect(screen.getAllByText('의견 척도 미선언')).toHaveLength(1);
  expect(screen.queryByRole('combobox', { name: '의견 등급' })).toBeNull();
  expect(within(screen.getByRole('table', { name: '규칙 결과' })).queryByRole('columnheader', { name: '의견' })).toBeNull();
});
it.each(['loading', 'error'] as const)('does not mislabel scale %s as undeclared', scaleState => {
  setup({ scaleState }); expect(screen.queryByText('의견 척도 미선언')).toBeNull();
  expect(screen.getAllByRole(scaleState === 'loading' ? 'status' : 'button').length).toBeGreaterThan(0);
});
