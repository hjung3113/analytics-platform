import { expect, test } from '@playwright/test';
import { evidence, expandPageHead, signInAs } from './support';

const investigation = (n: number) => `/log/explorer/14730000-0000-4000-8000-00000000000${n}?v=1`;
test.describe('로그 탐색 합성 Consumer (§13·§15·§16·§22, #1473)', () => {
  test.beforeEach(async ({ page }) => { await signInAs(page, 'engineer'); });
  test('목록 → 근거 위치 → 바구니, text-only 원문과 준비 중 넘기기', async ({ page }, info) => {
    await page.goto('/log/explorer?v=1');
    await expect(page.getByRole('heading', { name: '로그 탐색', exact: true })).toBeVisible();
    await expandPageHead(page);
    await expect(page.getByText('합성 데이터', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '조회 조건 펼치기', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: 'source-b:1 상세', exact: true }).click();
    await expect(page.getByRole('heading', { name: '원문 줄', exact: true })).toBeVisible();
    await expect(page.getByText(/payload="<script>synthetic<\/script>"/).first()).toBeVisible();
    await page.getByRole('button', { name: '근거 위치 담기', exact: true }).click();
    await page.getByRole('button', { name: '근거 위치 바구니 · 1', exact: true }).click();
    await expect(page.getByRole('heading', { name: '근거 위치 바구니', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '넘기기', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'Round · 준비 중', exact: true })).toBeDisabled();
    await expect(page.getByRole('menuitem', { name: '지식 초안 · 준비 중', exact: true })).toBeDisabled();
    await expect(page.getByRole('menuitem', { name: '결함 · 수신 대상 없음', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.getByText(/공식 FAIL이나 지식 발행을 확정하지 않습니다/)).toBeVisible();
    await evidence(page, info, 'log-explorer-synthetic-basket');
  });
  test('원본 ↔ 시퀀스 조건·선택 유지와 1280 서랍의 파일·타입 기본 숨김', async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(investigation(1));
    await expandPageHead(page);
    await page.getByRole('button', { name: 'source-b:1 상세', exact: true }).click();
    const table = page.getByRole('table', { name: '원본 이벤트 목록' });
    await expect(table.getByRole('columnheader', { name: '파일', exact: true })).toHaveCount(0);
    await expect(table.getByRole('columnheader', { name: '타입', exact: true })).toHaveCount(0);
    await page.getByRole('tab', { name: '시퀀스', exact: true }).click();
    await expect(page.getByRole('region', { name: '시퀀스', exact: true })).toBeVisible();
    await expect(page.getByText(/선택 source-b:1/)).toBeVisible();
    await evidence(page, info, 'log-explorer-synthetic-sequence-1280');
    await page.getByRole('tab', { name: '원본', exact: true }).click();
    await expect(page.getByRole('button', { name: 'source-b:1 상세', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '레코드 상세', exact: true })).toBeVisible();
    const viewport = page.getByLabel('스크롤 가능한 행 영역', { exact: true });
    await expect(viewport).toBeVisible();
    await expect.poll(() => viewport.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    await expect.poll(() => page.getByRole('main').evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
    await evidence(page, info, 'log-explorer-synthetic-drawer-1280');
  });
  for (const [n, label] of [[2, '일부 결과'], [3, '원본 없음'], [4, '권한 철회'], [5, '원문 잘림']] as const) {
    test(`합성 응답 상태: ${label}`, async ({ page }, info) => {
      await page.goto(investigation(n));
      await expandPageHead(page);
      await expect(page.getByText(new RegExp(label)).first()).toBeVisible();
      if (n === 3 || n === 4) await expect(page.getByRole('table', { name: '원본 이벤트 목록' })).toHaveCount(0);
      await evidence(page, info, `log-explorer-synthetic-state-${n}`);
    });
  }
  test('시퀀스 미지원은 원본과 구분해 표시', async ({ page }, info) => {
    await page.goto(investigation(6));
    await expandPageHead(page);
    await page.getByRole('tab', { name: '시퀀스', exact: true }).click();
    await expect(page.getByText('시퀀스 미지원', { exact: true })).toBeVisible();
    await evidence(page, info, 'log-explorer-synthetic-sequence-unsupported');
  });
  test('내보내기 범위·한도와 현재 어댑터의 미지원 이유', async ({ page }, info) => {
    await page.goto(investigation(1));
    await expandPageHead(page);
    await page.getByRole('button', { name: '더보기', exact: true }).click();
    await page.getByRole('button', { name: '현재 범위 내보내기…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '현재 범위 내보내기', exact: true });
    await expect(dialog.getByText(/행 10,000 · 5MB · 일일 20회 · 동시 1건/)).toBeVisible();
    await expect(dialog.getByText(/현재 어댑터에서 내보내기를 지원하지 않습니다/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: '내보내기', exact: true })).toBeDisabled();
    await evidence(page, info, 'log-explorer-export-range-and-reason');
  });
});
