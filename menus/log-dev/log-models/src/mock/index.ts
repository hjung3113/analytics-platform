import { type ColumnFilter, type FieldError, type PageSort } from '@ap/contracts';
import { defineMockAction, defineMockEndpoint, MockActionInvalid, type AnyMockAction, type AnyMockEndpoint } from '@ap/mock-server';
import { actions, endpoints, isUuid, type Project, type RoundDetail } from '../endpoints';
import { ATTEMPT_ID, events, models, projects, requests, rounds, rules } from './fixtures';
import { readHierarchy, validateHierarchy } from './hierarchy';
export { PROJECT_ID, ROUND_ID, REQUEST_ID, ATTEMPT_ID, fixtureId, resetLifecycle, stageLifecycleFixture } from './fixtures';

type Params = Record<string, unknown>;
function page<T>(rows: T[], params: Params) { const start = Number(params.page ?? 0) * Number(params.pageSize ?? 25); return { rows: rows.slice(start, start + Number(params.pageSize ?? 25)), total: rows.length }; }
const findProject = (id: unknown) => projects.find(p => p.id === id);
const roundOf = (id: unknown) => rounds.find(r => r.id === id);
const requestOf = (id: unknown) => requests.find(r => r.id === id);
function refreshProject(p: Project, actor = 'synthetic') {
  p.version = String(Number(p.version) + 1);
  p.nextStages = p.stage === 'registered' ? ['kickoff', 'cancelled'] : p.stage === 'kickoff' ? ['alpha', 'cancelled'] : p.stage === 'alpha' ? ['beta', 'cancelled'] : p.stage === 'beta' ? ['cancelled'] : [];
  p.gateTarget = p.stage === 'registered' ? 'kickoff' : p.stage === 'kickoff' ? 'alpha' : p.stage === 'alpha' ? 'beta' : p.stage === 'beta' ? 'completed' : null;
  p.reopenTo = p.stage === 'cancelled' ? 'alpha' : p.stage === 'completed' ? 'beta' : null;
  const m = models.find(m => m.id === p.modelId); if (m) { m.project = p.nextStages.length ? { projectId: p.id, stage: p.stage, latestRound: p.openRound ? { ...p.openRound, status: 'open' } : null } : null; m.updatedAt = new Date().toISOString(); }
  events.push({ id: crypto.randomUUID(), projectId: p.id, kind: 'stage_changed', actor: { id: actor, displayName: actor }, at: new Date().toISOString(), before: null, after: { stage: p.stage }, reason: null });
}
const field = (path: string, code: string): FieldError => ({ path: path.split('.'), code });
function availability(r: RoundDetail, actor: string) {
  const p = findProject(r.projectId);
  const newest = rounds.filter(x => x.projectId === r.projectId).sort((a,b) => b.seq - a.seq)[0];
  const reasons = [...(actor === 'admin' ? [] : ['permission_denied']), ...(!p?.gateTarget ? ['project_not_open'] : []), ...(newest?.id === r.id ? [] : ['round_not_current']), ...(p?.stage === r.stage ? [] : ['round_stage_mismatch'])];
  const verdict = requests.filter(q => q.roundId === r.id).flatMap(q => q.attempts).filter(a => a.outcome === 'succeeded').sort((a,b) => a.endedAt!.localeCompare(b.endedAt!)).at(-1)?.verdict;
  return { targetStage: p?.gateTarget ?? null, projectVersion: p?.version ?? '', reasons, decisions: { approved: { allowed: reasons.length === 0 && verdict === 'pass', reasons: [...reasons, ...(verdict === 'pass' ? [] : ['verdict_not_pass'])] }, rejected: { allowed: reasons.length === 0, reasons }, exception: { allowed: reasons.length === 0 && verdict !== 'pass', reasons: [...reasons, ...(verdict === 'pass' ? ['exception_not_needed'] : [])] } }, basis: { decisiveVerdict: verdict ?? null, specPin: r.specPin, sampleManifestDigest: r.sampleManifestDigest } };
}
function read(name: string, p: Params, actor: string): unknown {
  if (name === 'hierarchy') return readHierarchy(p, actor);
  if (name === 'queueStatus') return { runWindow: { timezone: 'Asia/Seoul', weekday: { fromHour: 22, toHour: 6 }, weekendAllDay: true }, immediateLimit: 5, serverAt: '2026-11-07T00:30:00Z', withinWindow: true };
  if (name === 'models') {
    let rows = models.map(m => p.includeClosedProjects || !m.project || !['completed','cancelled'].includes(m.project.stage) ? m : { ...m, project: null }).filter(m => !p.q || `${m.code} ${m.name}`.toLowerCase().includes(String(p.q).toLowerCase()));
    for (const f of (p.filters ?? []) as ColumnFilter[]) {
      if (f.id === 'stage') rows = rows.filter(m => f.op === 'isEmpty' ? m.project === null : f.op === 'in' && f.value.includes(m.project?.stage ?? ''));
      if (f.id === 'validation' && f.op === 'in') rows = rows.filter(m => f.value.includes(m.validation));
      if (f.id === 'vendorId' && f.op === 'in') rows = rows.filter(m => f.value.includes(m.vendorId));
      if (f.id === 'id' && f.op === 'in') rows = rows.filter(m => f.value.includes(m.id));
      if (f.id === 'processes' && f.op === 'isEmpty') rows = rows.filter(m => m.processes.length === 0);
      if (f.id === 'processes' && f.op === 'in') rows = rows.filter(m => m.processes.some(x => f.value.includes(x.id)));
    }
    return page(rows, p);
  }
  if (name === 'projectDetail') return findProject(p.projectId) ?? null;
  if (name === 'rounds') return { rows: rounds.filter(r => r.projectId === p.projectId).sort((a,b) => b.seq - a.seq).map(r => ({ ...r, sampleCount: r.sampleSet.files.length, validation: requests.find(q => q.roundId === r.id)?.latestVerdict ?? 'none', gateDecision: r.gateDecisions.at(-1)?.decision ?? null })) };
  if (name === 'projectEvents') return page(events.filter(e => e.projectId === p.projectId).reverse(), p);
  if (name === 'roundDetail') { const r = roundOf(p.roundId); return r ? { ...r, gateAvailability: availability(r, actor) } : null; }
  if (name === 'roundEvidence') return roundOf(p.roundId) ? { rows: [] } : null;
  if (name === 'requests') return page(requests.filter(r => (!p.roundId || r.roundId === p.roundId) && (!p.states || (p.states as string[]).includes(r.state)) && (p.priority === undefined || p.priority === r.priority) && (!p.modelId || p.modelId === r.modelId)).map(({ attempts: _attempts, cancelReason: _cancelReason, ...row }) => row), p);
  if (name === 'requestDetail') return requestOf(p.requestId) ?? null;
  if (name === 'ruleResults') {
    if (p.attemptId !== ATTEMPT_ID) return { rows: [], total: 0 };
    const selected = rules.filter(r => (!p.results || (p.results as string[]).includes(r.result)) && (p.required === undefined || p.required === r.required));
    const sort = (p.sorting as PageSort[] | undefined)?.[0];
    if (sort) selected.sort((a,b) => String(a[sort.id as 'ruleId']).localeCompare(String(b[sort.id as 'ruleId'])) * (sort.desc ? -1 : 1));
    return page(selected, p);
  }
  if (name === 'excerpt') return p.ruleResultId === rules[1]?.id ? { deleted: true, excerpt: null } : { deleted: false, excerpt: 'SYNTHETIC FIXTURE · 이벤트 형식 해석 실패' };
  return null;
}
export const logLifecycleMock: readonly AnyMockEndpoint[] = Object.entries(endpoints).map(([name, spec]) => defineMockEndpoint(spec, { mart: false, validate: ({ params }) => {
  if (name === 'hierarchy') return validateHierarchy(params);
  const idKey = { projectDetail: 'projectId', projectEvents: 'projectId', rounds: 'projectId', roundDetail: 'roundId', roundEvidence: 'roundId', requestDetail: 'requestId', ruleResults: 'attemptId', excerpt: 'ruleResultId' }[name];
  return idKey && (typeof params[idKey] !== 'string' || !isUuid(params[idKey] as string)) ? `${idKey} must be UUID` : null;
}, handle: ({ params, actor }) => read(name, params, actor) }));
export const logLifecycleActionsMock: readonly AnyMockAction[] = Object.entries(actions).map(([name, spec]) => defineMockAction(spec, {
  version: ({ input }) => name === 'gateDecide' ? findProject(roundOf(input.roundId)?.projectId)?.version ?? null : name === 'requestCancel' ? requestOf(input.id)?.version ?? null : name === 'roundClose' ? roundOf(input.id)?.version ?? null : findProject(input.id)?.version ?? null,
  validate: input => ['projectSetStage', 'projectReopen', 'requestCancel', 'gateDecide'].includes(name) && !String(input.reason ?? '').trim() ? [field('reason', 'required')] : [],
  handle: ({ input, actor }) => {
    if (name === 'projectCreate') {
      const model = models.find(m => m.id === input.modelId); if (!model || (model.project && !['completed','cancelled'].includes(model.project.stage))) throw new MockActionInvalid([field('modelId', model ? 'open_project_exists' : 'not_found')]);
      const p: Project = { ...structuredClone(projects[0]!), id: crypto.randomUUID(), modelId: model.id, model: { code: model.code, name: model.name, vendorName: model.vendorName }, softwareId: typeof input.softwareId === 'string' ? input.softwareId : null, stage: 'registered', owner: { id: String(input.ownerActorId), displayName: actor }, targetDate: typeof input.targetDate === 'string' ? input.targetDate : null, openRound: null, version: '0', gate: { latest: null } };
      projects.push(p); refreshProject(p, actor); return { data: { projectId: p.id, version: p.version }, version: p.version };
    }
    if (name === 'roundOpen') {
      const p = findProject(input.projectId); if (!p || p.openRound) throw new MockActionInvalid([field('projectId', 'open_round_exists')]);
      const r: RoundDetail = { ...structuredClone(rounds[0]!), id: crypto.randomUUID(), projectId: p.id, seq: Math.max(0, ...rounds.filter(r => r.projectId === p.id).map(r => r.seq)) + 1, stage: p.stage, status: 'open', gateDecisions: [], sampleSet: input.sampleSet as RoundDetail['sampleSet'], note: String(input.note ?? ''), createdAt: new Date().toISOString() };
      rounds.push(r); p.openRound = { id: r.id, seq: r.seq }; return { data: { roundId: r.id, version: r.version }, version: r.version };
    }
    if (name === 'requestCreate') {
      const r = roundOf(input.roundId), p = findProject(r?.projectId); if (!r || !p || r.status !== 'open') throw new MockActionInvalid([field('roundId', 'round_closed')]);
      const q = { ...structuredClone(requests[0]!), id: crypto.randomUUID(), roundId: r.id, roundSeq: r.seq, projectId: p.id, modelId: p.modelId, modelCode: p.model?.code ?? '', priority: Number(input.priority), immediate: input.immediate === true, state: 'queued', attempts: [], attemptCount: 0, latestVerdict: null, lastHeartbeatAt: null, requestedBy: { id: actor, displayName: actor }, version: '1', createdAt: new Date().toISOString(), endedAt: null };
      requests.unshift(q); const model = models.find(m => m.id === p.modelId); if (model) { model.pendingRequests++; model.validation = 'queued'; } return { data: { requestId: q.id, version: q.version }, version: q.version };
    }
    if (name === 'requestCancel') {
      const q = requestOf(input.id); if (!q || !['queued', 'claimed'].includes(q.state)) throw new MockActionInvalid([field('id', 'illegal_transition')]);
      q.state = 'cancelled'; q.cancelReason = String(input.reason); q.version = String(Number(q.version) + 1); const model = models.find(m => m.id === q.modelId); if (model) model.pendingRequests = Math.max(0, model.pendingRequests - 1); return { data: { requestId: q.id }, version: q.version };
    }
    if (name === 'roundClose') { const r = roundOf(input.id); if (!r) throw new MockActionInvalid([field('id', 'not_found')]); r.status = 'closed'; r.version = String(Number(r.version) + 1); const p = findProject(r.projectId); if (p) p.openRound = null; return { data: { roundId: r.id }, version: r.version }; }
    if (name === 'gateDecide') {
      const r = roundOf(input.roundId), p = findProject(r?.projectId); if (!r || !p) throw new MockActionInvalid([field('roundId', 'not_found')]);
      const d = String(input.decision) as 'approved' | 'rejected' | 'exception'; const available = availability(r, actor); if (!available.decisions[d]?.allowed) throw new MockActionInvalid([field('decision', available.decisions[d]?.reasons[0] ?? 'malformed')]);
      if (d === 'exception' && (!input.exception || !String((input.exception as { scope?: string }).scope ?? '').trim())) throw new MockActionInvalid([field('exception.scope', 'required')]);
      const entry = { id: crypto.randomUUID(), decision: d, targetStage: String(input.targetStage), reason: String(input.reason), selfApproved: true, decidedBy: { id: actor, displayName: actor }, at: new Date().toISOString(), exception: (input.exception ?? null) as RoundDetail['gateDecisions'][number]['exception'], basis: available.basis, basisSummary: { attemptCount: 1, decisiveVerdict: 'incomplete', evidenceLinkCount: 0 } };
      r.gateDecisions.push(entry); p.gate.latest = entry; if (d !== 'rejected') p.stage = String(input.targetStage); refreshProject(p, actor); const model = models.find(m => m.id === p.modelId); if (model) model.gateDecision = d; return { data: { gateDecisionId: entry.id, stage: p.stage }, version: p.version };
    }
    const p = findProject(input.id); if (!p) throw new MockActionInvalid([field('id', 'not_found')]);
    if (name === 'projectUpdate') { if (input.ownerActorId) p.owner = { id: String(input.ownerActorId), displayName: String(input.ownerActorId) }; if ('softwareId' in input) p.softwareId = input.softwareId as string | null; if ('targetDate' in input) p.targetDate = input.targetDate as string | null; }
    if (name === 'projectSetStage') { if (!p.nextStages.includes(String(input.toStage))) throw new MockActionInvalid([field('toStage', 'illegal_transition')]); p.stage = String(input.toStage); }
    if (name === 'projectReopen') p.stage = p.reopenTo ?? p.stage;
    refreshProject(p, actor); return { data: { projectId: p.id, version: p.version }, version: p.version };
  },
}));
/** The generator-wired name of the endpoint mocks (tooling/gen-menu spreads `<group>Mock`). */
export const logModelsMock = logLifecycleMock;
