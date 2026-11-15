/** Synthetic attempt diagnostics. No real producer or Source text. */
import { ATTEMPT_ID, OPINION_ATTEMPT_ID, rules, rounds, requests, excerptReaders } from './fixtures';
import { opinionRules } from './opinions';

type Params = Record<string, unknown>;
const explanationLength = 4000;
const cellLength = 500;
const tablePageSize = 100;
const maximumColumns = 16;
const producer = 'synthetic-validator';
const table = {
  tableKey: 'timing', title: '합성 이벤트 간격',
  columns: [{ key: 'event', label: '이벤트', type: 'string' }, { key: 'expected', label: '기대 (밀리초)', type: 'number' }, { key: 'observed', label: '관측 (밀리초)', type: 'number' }],
  totalRows: 3, rowOffset: 0,
  rows: [{ event: '<b>시작</b> **강조 아님**', expected: 120, observed: 182.5 }, { event: '합성 긴 셀 '.repeat(100).slice(0, cellLength), expected: 2500, observed: 21000 }, { event: '=SUM(A1:A2) https://example.invalid', expected: 0, observed: -3 }],
};
const evidenceRefs = [{ fileRef: 's3://synthetic/sample-01.log', line: 184, fileSha256: 'a'.repeat(64) }];
const wideTable = { tableKey: 'wide', title: '합성 16열 표', columns: Array.from({ length: maximumColumns }, (_, index) => ({ key: `column_${index}`, label: `합성 열 ${index + 1}`, type: 'string' })), totalRows: 1, rowOffset: 0, rows: [Object.fromEntries(Array.from({ length: maximumColumns }, (_, index) => [`column_${index}`, `합성 값 ${index + 1}`]))] };
const items = [
  { producer, itemKey: 'synthetic-timing', origin: 'rule', ruleResultId: rules[0]!.id, bodyState: 'live', title: '이벤트 간격 차이', explanation: '<b>해석하지 않는 HTML</b>\n## Markdown 제목 아님\n=SUM(A1:A2) https://example.invalid\n\n합성 이벤트의 기대 간격과 관측 간격을 대조합니다.', evidenceRefs, tables: [table, { tableKey: 'summary', title: '합성 구간 요약', columns: [{ key: 'segment', label: '구간', type: 'string' }, { key: 'count', label: '이벤트 수', type: 'number' }, { key: 'matched', label: '일치', type: 'boolean' }], totalRows: 2, rowOffset: 0, rows: [{ segment: '구간 A', count: 1280, matched: false }, { segment: '구간 B', count: 32, matched: true }] }] },
  { producer, itemKey: 'synthetic-long', origin: 'analysis', ruleResultId: null, bodyState: 'live', title: '시도 전체 분석 · 긴 설명', explanation: '합성 설명입니다. 이벤트 간격과 순서를 확인합니다.\n'.repeat(200).slice(0, explanationLength), evidenceRefs, tables: [wideTable] },
  ...(['erased_retention', 'erased_admin'] as const).map(bodyState => ({ producer, itemKey: `synthetic-${bodyState}`, origin: 'analysis', ruleResultId: null, bodyState, title: null, explanation: null, evidenceRefs, tables: [{ ...table, title: null, columns: table.columns.map(c => ({ ...c, label: null })), rows: [] }] })),
];
export function readDiagnostics(name: string, p: Params, actor: string): unknown {
  const populated = p.attemptId === ATTEMPT_ID || p.attemptId === OPINION_ATTEMPT_ID;
  const request = requests.find(r => r.attempts.some(a => a.id === p.attemptId));
  const round = rounds.find(r => r.id === request?.roundId);
  if (!round || !request?.attempts.some(a => a.id === p.attemptId && a.outcome === 'succeeded')) return null;
  const allowed = !!round && (excerptReaders[round.sampleSet.sourceOwner]?.includes(actor) ?? false);
  const attemptRuleId = p.attemptId === OPINION_ATTEMPT_ID ? opinionRules[0]!.id : rules[0]!.id;
  const attemptItems = items.map(item => ({ ...item, ruleResultId: item.origin === 'rule' ? attemptRuleId : null }));
  const source = populated ? attemptItems : [];
  if (name === 'diagnostics') {
    const filtered = source.filter(i => !p.ruleResultId || i.ruleResultId === p.ruleResultId);
    const start = Number(p.page ?? 0) * Number(p.pageSize ?? 25);
    return { access: allowed ? 'granted' : 'no_permission', documents: populated ? [{ producer, producerVersion: '1.0.0', schemaVersion: 1, itemCount: items.length, createdAt: '2026-11-07T00:30:00Z' }] : [], rows: filtered.slice(start, start + Number(p.pageSize ?? 25)).map(i => ({ producer: i.producer, itemKey: i.itemKey, origin: i.origin, ruleResultId: i.ruleResultId, bodyState: i.bodyState, title: allowed ? i.title : null, evidenceCount: i.evidenceRefs.length, tableCount: i.tables.length, rowCounts: i.tables.map(t => t.totalRows) })), total: filtered.length };
  }
  // Mock data handlers cannot express forbidden; deny body delivery just like the existing excerpt mock.
  if (!allowed) return null;
  const item = source.find(i => i.producer === p.producer && i.itemKey === p.itemKey);
  if (!item) return null;
  const offset = Number(p.rowOffset ?? 0);
  return { item: { ...item, tables: item.tables.filter(table => p.tableKey === undefined || table.tableKey === p.tableKey).map(table => {
    const rowOffset = p.tableKey === table.tableKey ? offset : 0;
    return { ...table, rowOffset, rows: table.rows.slice(rowOffset, rowOffset + tablePageSize) };
  }) } };
}
