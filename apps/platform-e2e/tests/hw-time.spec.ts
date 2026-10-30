import { expect, test, type Page } from '@playwright/test';
import { evidence, expectScopeValid, query, signInAs } from './support';

/**
 * HW Time (#690, node 690m): the four menus share one drill contract (06 §12.7) and one workspace/board contract (§12.8).
 * One spec, parameterised by menu: L1 → L2 → L3, Back, reload at L3, and the board pane at the same drill path.
 * Mount and re-read assertions stay in the SDK tests; this only observes roles, names and the URL.
 */
type Entry = 'table' | 'chart';
const MENUS: { id: string; label: string; path: string; entry: Entry }[] = [
  { id: 'hw-time-steps', label: 'HW Time 단계별', path: '/mars/hw-time-steps', entry: 'chart' },
  { id: 'hw-time-compare', label: 'HW Time 비교', path: '/mars/hw-time-compare', entry: 'chart' },
  { id: 'hw-time-overview', label: 'HW Time 개요', path: '/mars/hw-time-overview', entry: 'chart' },
  { id: 'hw-time-table', label: 'HW Time 표', path: '/mars/hw-time-table', entry: 'table' },
];
const MODULE = 'PM1';
const MOTION = 'Chuck';

/** The menu's own visible entry: a `<값> 들어가기` row action in the table, the chart's point picker + `선택 지점 실행` in the chart menus. */
async function enter(page: Page, entry: Entry, value: string, chartName?: string) {
  if (entry === 'table') {
    await page.getByRole('button', { name: `${value} 들어가기` }).first().click();
    return;
  }
  const chart = chartName ? page.getByRole('region', { name: chartName }) : page;
  const picker = chart.getByRole('combobox', { name: '차트 지점 선택' });
  await expect(picker).toBeEnabled();
  const option = picker.locator('option').filter({ hasText: ` · ${value} · ` }).first();
  await picker.selectOption({ value: (await option.getAttribute('value'))! });
  await chart.getByRole('button', { name: '선택 지점 실행' }).click();
}

const drillPath = (page: Page) => page.getByRole('navigation', { name: '드릴 경로' });

test.describe('HW Time 메뉴 4종 — 드릴 · 작업 영역 · 보드 (06 §12.7 드릴 · §12.8)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAs(page, 'engineer');
  });

  for (const menu of MENUS) {
    test(`${menu.label}: L1 → L3, Back, 새로고침, 분석 보드 칸`, async ({ page }, testInfo) => {
      await page.goto(`${menu.path}?v=1&scopeId=MEM`);
      await expectScopeValid(page, 'MEM · 메모리');
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(menu.label);
      expect(query(page).has('drillModule')).toBe(false);

      await enter(page, menu.entry, MODULE, menu.id === 'hw-time-compare' ? 'Module별 동작시간' : undefined);
      await expect.poll(() => query(page).get('drillModule')).toBe(MODULE);
      expect(query(page).has('drillMotion')).toBe(false);
      await expect(drillPath(page)).toContainText(MODULE);

      await enter(page, menu.entry, MOTION, menu.id === 'hw-time-compare' ? `Motion별 동작시간 — Module ${MODULE}` : undefined);
      await expect.poll(() => query(page).get('drillMotion')).toBe(MOTION);
      if (menu.id === 'hw-time-compare') await expect(page.getByRole('region', { name: 'Module별 동작시간' })).toBeVisible();
      expect(query(page).get('drillModule')).toBe(MODULE);
      await expect(drillPath(page)).toContainText(MOTION);
      await evidence(page, testInfo, `${menu.id}-l3`);

      await page.goBack();
      await expect.poll(() => query(page).has('drillMotion')).toBe(false);
      expect(query(page).get('drillModule')).toBe(MODULE);
      await expect(drillPath(page)).not.toContainText(MOTION);
      await page.goForward();
      await expect.poll(() => query(page).get('drillMotion')).toBe(MOTION);

      await page.reload();
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(menu.label);
      expect(query(page).get('drillModule')).toBe(MODULE);
      expect(query(page).get('drillMotion')).toBe(MOTION);
      await expect(drillPath(page)).toContainText(MOTION);

      const more = page.getByRole('main').locator('header').filter({ has: page.getByRole('heading', { level: 1 }) });
      await more.getByRole('button', { name: '더보기', exact: true }).click();
      await page.getByRole('group', { name: '기타 페이지 동작' }).getByRole('button', { name: '분석 보드에 열기…' }).click();
      const dialog = page.getByRole('dialog', { name: '분석 보드에 열기' });
      await dialog.getByRole('radio', { name: '새 시트' }).click();
      await dialog.getByRole('button', { name: '열기' }).click();
      await expect.poll(() => new URL(page.url()).pathname).toBe('/board');
      const pane = page.getByRole('group', { name: '칸 1' });
      await expect(page.getByRole('tab', { name: `칸 1 · ${menu.label}` })).toHaveAttribute('aria-selected', 'true');
      await expect(pane.getByRole('navigation', { name: '드릴 경로' })).toContainText(MOTION);
      await expect(pane.getByRole('navigation', { name: '드릴 경로' })).toContainText(MODULE);
      await evidence(page, testInfo, `${menu.id}-board-pane`);
    });
  }

  for (const menu of MENUS.filter(item => item.entry === 'chart')) {
    test(`${menu.label}: L1 합계 라벨, 범례 트리 Enter로 L2, 현재 노드 aria-current`, async ({ page }) => {
      await page.goto(`${menu.path}?v=1&scopeId=MEM`);
      await expectScopeValid(page, 'MEM · 메모리');
      // The Frame's accessible table carries the 합계 column only when the chart draws totals (valueLabels, additive seconds).
      // The first chart Frame (its toolbar has 구간 선택); the page head has its own 더보기.
      const chart = page.getByRole('main').locator('section').filter({ has: page.getByRole('button', { name: '구간 선택' }) }).first();
      const more = chart.getByRole('button', { name: '더보기', exact: true });
      await more.click();
      await page.getByRole('button', { name: '같은 데이터를 표로 보기' }).click();
      await expect(page.getByRole('columnheader', { name: '합계', exact: true }).first()).toBeVisible();
      // The 더보기 popover stays open with the toggled item; close it and wait, or it takes focus back from the tree and swallows Enter.
      const hideTable = page.getByRole('button', { name: '데이터 표 숨기기' });
      await expect(hideTable).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(hideTable).toBeHidden();
      // Closing returns focus to the trigger a moment later; focusing the tree before that lets it land after and Enter reopens the popover.
      await expect(more).toBeFocused();
      const tree = page.getByRole('tree', { name: '계층 범례' });
      // The compare and overview Inspectors are rails: the legend of compare opens from its button, overview has the legend panel.
      if (menu.id === 'hw-time-compare') await page.getByRole('button', { name: '계층 범례' }).click();
      const moduleItem = tree.getByRole('treeitem', { name: new RegExp(MODULE) });
      await moduleItem.focus();
      // Every row is a drill target at its level: the trailing button names the target and the row announces Enter.
      await expect(moduleItem.getByRole('button', { name: `${MODULE} 단계로 이동` })).toBeVisible();
      const describedBy = await moduleItem.getAttribute('aria-describedby');
      await expect(page.locator(`[id="${describedBy!.split(' ')[0]}"]`)).toHaveText('Enter: 이 단계로 이동');
      await page.keyboard.press('Enter');
      await expect.poll(() => query(page).get('drillModule')).toBe(MODULE);
      expect(query(page).has('drillMotion')).toBe(false);
      if (menu.id === 'hw-time-compare') await page.getByRole('button', { name: '계층 범례' }).click();
      await tree.getByRole('treeitem', { name: new RegExp(MOTION) }).focus();
      await page.keyboard.press('Enter');
      await expect.poll(() => query(page).get('drillMotion')).toBe(MOTION);
      // Drilling navigates, which closes the compare rail's peek; reopen it to read the tree.
      if (menu.id === 'hw-time-compare' && !(await tree.count())) await page.getByRole('button', { name: '계층 범례' }).click();
      await expect(tree.getByRole('treeitem', { name: new RegExp(MOTION) })).toHaveAttribute('aria-current', 'true');
    });
  }

  test('HW Time 단계별: 잘못된 sort는 보정하지 않고 경고 — 초기화하면 차트가 돌아온다 (06 §6)', async ({ page }) => {
    await page.goto('/mars/hw-time-steps?v=1&scopeId=MEM&sort=bogus');
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('HW Time 단계별');
    const warning = page.getByText('필터 값이 올바르지 않습니다');
    await expect(warning).toBeVisible();
    await expect(page.getByText(/정렬 “bogus”/)).toBeVisible();
    await expect(page.getByRole('combobox', { name: '차트 지점 선택' })).toHaveCount(0);
    await page.getByRole('alert').getByRole('button', { name: '초기화' }).click();
    await expect.poll(() => query(page).has('sort')).toBe(false);
    await expect(warning).toBeHidden();
    await expect(page.getByRole('combobox', { name: '차트 지점 선택' })).toBeEnabled();
  });
});

/** Approved B observes real layout/paint. No SDK or engine-instance imports. */
test.describe('approved analysis B (#1141)', () => {
  test.beforeEach(async ({ page }) => { await signInAs(page, 'engineer'); });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    test(`compact geometry and undimmed bar drill/back at ${viewport.width}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      for (const menu of MENUS) {
        await page.goto(`${menu.path}?v=1&scopeId=MEM`);
        await expectScopeValid(page, 'MEM · 메모리');
        const content = page.locator('[data-platform-page-content]');
        await expect(content).toHaveCSS('padding-left', '16px');
        await expect(content).toHaveCSS('padding-right', '16px');
        await expect(content).toHaveCSS('padding-top', '12px');
        await expect(content).toHaveCSS('padding-bottom', '16px');
        if (menu.entry === 'table') {
          const table = page.getByRole('table', { name: 'HW Time 동작시간 표' });
          await expect(table.getByRole('cell').first()).toBeVisible();
          // The existing cell contract is a 32px minimum; the action plus its border can make a row 33px.
          await expect(table.getByRole('cell').first()).toHaveCSS('min-height', '32px');
          await expect(table.getByRole('row').nth(1)).toHaveCSS('height', '33px');
        }
      }
      await page.goto('/mars/hw-time-steps?v=1&scopeId=MEM');
      const chart = page.getByRole('region', { name: 'Module별 동작시간', exact: true });
      const canvas = chart.locator('canvas').first();
      await expect(canvas).toBeVisible();
      // Locate two differently colored bar segments from rendered pixels, rather than guessing plot coordinates.
      const samples = async () => canvas.evaluate(element => {
        const c = element as HTMLCanvasElement;
        const ctx = c.getContext('2d')!;
        const image = ctx.getImageData(0, 0, c.width, c.height);
        let hovered: { x: number; y: number; color: number[] } | undefined;
        for (let y = 0; y < c.height; y += 2) {
          const runs: { x: number; y: number; color: number[] }[] = [];
          let start = 0; let last = '';
          for (let x = 0; x <= c.width; x++) {
            const rgba = Array.from(image.data.slice((y * c.width + x) * 4, (y * c.width + x) * 4 + 4));
            const key = rgba.join(',');
            if (key !== last) {
              if (x - start > 12) {
                const color = last.split(',').map(Number);
                if (color[3] === 255 && Math.max(...color.slice(0, 3)) - Math.min(...color.slice(0, 3)) > 30) runs.push({ x: Math.floor((x + start) / 2), y, color });
              }
              start = x; last = key;
            }
          }
          // Sample inside a solid bar, clear of its antialiased top/bottom hit boundary.
          const interiors = runs.filter(run => [-4, 4].every(dy => {
            const offset = ((y + dy) * c.width + run.x) * 4;
            return y + dy >= 0 && y + dy < c.height && Array.from(image.data.slice(offset, offset + 4)).join() === run.color.join();
          }));
          if (!hovered && interiors.length > 1) hovered = interiors[0];
          // Axis tooltips emphasize every segment in the hovered category. Observe a different series in another row.
          if (hovered && y > hovered.y + 20) {
            const other = interiors.find(run => run.color.join() !== hovered!.color.join());
            if (other) return [hovered, other];
          }
        }
        return [];
      });
      await expect.poll(async () => (await samples()).length).toBe(2);
      const [hovered, other] = await samples();
      const box = (await canvas.boundingBox())!;
      const native = await canvas.evaluate(c => ({ width: (c as HTMLCanvasElement).width, height: (c as HTMLCanvasElement).height }));
      await page.mouse.move(box.x + hovered!.x * box.width / native.width, box.y + hovered!.y * box.height / native.height);
      await expect(chart.locator('[style*="position: absolute"]').filter({ hasText: 'PM1' }).last()).toBeVisible();
      await canvas.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const untouched = () => canvas.evaluate((c, point) => Array.from((c as HTMLCanvasElement).getContext('2d')!.getImageData(point.x, point.y, 1, 1).data), other!);
      await expect.poll(untouched).toEqual(other!.color);
      await evidence(page, testInfo, `gentle-hover-${viewport.width}`);
      await page.mouse.click(box.x + hovered!.x * box.width / native.width, box.y + hovered!.y * box.height / native.height);
      await expect.poll(() => query(page).has('drillModule')).toBe(true);
      await expect(drillPath(page)).toBeVisible();
      await page.goBack();
      await expect.poll(() => query(page).has('drillModule')).toBe(false);
      await expect(chart.locator('canvas').first()).toBeVisible();
      // Re-check the restored chart's actual paint under hover, rather than relying on its original option.
      await expect.poll(async () => (await samples()).length).toBe(2);
      const [restoredHover, restoredOther] = await samples();
      const restoredBox = (await canvas.boundingBox())!;
      await page.mouse.move(restoredBox.x + restoredHover!.x * restoredBox.width / native.width, restoredBox.y + restoredHover!.y * restoredBox.height / native.height);
      await expect(chart.locator('[style*="position: absolute"]').filter({ hasText: 'PM1' }).last()).toBeVisible();
      await expect.poll(() => canvas.evaluate((c, point) => Array.from((c as HTMLCanvasElement).getContext('2d')!.getImageData(point.x, point.y, 1, 1).data), restoredOther!)).toEqual(restoredOther!.color);
    });

    test(`native center/edge previews, keyboard move/cancel and nested max/restore at ${viewport.width}`, async ({ page }, testInfo) => {
      // This combined flow exceeds 30s on CI; keep every per-step assertion unchanged.
      test.slow();
      await page.setViewportSize(viewport);
      await page.goto('/mars/hw-time-compare?v=1&scopeId=MEM&drillModule=PM1&drillMotion=Chuck');
      const workspace = page.locator('[data-panel-workspace]');
      await expect(workspace).toHaveCSS('row-gap', '6px');
      await expect(workspace.locator('canvas')).not.toHaveCount(0);
      const summaryTab = page.getByRole('tab', { name: /^Module별/ });
      const moduleTab = page.getByRole('tab', { name: /^Module PM1 구성/ });
      const groups = workspace.locator('.dv-groupview');
      await expect(groups).toHaveCount(3);
      const target = groups.filter({ has: moduleTab });
      const targetBox = (await target.boundingBox())!;
      const sourceBox = (await summaryTab.boundingBox())!;
      // Native HTML DnD needs dragover after dragenter, including after a target rerender.
      // Match the existing board harness: keep moving over the target before releasing.
      const hoverDropTarget = async (x: number, y: number) => {
        await page.mouse.move(x, y, { steps: 12 });
        for (let i = 0; i < 6; i++) {
          await page.waitForTimeout(80);
          await page.mouse.move(x + (i % 2 === 0 ? -2 : 2), y);
        }
      };
      await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
      await page.mouse.down();
      await hoverDropTarget(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
      const center = page.locator('.ap-dock .dv-drop-target-selection.dv-drop-target-center, .ap-dock .dv-drop-target-anchor.dv-drop-target-center').filter({ visible: true });
      await expect(center).toBeVisible();
      await expect(center).toHaveCSS('border-top-width', '2px');
      // Native overlay dimensions transition for 70ms; assert the final footprint without a fixed sleep.
      await expect.poll(async () => Math.abs((await center.boundingBox())!.height - targetBox.height)).toBeLessThan(4);
      await expect.poll(async () => Math.abs((await center.boundingBox())!.width - targetBox.width)).toBeLessThan(4);
      await evidence(page, testInfo, `native-center-${viewport.width}`);
      await page.keyboard.press('Escape');
      await page.mouse.move(targetBox.x + targetBox.width / 2 + 2, targetBox.y + targetBox.height / 2);
      await page.mouse.up();
      await expect(groups).toHaveCount(3);
      // Native Escape ends the drag without changing layout. The baseline also leaves a stale cue
      // (backlog #1141); reload before the independent drop checks instead of claiming cue cleanup.
      await page.reload();
      await expect(groups).toHaveCount(3);
      await expect(center).toBeHidden();
      await expect(workspace.locator('canvas')).not.toHaveCount(0);
      await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
      await page.mouse.down();
      await hoverDropTarget(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
      await expect(center).toBeVisible();
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
      await page.mouse.up();
      await expect(groups).toHaveCount(2);
      await expect(groups.filter({ has: moduleTab }).getByRole('tab', { name: /^Module별/ })).toBeVisible();
      // Split the merged tab to the right; the preview boundary must become the resulting split.
      const merged = groups.filter({ has: moduleTab });
      const mergedBox = (await merged.boundingBox())!;
      const movedBox = (await summaryTab.boundingBox())!;
      await page.mouse.move(movedBox.x + movedBox.width / 2, movedBox.y + movedBox.height / 2);
      await page.mouse.down();
      await hoverDropTarget(mergedBox.x + mergedBox.width - 10, mergedBox.y + mergedBox.height / 2);
      const edge = page.locator('.ap-dock .dv-drop-target-selection.dv-drop-target-right, .ap-dock .dv-drop-target-anchor.dv-drop-target-right').filter({ visible: true });
      await expect(edge).toBeVisible();
      await expect(edge).toHaveCSS('border-left-width', '3px');
      await expect.poll(async () => Math.abs((await edge.boundingBox())!.width / mergedBox.width - 0.5)).toBeLessThan(0.03);
      const edgeBox = (await edge.boundingBox())!;
      await evidence(page, testInfo, `native-edge-${viewport.width}`);
      await page.mouse.move(mergedBox.x + mergedBox.width - 10, mergedBox.y + mergedBox.height / 2);
      await page.mouse.up();
      await expect(groups).toHaveCount(3);
      await expect.poll(async () => Math.abs((await groups.filter({ has: summaryTab }).boundingBox())!.x - edgeBox.x)).toBeLessThan(10);
      await summaryTab.focus();
      await summaryTab.press('Shift+F10');
      await expect(page.getByRole('menu')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(summaryTab).toBeFocused();
      await expect(groups).toHaveCount(3);
      await summaryTab.press('Shift+F10');
      const move = page.getByRole('menuitem', { name: /Module PM1 구성.*묶음으로 옮기기/ });
      await move.focus(); await move.press('Enter');
      await expect(groups).toHaveCount(2);
      await expect(summaryTab).toBeFocused();
      // Restore the declared three-group layout before the independent max/restore scenario.
      // The preceding keyboard move intentionally produced two full-width stacked groups.
      await workspace.getByRole('button', { name: '기본 배치', exact: true }).click();
      await expect(groups).toHaveCount(3);
      // Put this real consumer in a board, then maximize the outer pane and nested summary group.
      const header = page.getByRole('main').locator('header').filter({ has: page.getByRole('heading', { level: 1 }) });
      await header.getByRole('button', { name: '더보기', exact: true }).click();
      await page.getByRole('button', { name: '분석 보드에 열기…', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '분석 보드에 열기' });
      await dialog.getByRole('radio', { name: '새 시트' }).click();
      await dialog.getByRole('button', { name: '열기', exact: true }).click();
      await page.getByRole('button', { name: '칸 추가', exact: true }).click();
      const pane = page.getByRole('group', { name: '칸 1', exact: true });
      const plot = pane.getByRole('img', { name: /^Module별 동작시간/ });
      await expect(plot).toBeVisible();
      await page.getByRole('button', { name: '칸 1 최대화', exact: true }).click();
      const innerMaximize = pane.locator('[data-panel-workspace] .dv-groupview').filter({ has: page.getByRole('tab', { name: /^Module별/ }) }).locator('[data-workspace-maximize]');
      await innerMaximize.click();
      await expect.poll(async () => (await plot.boundingBox())!.width).toBeGreaterThan(viewport.width * 0.6);
      await evidence(page, testInfo, `nested-maximized-${viewport.width}`);
      await innerMaximize.click();
      await expect.poll(async () => (await plot.boundingBox())!.width).toBeLessThan(viewport.width * 0.6);
      await page.getByRole('button', { name: '원래 크기로', exact: true }).first().click();
      await expect(pane).toBeVisible();
    });
  }
});
