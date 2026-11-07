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

// #1410: dirty spec editing registers the #1388 navigation guard with `leaves: 'address'` (ADR-0115). Back/Forward only change the drawer key of the
// same pathname, so the pathname default would let them bypass the guard; the in-menu dialog keeps answering the screen's own drawer-replacing moves.
test.describe('모델 명세 편집 이동 가드 (#1410, 06 §6.4)', () => {
  const SPEC = `/log/knowledge/models/${model}/spec?v=1&scopeId=MEM`;
  const dialog = (page: Page) => page.getByRole('alertdialog', { name: '저장하지 않은 변경이 있습니다', exact: true });
  const localDialog = (page: Page) => page.getByRole('dialog', { name: '저장하지 않은 입력을 버릴까요?', exact: true });
  const stay = (page: Page) => dialog(page).getByRole('button', { name: '머무르기', exact: true });
  const leave = (page: Page) => dialog(page).getByRole('button', { name: '변경 버리고 이동', exact: true });
  const draftDrawer = (page: Page) => page.getByRole('dialog', { name: '명세 초안 편집', exact: true });
  const source = (page: Page) => draftDrawer(page).getByLabel('원본 문서');

  async function openDraft(page: Page) {
    await signInAs(page, 'admin');
    await page.goto(SPEC);
    await page.getByRole('button', { name: '초안 편집', exact: true }).click();
    await expect(draftDrawer(page)).toBeVisible();
  }
  async function makeDirty(page: Page) {
    await source(page).fill('E2E specification');
    await expect(source(page)).toHaveValue('E2E specification');
  }

  test('편집이 dirty일 때 사이드바 메뉴 이동은 확인을 열고, 머무르면 URL과 입력을 지키고, 버리면 이동한다', async ({ page }, testInfo) => {
    await openDraft(page);
    await makeDirty(page);
    const before = page.url();
    const link = page.getByRole('navigation', { name: '주 메뉴' }).getByRole('link', { name: '전체 기술 Item', exact: true });

    await link.click();
    await expect(dialog(page)).toBeVisible();
    await evidence(page, testInfo, 'spec-leave-dialog');
    await stay(page).click();
    await expect(dialog(page)).toHaveCount(0);
    expect(page.url()).toBe(before);
    await expect(source(page)).toHaveValue('E2E specification');

    await link.click();
    await leave(page).click();
    await expect(page).toHaveURL(/\/log-knowledge-items/);
    await expect(dialog(page)).toHaveCount(0);
  });

  test('딥링크 이동(Ctrl+K 팔레트)도 같은 확인을 연다', async ({ page }) => {
    await openDraft(page);
    await makeDirty(page);
    const before = page.url();
    await page.keyboard.press('ControlOrMeta+k');
    const search = page.getByRole('combobox', { name: '메뉴 검색', exact: true });
    await search.fill('카탈로그 관리');
    await page.getByRole('option', { name: /카탈로그 관리/ }).first().click();
    await expect(dialog(page)).toBeVisible();
    await stay(page).click();
    expect(page.url()).toBe(before);
    await page.getByRole('option', { name: /카탈로그 관리/ }).first().click();
    await leave(page).click();
    await expect(page).toHaveURL(/\/log-knowledge-catalog/);
  });

  test('브라우저 Back은 서랍 키만 바뀌어도 한 번만 묻는다: 머무르면 URL과 입력이 남고 버리면 서랍이 닫힌다', async ({ page }) => {
    await openDraft(page);
    await makeDirty(page);
    const here = page.url();

    await page.goBack();
    await expect(dialog(page)).toBeVisible();
    await expect(localDialog(page)).toHaveCount(0);
    await expect(page).toHaveURL(here); // the Kernel's history compensation is asynchronous: wait until the person is back before deciding
    await stay(page).click();
    await expect(dialog(page)).toHaveCount(0);
    expect(page.url()).toBe(here);
    await expect(source(page)).toHaveValue('E2E specification');

    await page.goBack();
    await expect(dialog(page)).toBeVisible();
    await expect(page).toHaveURL(here);
    await leave(page).click();
    await expect(draftDrawer(page)).toHaveCount(0);
    expect(page.url()).not.toContain('drawer=draft');
    await expect(dialog(page)).toHaveCount(0);
  });

  test('브라우저 Forward도 묻는다: 머무르면 서랍과 입력이 남고 버리면 앞 주소로 이동한다', async ({ page }) => {
    await openDraft(page);
    await draftDrawer(page).getByRole('button', { name: /닫기/ }).first().click();
    await expect(draftDrawer(page)).toHaveCount(0);
    await page.goBack(); // clean: back to the open drawer, with the closed address ahead
    await expect(draftDrawer(page)).toBeVisible();
    await makeDirty(page);
    const here = page.url();

    await page.goForward();
    await expect(dialog(page)).toBeVisible();
    await expect(localDialog(page)).toHaveCount(0);
    await expect(page).toHaveURL(here);
    await stay(page).click();
    expect(page.url()).toBe(here);
    await expect(source(page)).toHaveValue('E2E specification');

    await page.goForward();
    await expect(dialog(page)).toBeVisible();
    await expect(page).toHaveURL(here);
    await leave(page).click();
    await expect(draftDrawer(page)).toHaveCount(0);
    expect(page.url()).not.toContain('drawer=draft');
  });

  test('화면 안 탭 이동은 화면 자체 확인 한 번만 열고, 버리고 이동한 뒤 가드는 다시 묻지 않는다', async ({ page }) => {
    await openDraft(page);
    await makeDirty(page);
    await page.getByRole('tab', { name: '변경점', exact: true }).click();
    await expect(localDialog(page)).toBeVisible();
    await expect(dialog(page)).toHaveCount(0);
    await localDialog(page).getByRole('button', { name: '버리고 이동', exact: true }).click();
    await expect(page).toHaveURL(/tab=changes/);
    await expect(dialog(page)).toHaveCount(0);
    await expect(localDialog(page)).toHaveCount(0);
  });

  test('편집이 clean이면 메뉴 이동은 묻지 않는다', async ({ page }) => {
    await openDraft(page);
    await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('link', { name: '전체 기술 Item', exact: true }).click();
    await expect(page).toHaveURL(/\/log-knowledge-items/);
    await expect(dialog(page)).toHaveCount(0);
  });
});
