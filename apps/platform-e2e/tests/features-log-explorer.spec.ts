import { expect, test } from '@playwright/test';
import { evidence, expandPageHead, signInAs } from './support';

const investigation = (n: number) => `/log/explorer/14730000-0000-4000-8000-00000000000${n}?v=1`;
test.describe('로그 탐색 합성 Consumer (§13·§15·§16·§22, #1473)', () => {
  test.beforeEach(async ({ page }) => { await signInAs(page, 'engineer'); });
  test('목록 → 근거 위치 → 바구니, text-only 원문과 standalone 조사는 Round 넘기기 비활성', async ({ page }, info) => {
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
    await expect(page.getByRole('menuitem', { name: 'Round · Round에서 시작한 조사만', exact: true })).toBeDisabled();
    await expect(page.getByRole('menuitem', { name: '지식 초안', exact: true })).toBeEnabled();
    await expect(page.getByRole('menuitem', { name: '결함 · 수신 대상 없음', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.getByText(/공식 FAIL·지식 발행은 별도 확정/)).toBeVisible();
    await evidence(page, info, 'log-explorer-synthetic-basket');
  });
  test('Round에서 시작한 조사: 근거 위치를 Round로 넘기는 확인 대화상자(#1474)', async ({ page }, info) => {
    await page.goto(investigation(7));
    await expandPageHead(page);
    await page.getByRole('button', { name: 'source-b:1 상세', exact: true }).click();
    await page.getByRole('button', { name: '근거 위치 담기', exact: true }).click();
    await page.getByRole('button', { name: '근거 위치 바구니 · 1', exact: true }).click();
    const trigger = page.getByRole('button', { name: '넘기기', exact: true });
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Round', exact: true }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Round에 근거 위치 1개 넘기기' });
    await expect(dialog.getByText('근거 위치 참조만 전달 · 공식 FAIL·기술 지식은 별도 확정')).toBeVisible();
    await expect(dialog.getByText('fileRef · line · fileSha256만 전달 · 본문 없음')).toBeVisible();
    await dialog.getByRole('button', { name: '참조 전달', exact: true }).click();
    await expect(page.getByText('Round에 1개 넘김 · 이미 있던 위치 0개 · 원본 없음 0개')).toBeVisible();
    await expect(trigger).toBeFocused();
    await evidence(page, info, 'log-explorer-round-handoff');
  });
  // Host-only for W-1474c: worker rules prohibit browser/dev-server/E2E execution.
  test('지식 초안 A: 위치 확인·새 초안·결과 안내와 넘기기 초점 복귀', async ({ page }, info) => {
    await page.goto(investigation(8));
    await page.getByRole('button', { name: '근거 위치 바구니 · 3', exact: true }).click();
    const trigger = page.getByRole('button', { name: '넘기기', exact: true });
    await trigger.click(); await page.getByRole('menuitem', { name: '지식 초안', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '지식 초안으로 넘기기', exact: true });
    await expect(dialog.getByText('넘길 2 · 제외 1 · 해시 불일치 1', { exact: true })).toBeVisible();
    await dialog.getByText('위치별 확인 결과 · 3개', { exact: true }).click();
    await expect(dialog.getByText('제외 · 원본 없음', { exact: true })).toBeVisible();
    await expect(dialog.getByText('전달 · 해시 불일치', { exact: true })).toBeVisible();
    await dialog.getByRole('combobox', { name: /소유 대상/ }).click();
    await page.getByRole('option', { name: /MX-100/ }).click();
    await dialog.getByLabel('제목', { exact: false }).fill('합성 응답 지연 확인');
    await dialog.getByLabel('관찰 사실', { exact: false }).fill('시작 이후 응답 지연을 관찰했습니다.');
    await evidence(page, info, 'log-explorer-knowledge-new-a');
    await dialog.getByRole('button', { name: '새 초안으로 넘기기', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('새 초안에 2개 넘김', { exact: true })).toBeVisible();
    await expect(trigger).toBeFocused();
  });
  test('지식 초안 A: 내 초안에 덧붙이기와 20개 한도', async ({ page }, info) => {
    await page.goto(investigation(8));
    await page.getByRole('button', { name: '근거 위치 바구니 · 3', exact: true }).click();
    await page.getByRole('button', { name: '넘기기', exact: true }).click();
    await page.getByRole('menuitem', { name: '지식 초안', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '지식 초안으로 넘기기', exact: true });
    await dialog.getByRole('tab', { name: '내 초안에 덧붙이기', exact: true }).click();
    await dialog.getByRole('radio', { name: /제어 SW 재시도 위치 확인/ }).click();
    await expect(dialog.getByText(/기존 19 \+ 새 위치 최대 2 = 최대 21\/20/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: '내 초안에 덧붙이기', exact: true })).toBeEnabled();
    await dialog.getByRole('radio', { name: /초기화 이후 응답 지연 확인/ }).click();
    await evidence(page, info, 'log-explorer-knowledge-append-a');
    await dialog.getByRole('button', { name: '내 초안에 덧붙이기', exact: true }).click();
    await expect(page.getByText('내 초안에 근거 위치 2개를 전달했습니다. 이미 있던 위치는 더해지지 않습니다.', { exact: true })).toBeVisible();
  });
  test('지식 초안 A: 거절해도 입력 유지·닫기 전 작성 중 확인', async ({ page }, info) => {
    await page.goto(investigation(8));
    await page.getByRole('button', { name: '근거 위치 바구니 · 3', exact: true }).click();
    await page.getByRole('button', { name: '넘기기', exact: true }).click();
    await page.getByRole('menuitem', { name: '지식 초안', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '지식 초안으로 넘기기', exact: true });
    await dialog.getByRole('combobox', { name: /소유 대상/ }).click();
    await page.getByRole('option', { name: /MX-100/ }).click();
    await dialog.getByLabel('제목', { exact: false }).fill('[conflict]');
    await dialog.getByLabel('관찰 사실', { exact: false }).fill('합성 충돌 확인');
    await dialog.getByRole('button', { name: '새 초안으로 넘기기', exact: true }).click();
    await expect(dialog.getByText('초안 버전 충돌', { exact: true })).toBeVisible();
    await expect(dialog.getByLabel('제목', { exact: false })).toHaveValue('[conflict]');
    await expect(dialog.getByRole('button', { name: '목록 다시 확인', exact: true })).toBeVisible();
    await evidence(page, info, 'log-explorer-knowledge-conflict-a');
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    const guard = page.getByRole('alertdialog', { name: '작성 중인 내용이 사라집니다. 닫을까요?' });
    await guard.getByRole('button', { name: '계속 작성', exact: true }).click();
    await expect(dialog.getByLabel('제목', { exact: false })).toHaveValue('[conflict]');
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
    await expect(dialog.getByText(/내보내기에 어댑터 연결·내보내기 권한 필요/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: '내보내기', exact: true })).toBeDisabled();
    await evidence(page, info, 'log-explorer-export-range-and-reason');
  });
});
