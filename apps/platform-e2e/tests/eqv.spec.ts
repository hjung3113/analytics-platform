import { expect, test } from '@playwright/test';
import { evidence, signInAs } from './support';

/**
 * EV host module (#801): the first external module mounted from EV's release tarballs (`eqv:topview`, `eqv:focus`).
 * Black-box: nothing from @eqv/* is imported; the window and equipment are the mock fixture's, spelled as the URL carries them
 * (naive seconds, no `Z`). The placement below is the provisional one in `apps/platform-web/src/modules.ts` — update both together.
 * The server-side refusal of a viewer (`without eqv:view → forbidden`) is the conformance test; the client gate renders first here.
 */
const TOPVIEW = '/clas/topview?equipment=eq-synth-01&from=2026-01-01T10:00:00&to=2026-01-01T10:30:00';
const MENU = '설비 Top View';

test.describe('EV host module (#801)', () => {
  test('engineer opens Top View, then Focus with Occurrence evidence labels', async ({ page }, testInfo) => {
    await page.goto(TOPVIEW);
    await expect(page.getByRole('link', { name: MENU })).toBeVisible();
    await expect(page.locator('[data-component-id]').first()).toBeVisible({ timeout: 15_000 });
    await evidence(page, testInfo, 'eqv-topview');

    await page.getByRole('button', { name: 'Focus 열기' }).click();
    await expect(page).toHaveURL(/\/clas\/topview\/focus\?/);
    const occurrences = page.getByRole('grid', { name: 'Occurrence 목록' });
    await expect(occurrences).toBeVisible({ timeout: 15_000 });
    await expect(occurrences.getByRole('row').nth(1)).toBeVisible();
    await expect(occurrences.getByText('관측').first()).toBeVisible();
    await evidence(page, testInfo, 'eqv-focus');
  });

  test('viewer has no menu entry for it', async ({ page }) => {
    await signInAs(page, 'viewer');
    await page.goto(TOPVIEW);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('link', { name: MENU })).toHaveCount(0);
    await expect(page.locator('[data-component-id]')).toHaveCount(0);
  });
});
