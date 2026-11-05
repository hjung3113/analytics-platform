import { expect, test, type Page } from '@playwright/test';
import { evidence, signInAs } from './support';

const model = '00000003-0000-4000-8000-000000000008';
async function choose(page: Page, name: string, option: string) {
  await page.getByRole('combobox', { name, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test.describe('모델 명세 계약 경로 (#1196 d, §13·§22)', () => {
  test('프로파일 → 실효 명세 → 변경점 추가 → 초안 저장·봉인 발행', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto(`/log/knowledge/models/${model}?v=1&scopeId=MEM`);
    await page.getByRole('link', { name: '모델 명세 보기' }).click();
    await expect(page.getByRole('heading', { name: '모델 명세', exact: true })).toBeVisible();
    await choose(page, 'SW 버전', '2. v2.0');
    await expect(page.getByText('실효 명세', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: '변경점', exact: true }).click();
    await page.getByRole('button', { name: '변경점 추가', exact: true }).click();
    const change = page.getByRole('dialog', { name: '변경점 추가', exact: true });
    await choose(page, '대상 종류', 'module');
    await change.getByLabel('대상 (JSON)', { exact: true }).fill('{"module":"Chamber"}');
    await change.getByLabel('메모', { exact: true }).fill('E2E module timing note');
    await change.getByRole('button', { name: '추가', exact: true }).click();
    await expect(change).toHaveCount(0);
    await expect(page.getByText('E2E module timing note', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '초안 편집', exact: true }).click();
    const draft = page.getByRole('dialog', { name: '명세 초안 편집', exact: true });
    await draft.getByLabel('원본 문서').fill('E2E specification');
    await draft.getByLabel('문서 버전').fill('2');
    await draft.getByRole('button', { name: '초안 작성', exact: true }).click();
    await draft.getByLabel('명세 TSV').fill('kind\tmodule\tevent\ttrigger_rule\nmodule\tChamber\nmodule\tRobot\nevent\tChamber\tStart\tafter ready\nevent\tRobot\tMove\tmove');
    await draft.getByRole('button', { name: '저장', exact: true }).click();
    const publish = draft.getByRole('button', { name: '발행', exact: true });
    await expect(publish).toBeEnabled();
    const before = await publish.boundingBox();
    const body = draft.getByRole('region', { name: '명세 초안 편집', exact: true });
    await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(publish).toBeInViewport();
    const after = await publish.boundingBox();
    expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
    await publish.click();
    const confirmation = page.getByRole('dialog', { name: '명세 발행 확인', exact: true });
    await expect(confirmation).toContainText('해시로 봉인');
    await expect(confirmation).toContainText('재검토 필요');
    await evidence(page, testInfo, 'publication-confirmation');
    await confirmation.getByRole('button', { name: '확인하고 발행', exact: true }).click();
    await expect(draft).toHaveCount(0);
    await page.getByRole('tab', { name: 'Revision 이력', exact: true }).click();
    await expect(page.getByText(/^[0-9a-f]{64}$/).first()).toBeVisible();
    await expect(page.getByText(/r\d+ · 발행됨/).first()).toBeVisible();
    await evidence(page, testInfo, 'sealed-revision');
  });
});
