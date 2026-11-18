import { expect, test } from '@playwright/test';
import { evidence, signInAs } from './support';

const PROJECT = '14470000-0000-4000-8000-000000000101';
const ROUND = '14470000-0000-4000-8000-000000000201';
const REQUEST = '14470000-0000-4000-8000-000000000301';
const ATTEMPT = '14470000-0000-4000-8000-000000000401';
const modelNode = 'v/14470000-0000-4000-8000-000000000011/p/14470000-0000-4000-8000-000000000021/m/14470000-0000-4000-8000-000000000001';
const roundPath = `/log-dev/log-model-round/${PROJECT}/${ROUND}`;

test.describe('log-lifecycle screens (06 §6·§12·§17·§22)', () => {
  test('sidebar hierarchy expands vendor, process and model and opens its registered project target', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/log-dev/log-models');
    const hierarchy = page.getByRole('group', { name: '모델 계층' });
    await hierarchy.getByRole('button', { name: '한빛설비 펼치기' }).click();
    await hierarchy.getByRole('button', { name: '식각 펼치기', exact: true }).click();
    await hierarchy.getByRole('button', { name: '식각 모델 펼치기' }).click();
    await expect(hierarchy.getByRole('link', { name: '3.2.1', exact: true })).toBeVisible();
    await hierarchy.getByRole('link', { name: '식각 모델', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/log-dev/log-model-project/${PROJECT}`));
    await expect(hierarchy.getByRole('treeitem', { name: '식각 모델', exact: true })).toHaveAttribute('aria-current', 'location');
    expect(new URL(page.url()).searchParams.get('node')).toBe(modelNode);
    await page.reload();
    await expect(hierarchy.getByRole('treeitem', { name: '식각 모델', exact: true })).toHaveAttribute('aria-current', 'location');
    await page.getByRole('button', { name: 'Round 3', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(roundPath));
    expect(new URL(page.url()).searchParams.get('node')).toBe(modelNode);
    await expect(hierarchy.getByRole('treeitem', { name: '식각 모델', exact: true })).toHaveAttribute('aria-current', 'location');
    await evidence(page, testInfo, 'model-hierarchy-project');
  });

  test('fresh filter deep link restores the current process and vendor ancestor', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/log-dev/log-models?vendorId=14470000-0000-4000-8000-000000000011&processId=14470000-0000-4000-8000-000000000021');
    const hierarchy = page.getByRole('group', { name: '모델 계층' });
    await expect(hierarchy.getByRole('treeitem', { name: '식각', exact: true })).toHaveAttribute('aria-current', 'location');
    await expect(hierarchy.getByRole('treeitem', { name: '한빛설비', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await evidence(page, testInfo, 'model-hierarchy-filter-restored');
  });

  test('fresh project SW deep link restores the exact selected node', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    const node = `${modelNode}/s/14470000-0000-4000-8000-000000000031`;
    await page.goto(`/log-dev/log-model-project/${PROJECT}?node=${encodeURIComponent(node)}`);
    const hierarchy = page.getByRole('group', { name: '모델 계층' });
    await expect(hierarchy.getByRole('treeitem', { name: '3.2.1', exact: true })).toHaveAttribute('aria-current', 'location');
    await expect(hierarchy.getByRole('treeitem', { name: '식각 모델', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('log-model-project').getByText('3.2.1', { exact: true })).toBeVisible();
    await evidence(page, testInfo, 'model-hierarchy-sw-restored');
  });

  test('model table opens its stable development project and Round; the Gate form opens in the right detail slot at both desktop widths', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/log-dev/log-models');
    await expect(page.getByRole('table', { name: '모델 목록' })).toBeVisible();
    await page.getByRole('button', { name: 'ETCH-300', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/log-dev/log-model-project/${PROJECT}`));
    await page.getByRole('button', { name: 'Round 3', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(roundPath));
    await expect(page.getByRole('table', { name: '규칙 결과', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Gate 결정', exact: true }).click();
    const gate = page.getByRole('dialog', { name: 'Gate 결정' });
    for (const width of [1440, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const rulesBox = await page.getByRole('table', { name: '규칙 결과', exact: true }).boundingBox();
      const gateBox = await gate.boundingBox();
      expect(rulesBox).not.toBeNull(); expect(gateBox).not.toBeNull();
      expect(gateBox!.x).toBeGreaterThan(rulesBox!.x);
      expect(gateBox!.x + gateBox!.width).toBeLessThanOrEqual(width);
      await evidence(page, testInfo, `round-gate-${width}`);
    }
  });

  test('Round «원본/시퀀스» tab (#1475): same body as 로그 탐색, read-only, opened from a rule result line', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(roundPath);
    await expect(page.getByRole('table', { name: '규칙 결과', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gate 결정', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /상세 열기$/ }).first().click();
    await page.getByRole('button', { name: '원본에서 보기' }).first().click();
    await expect(page).toHaveURL(/view=source/);
    await expect(page).toHaveURL(/sourceFocus=1%3A18\d\b/);
    await expect(page.getByRole('table', { name: '원본 이벤트 목록' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '레코드 상세', exact: true })).toBeVisible();
    // The selected line's own text comes from the Source read for this Round's file (not only the drawer frame).
    const line = new URL(page.url()).searchParams.get('sourceFocus')!.split(':')[1]!;
    await expect(page.getByRole('heading', { name: '원문 줄', exact: true }).locator('xpath=..')).toContainText(new RegExp(`${line} Module \\d (Start|End) Job-\\d`));
    await expect(page.getByRole('button', { name: /근거 위치 바구니|조건 저장|근거 위치 담기/ })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: '샘플 목록', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('round-source-slot').getByRole('button', { name: '이 Round로 조사 시작', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Gate 결정' })).toHaveCount(0);
    await expect(page.getByTestId('round-source-slot').getByLabel('스크롤 가능한 행 영역', { exact: true })).toBeVisible();
    // Rows scroll inside the table, bounded by the remaining pane; the page itself does not scroll.
    const rows = page.getByTestId('round-source-slot').getByLabel('스크롤 가능한 행 영역', { exact: true });
    await expect.poll(() => rows.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0);
    await expect.poll(() => page.getByRole('main').evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
    const conditions = page.getByTestId('round-source-slot').getByRole('button', { name: /^조회 조건/ });
    await expect(conditions).toHaveAttribute('aria-expanded', 'false');
    await conditions.click();
    await expect(page.getByLabel('로그 타입', { exact: true })).toBeFocused();
    await page.getByLabel('Module', { exact: true }).fill('module-a');
    await page.getByRole('button', { name: '적용', exact: true }).click();
    await expect(page).toHaveURL(/sourceModule=module-a/);
    await expect(conditions).toContainText('Module module-a');
    await expect(page.getByTestId('round-source-slot').getByRole('button', { name: '이 Round로 조사 시작', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /근거 위치 바구니|조건 저장|근거 위치 담기/ })).toHaveCount(0);
    await evidence(page, testInfo, 'round-source-tab-1440');
    await page.getByRole('tab', { name: '시퀀스', exact: true }).click();
    await expect(page).toHaveURL(/sourceTab=sequence/);
    await page.getByRole('tab', { name: '결과·결함' }).click();
    await expect(page.getByRole('button', { name: 'Gate 결정', exact: true })).toBeVisible();
    await expect(page).not.toHaveURL(/view=/);
  });

  test('request drawer restores from URL and opens its Round result', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto(`/log-dev/log-validation-requests?request=${REQUEST}`);
    await expect(page.getByRole('heading', { name: '검증 요청 상세' })).toBeVisible();
    await expect(page.getByRole('region', { name: '시도 이력', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Round 결과 열기' }).click();
    await expect(page).toHaveURL(new RegExp(roundPath));
    await evidence(page, testInfo, 'request-round-route');
  });

  test('rule filters restore after reload', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    // The default population is the decisive (latest completed) attempt; pin the first attempt, whose rules carry the deleted excerpt.
    await page.goto(`${roundPath}?request=${REQUEST}&attempt=${ATTEMPT}&result=NOT_CHECKED`);
    await expect(page.getByRole('table', { name: '규칙 결과', exact: true })).toContainText('SEQ-002');
    await expect(page.getByRole('table', { name: '규칙 결과', exact: true })).not.toContainText('TIME-001');
    await page.reload();
    await expect(page.getByRole('table', { name: '규칙 결과', exact: true })).toContainText('SEQ-002');
    await evidence(page, testInfo, 'rule-filter-restored');
  });
});
