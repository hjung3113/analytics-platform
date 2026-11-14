/** Menu-owned repeatable conformance inputs (#2010); never imported by production screens. */
import { stageLifecycleFixture } from './fixtures';
import { stageValidationIssue } from './issues';
// #1447 lifecycle actions are stateful; stage fresh mock-only targets for each conformance request.
const lifecycleSamples: Record<string, () => Record<string, unknown>> = {
  projectCreate: () => ({ modelId: stageLifecycleFixture({ withoutProject: true }).modelId, kind: 'new', ownerActorId: 'admin' }),
  projectSetStage: () => ({ id: stageLifecycleFixture().projectId, toStage: 'beta', reason: '적합성 단계 이동' }),
  projectReopen: () => ({ id: stageLifecycleFixture({ cancelled: true }).projectId, reason: '적합성 재개' }),
  projectUpdate: () => ({ id: stageLifecycleFixture().projectId, targetDate: '2026-12-01' }),
  roundOpen: () => ({ projectId: stageLifecycleFixture({ noOpenRound: true }).projectId, sampleSet: { sourceOwner: 'synthetic', files: [{ fileRef: 's3://synthetic/conformance.log', order: 1, sha256: 'a'.repeat(64) }] } }),
  roundClose: () => ({ id: stageLifecycleFixture().roundId }),
  requestCreate: () => ({ roundId: stageLifecycleFixture().roundId, priority: 1, immediate: false }),
  requestCancel: () => ({ id: stageLifecycleFixture().requestId, reason: '적합성 취소' }),
  gateDecide: () => ({ roundId: stageLifecycleFixture().roundId, targetStage: 'beta', decision: 'rejected', reason: '적합성 검토' }),
  // #1808 human validation records: each request gets a fresh Round and issue.
  validationIssueRegister: () => { const t = stageLifecycleFixture(); return { projectId: t.projectId, firstRoundId: t.roundId, title: '적합성 항목', body: '적합성 설명' }; },
  validationIssueComment: () => ({ issueId: stageValidationIssue(stageLifecycleFixture()).issueId, body: '적합성 댓글' }),
  validationIssueCorrect: () => ({ issueId: stageValidationIssue(stageLifecycleFixture()).issueId, field: 'body', body: '적합성 정정' }),
  validationIssueLinkOccurrence: () => { const t = stageLifecycleFixture(); return { issueId: stageValidationIssue(t).issueId, roundId: t.roundId }; },
  validationIssueLinkEvidence: () => ({ occurrenceId: stageValidationIssue(stageLifecycleFixture()).occurrenceId, refs: [{ fileRef: 's3://synthetic/sample-01.log', line: 1, fileSha256: 'a'.repeat(64) }] }),
  roundDiscussionComment: () => ({ roundId: stageLifecycleFixture().roundId, body: '적합성 Round 의견' }),
};

export const logModelsWriteSamples: Readonly<Record<string, () => Record<string, unknown>>> = Object.fromEntries(
  Object.entries({ ...lifecycleSamples }).map(([name, sample]) => [`logLifecycle.${name}`, sample]),
);
