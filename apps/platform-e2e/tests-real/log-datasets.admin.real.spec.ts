import type { Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { requireSafeRealDatabaseEnv } from './database-safety';
import { evidence, expect, mainHeading, migrateSql, test } from './support';

// The reference worker's service token travels only in this spec's plain Node `fetch` (never the page, never a Playwright request: its API
// steps log request headers into the HTML report when a call fails). The file is still a credential spec.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

// 합성 fixture: owner, file names and rule ids are made up; there is no Source port in this assembly, so availability stays `unverified`.
const sha = (name: string) => createHash('sha256').update(name).digest('hex');
const RULES = { same: 'E2E-SAME', regress: 'E2E-REGRESS', fixed: 'E2E-FIXED', gone: 'E2E-GONE' } as const;

/** This flow makes more than ten writes in a minute (the mutation tier); each phase gets a fresh budget. */
const freshRateBudget = () => { migrateSql('delete from core.rate_limits'); };

type Out = { outcome: string; data: Record<string, unknown> | null; version?: string };

test.describe('테스트 데이터셋 통합: 합성 Dataset에서 비교까지 (#1482 D-f)', () => {
  let csrf = '';
  let workerToken = '';
  let origin = '';
  let workerActorId = '';
  // The run window the queue had before this spec opened it (restored in afterEach, also when the test fails).
  let originalWindow: unknown;

  async function act(page: Page, action: string, input: Record<string, unknown>, expectedVersion?: string): Promise<{ data: Record<string, string>; version: string }> {
    freshRateBudget();
    const response = await page.request.post('/api/v1/menu-action', {
      headers: { 'x-csrf-token': csrf },
      data: { action: `logDataset.${action}`, context: {}, input, idempotencyKey: randomUUID(), ...(expectedVersion === undefined ? {} : { expectedVersion }) },
    });
    expect(response.ok(), action).toBe(true);
    const body = await response.json() as { outcome: string; data: Record<string, string>; version: string };
    expect(body.outcome, `${action}: ${JSON.stringify(body)}`).toBe('ok');
    return { data: body.data, version: body.version ?? body.data.version ?? '' };
  }

  async function read(page: Page, endpoint: string, params: Record<string, unknown>): Promise<Out> {
    freshRateBudget();
    const response = await page.request.post('/api/v1/menu-query', { headers: { 'x-csrf-token': csrf }, data: { endpoint: `logDataset.${endpoint}`, context: {}, params } });
    expect(response.ok(), endpoint).toBe(true);
    return await response.json() as Out;
  }

  /** The reference worker: a test-local client of the queue REST, outside Playwright's instrumentation, with fixed diagnostics. */
  async function queue(path: string, payload: Record<string, unknown>): Promise<{ status: number; body: Record<string, any> }> {
    let status = -1;
    let body: Record<string, any> = {};
    try {
      const response = await fetch(new URL(`/api/v1/validation-queue${path}`, origin), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${workerToken}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
      status = response.status;
      body = await response.json() as Record<string, any>;
    } catch { status = -1; }
    if (status === -1) throw new Error('Queue request failed; credential diagnostics suppressed.');
    return { status, body };
  }

  async function lifecycle(page: Page, kind: 'menu-query' | 'menu-action', body: Record<string, unknown>): Promise<Out> {
    freshRateBudget();
    const response = await page.request.post(`/api/v1/${kind}`, { headers: { 'x-csrf-token': csrf }, data: body });
    expect(response.ok(), JSON.stringify(body)).toBe(true);
    return await response.json() as Out;
  }

  // The window is restored before the token cleanup so that a failed test never leaves the shared queue open all day.
  test.afterEach(async ({ page }) => {
    if (originalWindow !== undefined) {
      const restore = originalWindow;
      originalWindow = undefined;
      const restored = await lifecycle(page, 'menu-action', { action: 'logLifecycle.queueSettingsUpdate', context: {}, input: { runWindow: restore }, idempotencyKey: randomUUID() });
      expect(restored.outcome, 'restore the run window').toBe('ok');
    }
  });

  // Keyed by the Actor, which exists before issuance: a token whose response never arrived is revoked too.
  test.afterEach(async () => {
    workerToken = '';
    if (!workerActorId) return;
    const revoke = `update core.api_tokens set revoked_at = now() where actor_id = '${workerActorId}' and revoked_at is null`;
    for (let attempt = 1; ; attempt += 1) {
      try {
        migrateSql(revoke);
        workerActorId = '';
        return;
      } catch {
        if (attempt === 3) throw new Error(`Could not revoke the worker tokens of Actor ${workerActorId}; they expire within an hour.`);
        await new Promise(resolve => setTimeout(resolve, 1_000));
      }
    }
  });

  test('Dataset → Baseline 승인 → Suite 실행 요청 → 참조 작업자 결과 → 비교와 화면', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const run = randomUUID().slice(0, 8);
    const workspace = requireSafeRealDatabaseEnv().workspaceId;
    origin = String(testInfo.project.use.baseURL);

    await page.goto('/log-dev/log-datasets');
    const bootstrap = await page.request.get('/api/v1/platform/bootstrap');
    expect(bootstrap.ok()).toBe(true);
    csrf = (await bootstrap.json() as { csrfToken: string }).csrfToken;

    // Approval is session-only and has no Admin bypass: the real Admin session needs the grant (the baseline approver); no HTTP surface grants it.
    const admin = `(select id from core.actors where workspace_id = '${workspace}' and external_id = 'mock-admin-1')`;
    migrateSql(`insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) select '${workspace}', ${admin}, 'dataset.baseline.approve', null, ${admin} where not exists (select 1 from permission.permission_grants where workspace_id = '${workspace}' and actor_id = ${admin} and capability = 'dataset.baseline.approve' and managed_system_id is null)`);

    // 1. Synthetic Dataset + Revision (the file list is the identity; hashes are made up).
    const dataset = await act(page, 'datasetCreate', { name: `합성 fixture Dataset ${run}`, shareScope: 'workspace' });
    const datasetId = dataset.data.datasetId;
    const files = ['a.log', 'b.log'].map((name, i) => ({ fileRef: `s3://e2e-${run}/${name}`, order: i + 1, sha256: sha(`${run}${name}`) }));
    const revision = await act(page, 'revisionCreate', { datasetId, sampleSet: { sourceOwner: `e2e-fab-${run}`, files } });
    const revisionId = revision.data.revisionId;

    // 2. Baseline draft → approve with the session (self-approval is allowed and recorded).
    const draft = await act(page, 'baselineDraftCreate', { datasetRevisionId: revisionId });
    const saved = await act(page, 'baselineUpdateDraft', {
      id: draft.data.baselineId,
      expectedScope: Object.values(RULES),
      expectations: [[RULES.same, 'PASS'], [RULES.regress, 'PASS'], [RULES.fixed, 'FAIL'], [RULES.gone, 'PASS']].map(([ruleId, expected]) => ({ ruleId, expected })),
    }, draft.version);
    await act(page, 'baselineApprove', { id: draft.data.baselineId, reason: '합성 fixture 승인' }, saved.version);

    // 3. Suite → run request, twice with one idempotency key: one run (double click).
    const suite = await act(page, 'suiteCreate', { name: `합성 fixture Suite ${run}`, items: [{ datasetId }] });
    freshRateBudget();
    const key = randomUUID();
    const request = (k: string) => page.request.post('/api/v1/menu-action', { headers: { 'x-csrf-token': csrf }, data: { action: 'logDataset.suiteRun', context: {}, input: { suiteId: suite.data.suiteId, idempotencyKey: k }, idempotencyKey: k } });
    const first = await (await request(key)).json() as Out;
    expect(first.outcome, JSON.stringify(first)).toBe('ok');
    const again = await (await request(key)).json() as Out;
    expect(again.data?.suiteRunId).toBe(first.data?.suiteRunId);
    const suiteRunId = String(first.data?.suiteRunId);
    expect(migrateSql(`select count(*) from log_datasets.suite_run where suite_id = '${suite.data.suiteId}'`)).toBe('1');

    // Before any result: nothing is classified, and the Source is unverified, never available.
    const detail = await read(page, 'datasetDetail', { datasetId });
    expect((detail.data as { revisions: { availability: string }[] }).revisions[0].availability).toBe('unverified');

    // 4. Reference worker: a system Actor holding only the token-only scope `validation.worker`, issued over HTTP.
    const runId = randomUUID().slice(0, 8);
    workerActorId = migrateSql(`insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type) values ('${workspace}', 'e2e-datasets-worker-${runId}', 'e2e-datasets-worker-${runId}@local', '합성 fixture 참조 작업자', 'user', 'system') returning id`).split('\n')[0];
    const issued = await page.request.post('/api/features/api-tokens/service', { headers: { 'x-csrf-token': csrf }, data: { name: `e2e datasets worker ${runId}`, scopes: ['validation.worker'], actorId: workerActorId, expiresAt: new Date(Date.now() + 3_600_000).toISOString() } });
    expect(issued.status(), 'issue the worker token').toBe(201);
    workerToken = (await issued.json() as { token: string }).token;

    // A suite request is not immediate: the worker only claims it inside the run window, which depends on the wall clock.
    // Read the window, open it all day through the Admin action, and let afterEach put the original back.
    const status = await lifecycle(page, 'menu-query', { endpoint: 'logLifecycle.queueStatus', context: {}, params: {} });
    expect(status.outcome, JSON.stringify(status)).toBe('ok');
    originalWindow = (status.data as { runWindow: { timezone: string } }).runWindow;
    const opened = await lifecycle(page, 'menu-action', { action: 'logLifecycle.queueSettingsUpdate', context: {}, input: { runWindow: { timezone: 'Asia/Seoul', weekday: { fromHour: 0, toHour: 24 }, weekendAllDay: true } }, idempotencyKey: randomUUID() });
    expect(opened.outcome, JSON.stringify(opened)).toBe('ok');
    const open = await lifecycle(page, 'menu-query', { endpoint: 'logLifecycle.queueStatus', context: {}, params: {} });
    expect((open.data as { withinWindow: boolean }).withinWindow).toBe(true);

    // The throwaway database holds only this run's request; claim until it is the one (other leftover queued requests would be claimed first).
    const claimed = await queue('/claim', {});
    expect(claimed.status, 'claim').toBe(200);
    const requestId = String(claimed.body.request.id);
    expect(requestId).toBe(String((first.data as { items: { requestId: string }[] }).items[0].requestId));
    const attemptNo = Number(claimed.body.attempt.attemptNo);
    expect((await queue(`/requests/${requestId}/heartbeat`, { attemptNo })).status, 'heartbeat').toBe(200);
    const result = (ruleId: string, outcome: string) => ({ ruleId, result: outcome, required: true });
    const body = { attemptNo, inputManifestDigest: claimed.body.request.sampleManifestDigest, results: [result(RULES.same, 'PASS'), result(RULES.regress, 'FAIL'), result(RULES.fixed, 'PASS'), result(RULES.gone, 'NOT_CHECKED')] };
    const posted = await queue(`/requests/${requestId}/result`, body);
    expect(posted.status, JSON.stringify(posted.body)).toBe(200);
    // A replay of the same result is the same answer; a late result of a finished attempt changes nothing.
    const replay = await queue(`/requests/${requestId}/result`, body);
    expect(replay).toEqual(posted);

    // 5. The comparison: regressed / fixed / unchanged, and a rule the engine did not check is not_comparable, never PASS.
    const compared = await read(page, 'comparison', { suiteRunId });
    const comparedData = compared.data as { rules: { rows: { ruleId: string; classification: string }[] }; items: { coverage: Record<string, any> }[] };
    const rows = comparedData.rules.rows;
    expect(Object.fromEntries(rows.map(r => [r.ruleId, r.classification]))).toEqual({
      [RULES.same]: 'unchanged', [RULES.regress]: 'regressed', [RULES.fixed]: 'fixed', [RULES.gone]: 'not_comparable',
    });

    // Coverage: four scoped required rules, three executed, the NOT_CHECKED one is a required gap and not executed.
    expect(comparedData.items[0]?.coverage).toMatchObject({ scopeCount: 4, executedCount: 3, notExecutedCount: 1, requiredGapCount: 1, ratio: 0.75 });
    expect(JSON.stringify(comparedData.items[0]?.coverage)).toContain(RULES.gone);

    // 6. The same classification in the real assembly's comparison screen, and the Source is shown as not confirmed.
    freshRateBudget();
    await page.goto(`/log-dev/log-dataset-run/${datasetId}/${suiteRunId}`);
    const coverage = page.getByRole('region', { name: '실행 커버리지', exact: true });
    await expect(coverage).toBeVisible();
    await expect(coverage).toContainText('실행 3');
    await expect(coverage).toContainText('미검사 1');
    await expect(coverage).toContainText('필수 미검사 1');
    await expect(coverage).toContainText(RULES.gone);
    const table = page.getByRole('table', { name: 'Baseline 대비 규칙 결과' });
    for (const [ruleId, classification] of [[RULES.same, 'unchanged'], [RULES.regress, 'regressed'], [RULES.fixed, 'fixed'], [RULES.gone, 'not_comparable']]) {
      await expect(table.getByRole('row').filter({ hasText: ruleId })).toContainText(classification);
    }
    await expect(page.getByText('원본 확인 불가').first()).toBeVisible();
    await expect(page.getByText('원본 확인됨')).toHaveCount(0);
    await evidence(page, testInfo, 'comparison-from-reference-worker');

    freshRateBudget();
    await page.goto(`/log-dev/log-dataset/${datasetId}`);
    await expect(mainHeading(page)).toContainText(`합성 fixture Dataset ${run}`);
    await expect(page.getByText('원본 확인 불가').first()).toBeVisible();
    await expect(page.getByText('원본 확인됨')).toHaveCount(0);
    await evidence(page, testInfo, 'dataset-source-unverified');
  });
});
