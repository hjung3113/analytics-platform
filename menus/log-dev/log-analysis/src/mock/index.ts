/** Synthetic request-local Source answers, never imported by a production assembly. */
import { defineMockEndpoint, defineMockAction, MockActionInvalid, MockRequestError, type AnyMockEndpoint, type AnyMockAction } from '@ap/mock-server';
import { investigationDetailEndpoint, investigationsEndpoint, recordsEndpoint, windowEndpoint, parsedEndpoint, periodsEndpoint, investigationCreate, investigationUpdate, evidenceAdd, evidenceRemove, investigationArchive, evidenceHandoff, type Investigation, type SampleSet, type SourceRow, type SourceAnswer, type PagedRead, type EvidenceRef } from '../endpoints';

type Owned = { actor: string; row: Investigation };
let investigations: Owned[] = [];
let cursors = new Map<string, { binding: string; offset: number }>();
let serial = 0;
/** The mock holds every right; the screen still gates the Round item on `origin === 'round'`. Handed-off locations per investigation, to answer alreadyAttached. */
const HANDOFF_RIGHTS = { round: true, knowledgeDraft: false };
export const ROUND_ID = '14740000-0000-4000-8000-000000000001';
export const ROUND_INVESTIGATION = '14730000-0000-4000-8000-000000000007';
let handed = new Map<string, Set<string>>();
const stamp = '2026-11-08T00:45:00.000Z';
const files = ['source-b', 'source-a', 'source-d', 'source-c'].map((fileRef, i) => ({ fileRef, order: i + 1, sha256: 'badc'[i].repeat(64) }));
const modes = ['ok', 'partial', 'absent', 'revoked', 'truncated', 'unsupported'];
export function resetExplorer() {
  serial = 0; cursors = new Map();
  investigations = modes.map((mode, i) => ({ actor: 'engineer', row: { id: `14730000-0000-4000-8000-00000000000${i + 1}`, title: i === 0 ? '합성 샘플 · 파일 4개' : `합성 상태 · ${mode}`, origin: 'standalone', roundId: null, status: 'open', version: '1', createdAt: stamp, updatedAt: stamp, filters: {}, sampleSet: { sourceOwner: `synthetic-${mode}`, files }, sampleSetState: 'inline', canInvestigate: true, handoff: HANDOFF_RIGHTS, evidence: [] } }));
  handed = new Map();
  investigations.push({ actor: 'engineer', row: { id: ROUND_INVESTIGATION, title: '합성 Round 조사', origin: 'round', roundId: ROUND_ID, status: 'open', version: '1', createdAt: stamp, updatedAt: stamp, filters: {}, sampleSet: { sourceOwner: 'synthetic-ok', files }, sampleSetState: 'round', canInvestigate: true, handoff: HANDOFF_RIGHTS, evidence: [] } });
}
resetExplorer();
const owned = (id: string, actor: string) => investigations.find(r => r.actor === actor && r.row.id.toLowerCase() === id.toLowerCase())?.row ?? null;
const modeOf = (owner: string): SourceAnswer => ({ state: owner === 'synthetic-revoked' ? 'permission_denied' : owner === 'synthetic-absent' ? 'source_absent' : owner === 'synthetic-partial' ? 'partial' : owner === 'synthetic-truncated' ? 'truncated' : owner === 'synthetic-unsupported' ? 'unsupported' : owner.startsWith('synthetic-') ? 'ok' : 'source_absent', reason: null, synthetic: owner.startsWith('synthetic-'), label: owner.startsWith('synthetic-') ? '합성' : null });
const readable = (answer: SourceAnswer) => ['ok', 'partial', 'truncated'].includes(answer.state);
function rowAt(set: SampleSet, index: number): SourceRow {
  const file = [...set.files].sort((a, b) => a.order - b.order)[Math.floor(index / 1250)]!;
  const line = index % 1250 + 1;
  const truncated = set.sourceOwner === 'synthetic-truncated';
  return { fileRef: file.fileRef, fileOrder: file.order, line, timestamp: `2026-11-08T09:${String(Math.floor(line / 60) % 60).padStart(2, '0')}:${String(line % 60).padStart(2, '0')}`, text: `${line} Module ${line % 2 + 1} ${line % 2 ? 'Start' : 'End'} Job-${line % 3 + 1}${line === 1 ? ' payload="<script>synthetic</script>"' : ''}${truncated ? ' · '.repeat(2600) : ''}`.slice(0, 8000), truncated, timeReversal: line === 127, synthetic: true };
}
function records(params: PagedRead, actor: string) {
  const answer = modeOf(params.sampleSet.sourceOwner);
  if (!readable(answer)) return { ...answer, rows: [], nextCursor: null, partial: false, truncated: false };
  const binding = JSON.stringify([actor, params.sampleSet, params.query, params.limit]);
  const cursor = params.cursor ? cursors.get(params.cursor) : null;
  if (params.cursor && cursor?.binding !== binding) throw new MockRequestError('cursor_invalid');
  let offset = cursor?.offset ?? 0;
  const end = params.sampleSet.files.length * 1250;
  const result: SourceRow[] = [];
  while (offset < end && result.length < params.limit) {
    const row = rowAt(params.sampleSet, offset++);
    const q = params.query;
    if (q.text && !row.text.includes(q.text)) continue;
    if (q.module && q.module !== `Module ${row.line % 2 + 1}`) continue;
    if (q.event && q.event !== (row.line % 2 ? 'Start' : 'End')) continue;
    if (q.logType && q.logType !== (row.line % 5 ? 'EVENT' : 'STATE')) continue;
    if (q.context && Object.entries(q.context).some(([k, v]) => k !== 'job' || v !== `Job-${row.line % 3 + 1}`)) continue;
    result.push(row);
  }
  let nextCursor: string | null = null;
  if (offset < end) { nextCursor = `synthetic-cursor-${++serial}`; cursors.set(nextCursor, { binding, offset }); }
  return { ...answer, rows: result, nextCursor, partial: answer.state === 'partial', truncated: answer.state === 'truncated' };
}
const pagedValidate = ({ params }: { params: PagedRead }) => !params.sampleSet?.files?.length || params.sampleSet.files.length > 1000 || !Number.isInteger(params.limit) || params.limit < 1 || params.limit > 200 ? 'invalid_request' : null;
export const logAnalysisMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(investigationsEndpoint, { mart: false, handle: ({ params, actor }) => { const rows = investigations.filter(r => r.actor === actor && (!params.status || r.row.status === params.status)).map(({ row }) => { const { sampleSet: _set, sampleSetState: _state, canInvestigate: _can, evidence, filters: _filters, ...summary } = row; return { ...summary, evidenceCount: evidence.length }; }); return { rows: rows.slice(params.page * params.pageSize, (params.page + 1) * params.pageSize), total: rows.length }; } }),
  defineMockEndpoint(investigationDetailEndpoint, { mart: false, handle: ({ params, actor }) => { const row = owned(params.investigationId, actor); return row ? structuredClone(row) : null; } }),
  defineMockEndpoint(recordsEndpoint, { mart: false, validate: pagedValidate, handle: ({ params, actor }) => records(params, actor) }),
  defineMockEndpoint(windowEndpoint, { mart: false, handle: ({ params }) => { const answer = modeOf(params.sourceOwner); const known = files.find(f => f.fileRef === params.fileRef); const file = known ?? { fileRef: params.fileRef, order: 1, sha256: '' }; const set = { sourceOwner: params.sourceOwner, files: known ? files : [file] }; return { ...answer, rows: readable(answer) ? Array.from({ length: Math.min(1250, params.line + params.after) - Math.max(1, params.line - params.before) + 1 }, (_, i) => rowAt(set, (file.order - 1) * 1250 + Math.max(1, params.line - params.before) - 1 + i)) : [], truncated: answer.state === 'truncated' }; } }),
  defineMockEndpoint(parsedEndpoint, { mart: false, handle: ({ params }) => { const answer = modeOf(params.sourceOwner); return { ...answer, extractedFields: readable(answer) ? { Module: `Module ${params.line % 2 + 1}`, Event: params.line % 2 ? 'Start' : 'End', 'Context 키': `Job-${params.line % 3 + 1}`, EquipmentId: 'EQ-SYNTH (confirmed)' } : null, parserIn: readable(answer) ? `${params.fileRef}:${params.line} · 합성 Parser` : null, parserOut: readable(answer) ? JSON.stringify({ module: `Module ${params.line % 2 + 1}`, event: params.line % 2 ? 'Start' : 'End' }) : null, truncated: answer.state === 'truncated' }; } }),
  defineMockEndpoint(periodsEndpoint, { mart: false, validate: pagedValidate, handle: ({ params }) => { const answer = modeOf(params.sampleSet.sourceOwner); return { ...answer, rows: readable(answer) ? params.sampleSet.files.flatMap(file => Array.from({ length: 8 }, (_, i) => ({ fileRef: file.fileRef, startLine: i * 150 + 1, endLine: i === 7 ? null : (i + 1) * 150, state: i === 0 || i === 7 ? 'incomplete' : 'period', incomplete: i === 0 || i === 7, synthetic: true }))).slice(0, params.limit) : [], nextCursor: null }; } }),
];
const invalid = (code: string, path = ['ref']) => { throw new MockActionInvalid([{ path, code }]); };
const open = (id: string, actor: string) => { const row = owned(id, actor); if (!row || row.status !== 'open') return invalid('illegal_transition'); return row; };
const touch = (row: Investigation) => { row.version = String(Number(row.version) + 1); return { data: { version: row.version }, version: row.version }; };
const version = ({ input, actor }: { input: { id: string }; actor: string }) => owned(input.id, actor)?.version ?? null;
const refErrors = (input: { ref: EvidenceRef }) => Object.keys(input.ref).some(k => !['fileRef', 'line', 'fileSha256', 'note'].includes(k)) || !input.ref.fileRef || !Number.isInteger(input.ref.line) || input.ref.line < 1 || !/^[0-9a-f]{64}$/.test(input.ref.fileSha256) ? [{ path: ['ref'], code: 'malformed' }] : [];
export const logAnalysisActionsMock: readonly AnyMockAction[] = [
  defineMockAction(investigationCreate, { handle: ({ input, actor }) => { const id = `14730000-0000-4000-8001-${String(++serial).padStart(12, '0')}`; const row: Investigation = input.origin === 'round' ? { id, title: input.title, origin: 'round', roundId: input.roundId, status: 'open', version: '1', createdAt: stamp, updatedAt: stamp, filters: {}, sampleSet: { sourceOwner: 'synthetic-ok', files }, sampleSetState: 'round', canInvestigate: true, handoff: HANDOFF_RIGHTS, evidence: [] } : { id, title: input.title, origin: 'standalone', roundId: null, status: 'open', version: '1', createdAt: stamp, updatedAt: stamp, filters: {}, sampleSet: input.sampleSet, sampleSetState: 'inline', canInvestigate: true, handoff: HANDOFF_RIGHTS, evidence: [] }; investigations.unshift({ actor, row }); return { data: { id, version: '1' }, version: null }; } }),
  defineMockAction(investigationUpdate, { version, handle: ({ input, actor }) => { const row = open(input.id, actor); if (input.title !== undefined) row.title = input.title; if (input.filters !== undefined) row.filters = structuredClone(input.filters); return touch(row); } }),
  defineMockAction(evidenceAdd, { version, validate: refErrors, handle: ({ input, actor }) => { const row = open(input.id, actor); if (row.evidence.length >= 100) return invalid('too_many'); if (row.evidence.some(e => e.ref.fileRef === input.ref.fileRef && e.ref.line === input.ref.line)) return invalid('duplicate'); row.evidence.push({ ref: { ...input.ref }, state: { code: 'available' }, sourceAccess: 'unchecked' }); return touch(row); } }),
  defineMockAction(evidenceRemove, { version, handle: ({ input, actor }) => { const row = open(input.id, actor); const at = row.evidence.findIndex(e => e.ref.fileRef === input.ref.fileRef && e.ref.line === input.ref.line); if (at < 0) return invalid('not_found'); row.evidence.splice(at, 1); return touch(row); } }),
  defineMockAction(evidenceHandoff, { version, validate: ({ refs, target }) => !Array.isArray(refs) || refs.length < 1 || refs.length > 100 ? [{ path: ['refs'], code: 'malformed' }] : target?.kind !== 'round' ? [{ path: ['target'], code: 'not_available' }] : [], handle: ({ input, actor }) => {
    const row = open(input.id, actor);
    if (row.origin !== 'round' || row.roundId !== input.target.roundId) return invalid('forbidden', ['target']);
    const keys = input.refs.map(r => `${r.fileRef}:${r.line}`);
    if (keys.some(k => !row.evidence.some(e => `${e.ref.fileRef}:${e.ref.line}` === k))) return invalid('not_in_investigation', ['refs']);
    const seen = handed.get(row.id) ?? new Set<string>();
    const fresh = keys.filter(k => !seen.has(k));
    fresh.forEach(k => seen.add(k)); handed.set(row.id, seen);
    return { data: { targetKind: 'round', targetId: input.target.roundId, handedOff: fresh.length, alreadyAttached: keys.length - fresh.length, byStatus: { match: fresh.length, hash_mismatch: 0, unresolved: 0 } }, version: row.version };
  } }),
  defineMockAction(investigationArchive, { version, handle: ({ input, actor }) => { const row = open(input.id, actor); row.status = 'archived'; return touch(row); } }),
];
