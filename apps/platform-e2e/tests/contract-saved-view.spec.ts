import { expect, test, type Locator, type Page } from '@playwright/test';
import { PERIOD } from './contract-helpers';
import { contextBar, evidence, mainHeading, query, signInAs } from './support';

/**
 * Platform contract checks for Saved Views (docs/06 §21, #1011 node 1011g). The cycle-time detail is only the consumer the
 * contract is observed through; the views, groups and people named below come from the app's local store seed.
 */
const CYCLE = `/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&${PERIOD}`;
const PHOTO_CHIP = '지우기 PHOTO';
const trigger = (page: Page) => page.getByRole('button', { name: /^저장된 뷰:/ });
const modifiedBadge = (page: Page) => trigger(page).getByText('수정됨');
const toast = (page: Page, text: RegExp | string) => page.getByText(text).first();
const applied = (page: Page) => page.getByRole('region', { name: '적용된 조회 조건' });
async function openCycle(page: Page, url = CYCLE) {
  await page.goto(url);
  await expect(mainHeading(page)).toHaveText('사이클타임 상세');
  await expect(trigger(page)).toBeVisible();
}

/** The selector popover's view list; opening it again while open would close it. */
async function openList(page: Page): Promise<Locator> {
  await trigger(page).click();
  const list = page.getByRole('list', { name: '뷰 목록' });
  await expect(list).toBeVisible();
  return list;
}
const rowOf = (list: Locator, name: string) => list.getByRole('listitem').filter({ hasText: name });
async function pickView(page: Page, name: string) {
  const list = await openList(page);
  await rowOf(list, name).getByRole('button').first().click();
}

/** Opens `새 뷰로 저장` and fills the name; the caller chooses the audience and submits. */
async function startSave(page: Page, name: string, unit: RegExp = /^메뉴 뷰/) {
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByRole('menuitem', { name: /새 뷰로 저장|내 복사본으로 저장/ }).click();
  const dialog = page.getByRole('dialog', { name: '뷰 저장' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: unit }).click();
  await dialog.getByLabel('뷰 이름').fill(name);
  return dialog;
}
async function savePrivate(page: Page, name: string) {
  const dialog = await startSave(page, name);
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(toast(page, `"${name}" 뷰를 저장했습니다.`)).toBeVisible();
  await expect(trigger(page)).toHaveAccessibleName(`저장된 뷰: ${name}`);
}
/** Saves through the audience picker: `groups` checks the named groups, `official` asks for approval. */
async function saveShared(page: Page, name: string, target: { groups: string[] } | { official: true }) {
  const dialog = await startSave(page, name);
  await dialog.getByRole('radio', { name: /^공유 대상 지정/ }).click();
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '공유 대상' });
  await expect(picker).toBeVisible();
  if ('official' in target) await picker.getByRole('radio', { name: '공식 신청' }).click();
  else { await picker.getByRole('radio', { name: '그룹' }).click(); for (const group of target.groups) await picker.getByRole('checkbox', { name: group }).check(); }
  await picker.getByRole('button', { name: '공유 대상 저장' }).click();
  await expect(picker).toHaveCount(0);
}
async function openManagement(page: Page) {
  await trigger(page).click();
  await page.getByRole('button', { name: '뷰 관리', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '뷰 관리' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('06 §21 저장된 뷰', () => {
  test('조건을 저장하고 다른 뷰를 적용한 뒤 고치면 수정됨이 뜨고, 저장한 뷰를 다시 고르면 그 조건으로 돌아온다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await openCycle(page, `${CYCLE}&granularity=day`);
    await savePrivate(page, 'E2E 일 단위 PHOTO');
    await expect(modifiedBadge(page)).toHaveCount(0);

    await pickView(page, '내 야간 점검');
    await expect(trigger(page)).toHaveAccessibleName('저장된 뷰: 내 야간 점검');
    await expect(contextBar(page).getByRole('button', { name: PHOTO_CHIP })).toHaveCount(0);

    // The seed view holds no room, which leaves the required 공정 empty: choosing one and applying is the edit that makes the view modified.
    const bar = contextBar(page);
    await bar.getByRole('button', { name: '공정', exact: true }).click();
    await page.getByRole('option', { name: 'PHOTO', exact: true }).click();
    await page.keyboard.press('Escape');
    await bar.getByRole('button', { name: '적용', exact: true }).click();
    await expect(modifiedBadge(page)).toBeVisible();
    await evidence(page, testInfo, 'modified');

    await pickView(page, 'E2E 일 단위 PHOTO');
    await page.getByRole('dialog', { name: '변경한 내용을 어떻게 할까요?' }).getByRole('button', { name: '버리고 이동' }).click();
    await expect(trigger(page)).toHaveAccessibleName('저장된 뷰: E2E 일 단위 PHOTO');
    await expect(contextBar(page).getByRole('button', { name: PHOTO_CHIP })).toBeVisible();
    await expect(applied(page)).toContainText('집계 일');
    await expect(modifiedBadge(page)).toHaveCount(0);
  });

  test('그룹에 공유하고 공식을 신청하면 관리자가 승인하고, 승인 전후 상태가 서로 다른 필드로 보인다', async ({ page, context }, testInfo) => {
    await signInAs(page, 'engineer');
    await openCycle(page);
    await saveShared(page, 'E2E 그룹 공유', { groups: ['포토공정1팀 (3명)', '주간 리뷰 모임 (3명)'] });
    await expect(toast(page, /"E2E 그룹 공유" 뷰를 저장하고 공유 대상을 정했습니다/)).toBeVisible();
    await saveShared(page, 'E2E 공식 신청', { official: true });
    await expect(toast(page, /"E2E 공식 신청" 뷰를 저장하고 공식 게시를 신청했습니다/)).toBeVisible();

    const list = await openList(page);
    await expect(rowOf(list, 'E2E 그룹 공유')).toContainText('포토공정1팀 외 1');
    // Asking for official publishing never changes who can see the view: the audience stays private and only the approval moves.
    await expect(rowOf(list, 'E2E 공식 신청')).toContainText('나만');
    await expect(rowOf(list, 'E2E 공식 신청')).toContainText('승인 대기');
    await page.keyboard.press('Escape');

    // Each role gets its own page of the same browser context (the stored views are shared, the role script is installed once per page).
    const adminPage = await context.newPage();
    await signInAs(adminPage, 'admin');
    await openCycle(adminPage);
    const dialog = await openManagement(adminPage);
    await dialog.getByRole('radio', { name: '승인 대기' }).click();
    await dialog.getByRole('button', { name: /E2E 공식 신청/ }).click();
    await evidence(adminPage, testInfo, 'approval-pending');
    await dialog.getByRole('button', { name: '승인', exact: true }).click();
    await expect(dialog.getByRole('status').filter({ hasText: 'E2E 공식 신청: 승인했습니다.' })).toBeVisible();
    await adminPage.close();

    await openCycle(page);
    const after = await openList(page);
    await expect(rowOf(after, 'E2E 공식 신청')).toContainText('공식');
    await expect(rowOf(after, 'E2E 공식 신청')).not.toContainText('승인 대기');
  });

  test('새로고침은 선택한 뷰와 조건을 그대로 두고, 복사한 주소는 같은 조건을 연다', async ({ page, context }, testInfo) => {
    await signInAs(page, 'engineer');
    await openCycle(page, `${CYCLE}&granularity=day`);
    await savePrivate(page, 'E2E 링크 왕복');
    const link = page.url();

    await page.reload();
    await expect(trigger(page)).toHaveAccessibleName('저장된 뷰: E2E 링크 왕복');
    expect(query(page).toString()).toBe(new URL(link).searchParams.toString());
    // The selected view id stays out of the address (06 §21.3).
    expect([...query(page).keys()].join(',')).not.toMatch(/view/i);

    const copy = await context.newPage();
    await copy.goto(link);
    await expect(mainHeading(copy)).toHaveText('사이클타임 상세');
    await expect(contextBar(copy).getByRole('button', { name: PHOTO_CHIP })).toBeVisible();
    await expect(applied(copy)).toContainText('집계 일');
    // A new tab has no selected view: the same conditions open without claiming a view.
    await expect(trigger(copy)).not.toHaveAccessibleName('저장된 뷰: E2E 링크 왕복');
    await evidence(copy, testInfo, 'copied-link');
    await copy.close();
  });

  test('개인 기본 뷰는 조건 없는 진입에만 적용되고 replace 한 번으로 쓰이며, 명시한 주소는 덮어쓰지 않는다', async ({ page }) => {
    await signInAs(page, 'engineer');
    await openCycle(page, `${CYCLE}&granularity=day`);
    await savePrivate(page, 'E2E 기본 뷰');
    const list = await openList(page);
    await list.getByRole('button', { name: 'E2E 기본 뷰 동작' }).click();
    await page.getByRole('menuitem', { name: '내 기본으로 지정' }).click();
    await expect(toast(page, '개인 기본 뷰로 지정했습니다.')).toBeVisible();

    // A bare route takes the default; the explicit address keeps what it says.
    await page.goto('about:blank');
    await page.goto('/analytics/cycle-time?v=1&scopeId=MEM');
    // The chip exists only when the default view was applied (the menu default alone shows 집계 일), so waiting on it first exposes a default that never applied.
    await expect(contextBar(page).getByRole('button', { name: PHOTO_CHIP })).toBeVisible();
    await expect(applied(page)).toContainText('집계 일');
    await page.goBack();
    await expect(page).toHaveURL('about:blank');

    // Wait until the selector finished its list and default read (the list opens with the default marked), then compare the whole address.
    const explicit = `${CYCLE}&granularity=week`;
    await openCycle(page, explicit);
    const afterLoad = await openList(page);
    await expect(rowOf(afterLoad, 'E2E 기본 뷰')).toContainText('내 기본');
    await page.keyboard.press('Escape');
    await expect(trigger(page)).not.toHaveAccessibleName('저장된 뷰: E2E 기본 뷰');
    await expect(applied(page)).toContainText('집계 주');
    expect(query(page).toString()).toBe(new URL(explicit, page.url()).searchParams.toString());
  });

  test('권한 밖 Scope 뷰는 열 수 없음으로 이름과 내용 없이 보이고, 낡은 뷰는 적용되지 않아 범위가 넓어지지 않는다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await openCycle(page);
    const before = query(page).toString();
    const list = await openList(page);
    await expect(list.getByText('볼 수 없는 뷰 — 조회 권한이 없는 공정이 포함되어 있습니다.')).toBeVisible();
    await expect(page.getByText('CMP 설비 비교')).toHaveCount(0);

    await expect(rowOf(list, 'LOT 추이 (이전 형식)')).toContainText('낡음');
    await rowOf(list, 'LOT 추이 (이전 형식)').getByRole('button').first().click();
    // The conditions are exactly as opened, so nothing is lost and no confirmation comes before the stale answer; the row already says 낡음.
    await expect(page.getByRole('dialog', { name: '변경한 내용을 어떻게 할까요?' })).toHaveCount(0);
    await expect(toast(page, /메뉴 화면 버전이 달라 적용하지 못했습니다/)).toBeVisible();
    expect(query(page).toString()).toBe(before);
    await expect(contextBar(page).getByRole('button', { name: PHOTO_CHIP })).toBeVisible();
    await expect(trigger(page)).not.toHaveAccessibleName('저장된 뷰: LOT 추이 (이전 형식)');

    const dialog = await openManagement(page);
    await expect(dialog.getByText('열 수 없음')).toBeVisible();
    await expect(dialog.getByText('낡음').first()).toBeVisible();
    await evidence(page, testInfo, 'denied-and-stale');
  });
});
