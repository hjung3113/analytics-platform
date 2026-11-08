import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { requireSafeRealDatabaseEnv } from './database-safety';
import { evidence, expect, mainHeading, migrateSql, test } from './support';

// A service token travels only in this spec's plain Node `fetch` (never the page, never a Playwright request: its API steps log request
// headers into the HTML report when a call fails). The file is still a credential spec.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

// 합성 fixture: the source, rule keys and requirement ids are made up; this is not evidence of an integration with the in-house Validator.
const SOURCE = '합성 fixture e2e validator';
const RULE_SET = 'e2e-core';
// Spec keys are the module/event code keys, normalized by log-knowledge; matching is exact, so the report must use this spelling.
const REQUIREMENT = 'ALPHA/START';
const UNCOVERED = 'ALPHA/STOP';
const TARGET_TEXT = "//Event[@id='start'] 형식 그대로";

type Rule = { ruleKey: string; title: string; summary: string; support: 'supported'; targets: { format: string; target: string; requirementIds?: string[] }[] };
const rule = (ruleKey: string, title: string, requirementIds?: string[]): Rule => ({
  ruleKey, title, summary: `합성 fixture · ${title}`, support: 'supported',
  targets: [{ format: 'e2e-xpath', target: TARGET_TEXT, ...(requirementIds ? { requirementIds } : {}) }],
});

/** This flow reloads the screen several times within seconds and hit the read rate limit (HTTP 429) intermittently; each load gets a fresh budget. */
const freshRateBudget = () => { migrateSql('delete from core.rate_limits'); };

test.describe('검증 규칙 통합: 토큰 보고에서 커버리지까지 (#1497 R-g)', () => {
  let csrf = '';
  let token = '';
  let origin = '';
  let reporterActorId = '';

  async function act(page: Page, action: string, input: Record<string, unknown>, expectedVersion?: string): Promise<{ data: Record<string, string>; version: string }> {
    const response = await page.request.post('/api/v1/menu-action', {
      headers: { 'x-csrf-token': csrf },
      data: { action: `logKnowledge.${action}`, context: {}, input, idempotencyKey: randomUUID(), ...(expectedVersion === undefined ? {} : { expectedVersion }) },
    });
    expect(response.ok(), action).toBe(true);
    const body = await response.json() as { outcome: string; data: Record<string, string>; version: string };
    expect(body.outcome, `${action}: ${JSON.stringify(body)}`).toBe('ok');
    return body;
  }

  /** Outside Playwright's instrumentation on purpose, with fixed diagnostics: a failed call must not report its bearer header. */
  async function report(revision: string, rules: Rule[], supersedes?: string): Promise<void> {
    let status = 0;
    let outcome = '';
    try {
      const response = await fetch(new URL('/api/v1/validation-catalog/report', origin), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ sourceSystem: SOURCE, validatorVersion: 'e2e-0', ruleSets: [{ ruleSetKey: RULE_SET, revision, status: 'active', ...(supersedes ? { supersedes } : {}), rules }] }),
        signal: AbortSignal.timeout(20_000),
      });
      status = response.status;
      outcome = (await response.json() as { outcome?: string }).outcome ?? '';
    } catch { status = -1; }
    if (status === -1) throw new Error('Catalog report request failed; credential diagnostics suppressed.');
    expect({ status, outcome }).toEqual({ status: 200, outcome: 'accepted' });
  }

  // Keyed by the Actor, which exists before issuance: a token whose response never arrived is revoked too.
  test.afterEach(async () => {
    token = '';
    if (!reporterActorId) return;
    const revoke = `update core.api_tokens set revoked_at = now() where actor_id = '${reporterActorId}' and revoked_at is null`;
    for (let attempt = 1; ; attempt += 1) {
      try {
        migrateSql(revoke);
        reporterActorId = '';
        return;
      } catch {
        if (attempt === 3) throw new Error(`Could not revoke the reporter tokens of Actor ${reporterActorId}; they expire within an hour.`);
        await new Promise(resolve => setTimeout(resolve, 1_000));
      }
    }
  });

  test('보고 → 목록·대상 범위 → 커버리지 → 요구사항 ID 없음 → 새 보고로 갱신', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const run = randomUUID().slice(0, 8);
    const workspace = requireSafeRealDatabaseEnv().workspaceId;
    origin = String(testInfo.project.use.baseURL);
    // Coverage reads every source's current report, so «요구사항 ID 없음» is only reachable when no other source reported.
    const otherSources = migrateSql(`select count(*) from log_rules.catalog_report where workspace_id = '${workspace}' and outcome = 'accepted' and superseded_at is null and source_system <> '${SOURCE}'`);
    expect(otherSources, 'this spec needs a throwaway database whose catalog has no other source').toBe('0');

    await page.goto('/log-dev/log-rules');
    const bootstrap = await page.request.get('/api/v1/platform/bootstrap');
    expect(bootstrap.ok()).toBe(true);
    csrf = (await bootstrap.json() as { csrfToken: string }).csrfToken;

    // A model with a published spec: its requirement keys are what the report declares.
    const vendor = await act(page, 'vendorCreate', { code: `E2E-V-${run}`, name: `합성 fixture 설비사 ${run}` });
    const model = await act(page, 'modelCreate', { vendorId: vendor.data.id, code: `E2E-M-${run}`, name: `합성 fixture 모델 ${run}`, processIds: [] });
    const modelId = model.data.id;
    const draft = await act(page, 'specDraftCreate', { modelId, sourceDocRef: { docLabel: '합성 fixture spec', docVersion: 'v1' } });
    const saved = await act(page, 'specDraftSave', { revisionId: draft.data.revisionId, mode: 'append', modules: [{ name: 'alpha' }], events: [{ module: 'alpha', name: 'start', fields: [] }, { module: 'alpha', name: 'stop', fields: [] }], relations: [] }, draft.version);
    await act(page, 'specPublish', { revisionId: draft.data.revisionId }, saved.version);

    // The reporter: a system Actor with the grant (no HTTP surface creates either) and a service token issued over HTTP.
    reporterActorId = migrateSql(`insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type) values ('${workspace}', 'e2e-reporter-${run}', 'e2e-reporter-${run}@local', '합성 fixture 보고자', 'user', 'system') returning id`).split('\n')[0];
    migrateSql(`insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ('${workspace}', '${reporterActorId}', 'validation.catalog.report', null, (select id from core.actors where workspace_id = '${workspace}' and external_id = 'mock-admin-1'))`);
    const issued = await page.request.post('/api/features/api-tokens/service', { headers: { 'x-csrf-token': csrf }, data: { name: `e2e reporter ${run}`, scopes: ['validation.catalog.report'], actorId: reporterActorId, expiresAt: new Date(Date.now() + 3_600_000).toISOString() } });
    expect(issued.status(), 'issue the reporter token').toBe(201);
    token = (await issued.json() as { token: string }).token;

    // 1. Report with requirement ids → the list shows it, with the declared target exactly as sent.
    const ruleKey = `e2e.start-${run}`;
    await report(`${run}-1`, [rule(ruleKey, `시작 이벤트 ${run}`, [REQUIREMENT, 'not/in-spec'])]);
    freshRateBudget();
    await page.goto('/log-dev/log-rules?tab=rules');
    await expect(mainHeading(page)).toHaveText('검증 규칙');
    await expect(page.getByText(`Validator ${SOURCE}`)).toBeVisible();
    await page.getByRole('button', { name: `${ruleKey} 상세 보기` }).click();
    const detail = page.getByRole('complementary', { name: '상세 패널' });
    await expect(detail.getByText(TARGET_TEXT, { exact: true })).toBeVisible();
    await expect(detail.getByText('e2e-xpath', { exact: true })).toBeVisible();
    await evidence(page, testInfo, 'rule-target-as-reported');

    // 2. Coverage: the declared requirement has a rule, the other one is 규칙 없음, and it is not a pass.
    const coverage = `/log-dev/log-rules?tab=coverage&modelId=${modelId}`;
    freshRateBudget();
    await page.goto(coverage);
    const requirements = page.getByRole('table', { name: '명세 요구사항' });
    await expect(requirements.getByRole('row').filter({ hasText: REQUIREMENT })).toContainText('규칙 있음');
    await expect(requirements.getByRole('row').filter({ hasText: UNCOVERED })).toContainText('규칙 없음');
    await expect(page.getByText(/통과가 아니라 구성 정보입니다/)).toBeVisible();
    await evidence(page, testInfo, 'coverage-computed');

    // 3. A report without requirement ids: «계산할 수 없음», never «규칙 없음» for everything.
    await report(`${run}-2`, [rule(ruleKey, `시작 이벤트 ${run}`)], `${run}-1`);
    freshRateBudget();
    await page.goto(coverage);
    await expect(page.getByText('계산할 수 없음', { exact: true })).toBeVisible();
    await expect(page.getByText('Validator가 요구사항 ID를 주지 않았습니다.')).toBeVisible();
    await expect(page.getByRole('table', { name: '명세 요구사항' })).toHaveCount(0);
    await evidence(page, testInfo, 'coverage-not-computable');

    // 4. A new report refreshes both: the stop requirement now has a rule and the new rule is listed.
    const stopKey = `e2e.stop-${run}`;
    await report(`${run}-3`, [rule(ruleKey, `시작 이벤트 ${run}`, [REQUIREMENT]), rule(stopKey, `정지 이벤트 ${run}`, [UNCOVERED])], `${run}-2`);
    freshRateBudget();
    await page.goto(coverage);
    const refreshed = page.getByRole('table', { name: '명세 요구사항' });
    await expect(refreshed.getByRole('row').filter({ hasText: UNCOVERED })).toContainText('규칙 있음');
    freshRateBudget();
    await page.goto('/log-dev/log-rules?tab=rules');
    await expect(page.getByRole('button', { name: `${stopKey} 상세 보기` })).toBeVisible();
    await evidence(page, testInfo, 'rules-refreshed');
  });
});
