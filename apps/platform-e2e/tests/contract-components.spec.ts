import { expect, test, type Page } from '@playwright/test';
import { PERIOD } from './contract-helpers';
import { evidence, expandPageHead, query, setScenario, signInAs, tableStatusLine } from './support';

/**
 * Platform contract checks (#44). Each `describe` is one contract area of docs/06; each test is one reported check.
 * Menu screens are only the consumers the contract is observed through — assertions target kernel/shell behavior.
 */
async function chooseFilterOption(page: Page, field: string, option: string) {
  await page.getByRole('combobox', { name: field }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test.describe('토큰 소비 계약 (06 §23, ADR-0011/ADR-0058)', () => {
  test('기능 화면 base 값이 theme보다 우선하고 플랫폼 control 경계는 label 대비를 유지한다', async ({ page }, testInfo) => {
    await page.goto('/bravo/metric-catalog?v=1&scopeId=MEM');
    await expect(page.getByTestId('page-filter-bar')).toBeVisible();
    const search = page.getByTestId('metric-search');
    await expect(search).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('font-size', '14px');
    await expect(page.locator('body')).toHaveCSS('font-family', /Pretendard Variable/);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(243, 247, 254)');
    // Confirmed B uses the shared Input/Select primitive radius and Select typography.
    await expect(search).toHaveCSS('border-radius', '6px');
    // Shared Select primitive default (feature SelectTrigger) is 13px.
    await expect(page.getByTestId('metric-status-filter')).toHaveCSS('font-size', '13px');
    await expect(search).toHaveCSS('border-top-color', 'rgb(102, 112, 131)');
    await evidence(page, testInfo, 'feedbackops-token-cascade');
  });
});

test.describe('관리 레이아웃 필터 레일 (06 §12.6, ADR-0022)', () => {
  test('1440 설비 마스터는 접기 기억과 펼치기 포커스를 제공한다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
    const rail = page.getByRole('region', { name: '필터', exact: true });
    const tableCard = page.getByRole('region', { name: '설비 마스터 목록' });
    await expect(rail.getByRole('heading', { name: '필터', exact: true })).toBeVisible();
    const collapse = rail.getByRole('button', { name: '필터 접기' });
    await expect(collapse).toBeVisible();
    await evidence(page, testInfo, 'management-rail-expanded');
    await collapse.click();
    await expect(rail).toHaveCount(0);
    const expand = tableCard.getByRole('button', { name: '필터', exact: true });
    await expect(expand).toBeVisible();
    await expect(expand).toBeFocused();
    await evidence(page, testInfo, 'management-rail-collapsed');
    await page.reload();
    await expect(expand).toBeVisible();
    await expect(rail).toHaveCount(0);
    await evidence(page, testInfo, 'management-rail-collapsed-reloaded');
    await expand.click();
    await expect(collapse).toBeVisible();
    await expect(collapse).toBeFocused();
  });

  test('1280 상세 슬롯은 자기 폭에 맞춰 필터 팝오버로 전환하고 URL 필터를 편집한다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM&focus=MEM-PHOTO-0103');
    await expect(page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('region', { name: '필터', exact: true })).toHaveCount(0);
    const button = page.getByRole('region', { name: '설비 마스터 목록' }).getByRole('button', { name: /^필터(?: · \d+)?$/ });
    await expect(button).toBeVisible();
    await button.click();
    const popover = page.getByRole('dialog', { name: '필터', exact: true });
    await expect(popover).toBeVisible();
    await popover.getByRole('combobox', { name: '상태', exact: true }).click();
    await page.getByRole('option', { name: '정비', exact: true }).click();
    // ADR-0037: a management filter is a draft until 적용; the trigger shows the pending change meanwhile.
    await expect(popover.getByRole('button', { name: '적용 (1)', exact: true })).toBeEnabled();
    expect(query(page).has('status')).toBe(false);
    await expect(button).toHaveAccessibleName('필터');
    await expect(button).toContainText('미적용 1');
    await popover.getByRole('button', { name: '적용 (1)', exact: true }).click();
    await expect.poll(() => query(page).get('status')).toBe('maintenance');
    await expect(button).toHaveText('필터 · 1');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await evidence(page, testInfo, 'management-detail-filter-popover');
  });

  test('1440 관리자 감사 레일은 일곱 필드와 초안 적용을 제공한다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/operations/admin-audit?v=1');
    const rail = page.getByRole('region', { name: '필터', exact: true });
    await expect(rail.getByRole('button', { name: '필터 접기' })).toBeVisible();
    await expect(rail.getByRole('combobox')).toHaveCount(3);
    await expect(rail.getByRole('textbox')).toHaveCount(4);
    // #305: viewer-local time fields, no contract words in the labels.
    await expect(rail.getByRole('textbox', { name: '시각 이후' })).toBeVisible();
    await expect(rail.getByRole('textbox', { name: '시각 미만' })).toBeVisible();
    await expect(rail).not.toContainText('ISO');
    await expect(rail.getByRole('button', { name: '적용', exact: true })).toBeDisabled();
    await rail.getByRole('textbox', { name: '행위자 정확 일치' }).fill('kim');
    await expect(rail.getByRole('button', { name: '적용 (1)', exact: true })).toBeEnabled();
    await expect(rail).toContainText('미적용 변경 1개');
    expect(query(page).has('actor')).toBe(false);
    await evidence(page, testInfo, 'management-audit-seven-filters');
  });

  test('감사 대상 유형 필터는 알 수 없는 형식 유효 값을 유지하고 잘못된 값은 전체 조회로 넓히지 않는다 (#1091)', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.setViewportSize({ width: 1440, height: 900 });
    const rail = page.getByRole('region', { name: '필터', exact: true });
    const table = page.getByLabel('스크롤 가능한 행 영역', { exact: true }).getByRole('table');
    const empty = page.getByText('조건에 맞는 결과가 없습니다');
    // Positive control: the unfiltered query has rows, so an empty result below is caused by the type filter.
    await page.goto('/operations/admin-audit');
    await expect(table.getByRole('row').filter({ has: page.getByRole('link', { name: /상세$/ }) }).first()).toBeVisible();
    await expect(empty).toHaveCount(0);
    await page.goto('/operations/admin-audit?type=Future.Type%3Av2');
    await expect(rail.getByRole('combobox', { name: '대상 유형' })).toContainText('Future.Type:v2');
    await expect(empty).toBeVisible();
    await expect(table).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.reload();
    await expect(rail.getByRole('combobox', { name: '대상 유형' })).toContainText('Future.Type:v2');
    await expect(empty).toBeVisible();
    await expect(table).toHaveCount(0);
    expect(query(page).get('type')).toBe('Future.Type:v2');
    await page.goto('/operations/admin-audit?type=9bad');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(table).toHaveCount(0);
    await expect(empty).toHaveCount(0);
  });
});

test.describe('PageFilterBar page-key 계약 (#54)', () => {
  test('설비 q/status/maker는 동일한 page key를 쓰고 page와 전체 필터를 초기화한다', async ({ page }, testInfo) => {
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM&page=2');
    // ADR-0037: drafts until 적용 (Enter in the search field submits), then one navigation that drops page.
    await expect(page.getByRole('button', { name: '필터 초기화' })).toHaveCount(0);
    const search = page.getByRole('searchbox', { name: '설비 ID 검색' });
    await search.fill('PHOTO');
    expect(query(page).has('q')).toBe(false);
    expect(query(page).get('page')).toBe('2');
    await search.press('Enter');
    await expect.poll(() => query(page).get('q')).toBe('PHOTO');
    await expect.poll(() => query(page).has('page')).toBe(false);
    await expect(search).toBeFocused();

    await page.goto('/mars/equipment-master?v=1&scopeId=MEM&page=2');
    await chooseFilterOption(page, '상태', '정비');
    expect(query(page).has('status')).toBe(false);
    await page.getByRole('button', { name: '적용 (1)', exact: true }).click();
    await expect.poll(() => query(page).get('status')).toBe('maintenance');
    await expect.poll(() => query(page).has('page')).toBe(false);
    await chooseFilterOption(page, '상태', '전체');
    expect(query(page).get('status')).toBe('maintenance');
    await page.getByRole('button', { name: '적용 (1)', exact: true }).click();
    await expect.poll(() => query(page).has('status')).toBe(false);

    await page.goto('/mars/equipment-master?v=1&scopeId=MEM&maker=ZZZ&page=2');
    const maker = page.getByRole('combobox', { name: 'Maker' });
    await expect(maker).toHaveText('ZZZ');
    await chooseFilterOption(page, 'Maker', 'TEL');
    expect(query(page).get('maker')).toBe('ZZZ');
    await page.getByRole('button', { name: '적용 (1)', exact: true }).click();
    await expect.poll(() => query(page).get('maker')).toBe('TEL');
    await expect.poll(() => query(page).has('page')).toBe(false);

    await page.goto('/mars/equipment-master?v=1&scopeId=MEM&q=PHOTO&status=maintenance&maker=ZZZ&page=2');
    // Scoped to the bar: once the list answers, its empty state shows a second 필터 초기화 (the old 450 ms read hid it, #917).
    await page.getByTestId('page-filter-bar').getByRole('button', { name: '필터 초기화' }).click();
    await expect.poll(() => query(page).has('q')).toBe(false);
    expect(query(page).has('status')).toBe(false);
    expect(query(page).has('maker')).toBe(false);
    expect(query(page).has('page')).toBe(false);
    await evidence(page, testInfo, 'equipment-filter-page-keys');
  });

  test('지표 q/status/domain은 동일한 page key를 쓰고 unknown domain을 표시하며 전체 필터를 초기화한다', async ({ page }, testInfo) => {
    await page.goto('/bravo/metric-catalog?v=1&scopeId=MEM&page=2');
    const search = page.getByRole('searchbox', { name: '이름 또는 지표 ID' });
    await page.locator('label').filter({ hasText: '이름 또는 지표 ID' }).click();
    await expect(search).toBeFocused();
    const status = page.getByRole('combobox', { name: '상태' });
    await page.locator('label').filter({ hasText: '상태' }).click();
    await expect(status).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: '발행', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await search.fill('yield');
    await expect.poll(() => query(page).get('q')).toBe('yield');
    await expect.poll(() => query(page).has('page')).toBe(false);

    await page.goto('/bravo/metric-catalog?v=1&scopeId=MEM&page=2');
    await chooseFilterOption(page, '상태', '발행');
    await expect.poll(() => query(page).get('status')).toBe('published');
    await expect.poll(() => query(page).has('page')).toBe(false);

    await page.goto('/bravo/metric-catalog?v=1&scopeId=MEM&page=2');
    await chooseFilterOption(page, '도메인', '품질');
    await expect.poll(() => query(page).get('domain')).toBe('quality');
    await expect.poll(() => query(page).has('page')).toBe(false);

    await page.goto('/bravo/metric-catalog?v=1&scopeId=MEM&domain=bogus');
    // #304 FIX1: the alert keeps the field's user name and the raw value as entered — never `key=value`.
    await expect(page.getByRole('alert')).toContainText('도메인');
    await expect(page.getByRole('alert')).toContainText('bogus');
    await expect(page.getByRole('alert')).not.toContainText('domain=');
    await expect(page.getByRole('combobox', { name: '도메인' })).toHaveText('bogus');

    await page.goto('/bravo/metric-catalog?v=1&scopeId=MEM&q=yield&status=draft&domain=quality&page=2');
    await page.getByRole('button', { name: '필터 초기화' }).click();
    await expect.poll(() => query(page).has('q')).toBe(false);
    expect(query(page).has('status')).toBe(false);
    expect(query(page).has('domain')).toBe(false);
    expect(query(page).has('page')).toBe(false);
    await evidence(page, testInfo, 'metrics-filter-page-keys');
  });
});

// 접힘 요약 시각 계약(06 §13, DESIGN.md Filter bar): 접어도 조건을 잘라내지 않는다. ADR-0029.
test.describe('PageFilterBar 접힘 요약 (ADR-0029)', () => {
  test('접힌 요약은 조건을 자르지 않고 항목 단위로 왼쪽 정렬 줄바꿈하며 Enter로 펼친다', async ({ page }, testInfo) => {
    const longRaw = 'x'.repeat(60);
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(`/mars/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&${PERIOD}&percentile=${longRaw}&sort=equipmentId:asc`);
    await expandPageHead(page);
    const bar = page.getByTestId('page-filter-bar');
    await expect(bar).toBeVisible();
    // 등록되지 않은 percentile은 페이지 키 오류이지만 필터 바는 원문을 요약에 그대로 남긴다.
    // #304 FIX1: the alert keeps the field's user name and the full raw value — untruncation is ADR-0029's point.
    await expect(page.getByRole('alert')).toContainText('느린 실행');
    await expect(page.getByRole('alert')).toContainText(longRaw);
    await expect(page.getByRole('alert')).not.toContainText('percentile=');

    // 1024×900 기본값은 사이드바가 접힌다(AppShell innerWidth < 1440). 접근 가능한 토글로 펼친 것을 확인한 뒤 필터를 접는다.
    const sidebarExpand = page.getByRole('button', { name: '사이드바 펼치기' });
    await expect(sidebarExpand).toBeVisible();
    await sidebarExpand.click();
    await expect(page.getByRole('button', { name: '사이드바 접기' })).toBeVisible();

    const collapse = bar.getByRole('button', { name: '페이지 필터 접기' });
    await collapse.click();
    const expand = bar.getByRole('button', { name: '페이지 필터 펼치기' });
    await expect(expand).toBeFocused();
    await evidence(page, testInfo, 'page-filter-collapsed-summary');

    type Rect = { left: number; top: number; right: number; bottom: number };
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate((raw: string) => {
      const button = [...document.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === '페이지 필터 펼치기');
      const summaryId = button?.getAttribute('aria-describedby');
      const summary = summaryId ? document.getElementById(summaryId) : null;
      if (!button || !summary) throw new Error('접힘 요약 버튼이나 요약 span을 찾지 못했다');
      const box = button.getBoundingClientRect();
      const rectsOf = (node: Node): Rect[] => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return [...range.getClientRects()]
          .filter(r => r.width > 0 && r.height > 0)
          .map(r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }));
      };
      // 세로로 겹치는 rect를 한 밴드로 묶어 시각 줄 수를 센다.
      const bandCount = (rects: Rect[]) => {
        const bands: Rect[] = [];
        for (const r of [...rects].sort((a, b) => a.top - b.top)) {
          const band = bands.find(x => r.top < x.bottom - 0.5 && r.bottom > x.top + 0.5);
          if (band) {
            band.top = Math.min(band.top, r.top);
            band.bottom = Math.max(band.bottom, r.bottom);
          } else bands.push({ ...r });
        }
        return bands.length;
      };
      // (a)용 자료: 요약 전체 rect(텍스트 조각 + 항목 inline-block 박스). 줄 계산에는 쓰지 않는다(F1).
      const elementRects = rectsOf(summary);
      // (d)·(e)용 자료: 요약 안 텍스트 노드만 글자 단위 Range로 측정한다 — 항목 박스가 줄에 섞이지 않는다.
      const chars: { char: string; left: number; top: number; bottom: number }[] = [];
      let valueLines = 0;
      const walker = document.createTreeWalker(summary, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? '';
        if (text.includes(raw)) valueLines = bandCount(rectsOf(node));
        let offset = 0;
        for (const ch of text) {
          const range = document.createRange();
          range.setStart(node, offset);
          range.setEnd(node, offset + ch.length);
          for (const rect of range.getClientRects()) {
            if (rect.width > 0 && rect.height > 0) chars.push({ char: ch, left: rect.left, top: rect.top, bottom: rect.bottom });
          }
          offset += ch.length;
        }
      }
      // 글자 rect를 y 겹침으로 시각 줄로 묶는다. 줄 시작 x = 그 줄 글자 rect의 최소 left.
      const lines: { left: number; top: number; bottom: number; chars: { char: string; left: number }[] }[] = [];
      for (const c of [...chars].sort((a, b) => a.top - b.top)) {
        let line = lines.find(l => c.top < l.bottom - 0.5 && c.bottom > l.top + 0.5);
        if (!line) {
          line = { left: c.left, top: c.top, bottom: c.bottom, chars: [] };
          lines.push(line);
        }
        line.left = Math.min(line.left, c.left);
        line.chars.push({ char: c.char, left: c.left });
      }
      lines.sort((a, b) => a.top - b.top);
      for (const line of lines) line.chars.sort((a, b) => a.left - b.left);
      // 요약을 자를 수 있는 범위: 요약 span과 그 자손 전부 + 버튼과 그 조상(F2).
      const scoped = new Set<HTMLElement>([summary, ...summary.querySelectorAll<HTMLElement>('*')]);
      for (let el: HTMLElement | null = button; el; el = el.parentElement) scoped.add(el);
      const cutting: string[] = [];
      for (const el of scoped) {
        const s = getComputedStyle(el);
        const clipped = (['hidden', 'clip'].includes(s.overflowX) || ['hidden', 'clip'].includes(s.overflowY))
          && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
        if (s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none' || clipped) cutting.push(`${el.tagName.toLowerCase()}.${el.className}`);
      }
      return {
        button: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
        elementRects, lines, cutting, valueLines,
        scrollWidth: button.scrollWidth, clientWidth: button.clientWidth,
        docScrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
        summaryText: summary.textContent ?? '',
      };
    }, longRaw);

    // (a) 요약의 모든 조각(텍스트·항목 박스)이 버튼 박스 안(1px 허용) — 밖으로 나간 글자가 없다.
    expect(m.elementRects.length).toBeGreaterThan(0);
    for (const r of m.elementRects) {
      expect(r.left).toBeGreaterThanOrEqual(m.button.left - 1);
      expect(r.right).toBeLessThanOrEqual(m.button.right + 1);
      expect(r.top).toBeGreaterThanOrEqual(m.button.top - 1);
      expect(r.bottom).toBeLessThanOrEqual(m.button.bottom + 1);
    }
    // (b) 요약이 버튼 폭을 넘지 않고 페이지에도 수평 넘침이 없다.
    expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
    expect(m.docScrollWidth).toBeLessThanOrEqual(m.innerWidth);
    // (c) 요약·자손·버튼·조상 어디에도 말줄임·line-clamp·실제 잘림(hidden/clip에서 scroll이 client를 넘음)이 없다.
    expect(m.cutting).toEqual([]);
    // (d) 요약이 두 줄 이상이고, 모든 시각 줄(텍스트 기준)의 시작 x가 같다(왼쪽 정렬, 1px 허용).
    expect(m.lines.length).toBeGreaterThanOrEqual(2);
    for (const line of m.lines) expect(Math.abs(line.left - m.lines[0]!.left)).toBeLessThanOrEqual(1);
    // (e) 각 줄의 첫 비공백 글자(그 줄에서 가장 왼쪽 글자 rect의 문자)는 구분점이 아니다 — 구분점은 앞 항목 끝에 붙는다.
    for (const line of m.lines) {
      const first = line.chars.find(c => /\S/.test(c.char));
      expect(first, `줄의 첫 글자를 찾지 못했다: ${line.chars.slice(0, 8).map(c => c.char).join('')}`).toBeDefined();
      expect(first!.char).not.toBe('·');
    }
    // 긴 원문 값 자체도 요약 폭 안에서 감긴다(그 값 텍스트 노드의 시각 줄 2개 이상).
    expect(m.valueLines).toBeGreaterThanOrEqual(2);
    // (f) 긴 원문 전체가 라벨과 함께 요약 텍스트에 있다. (원문 보존 문구는 #304에서 '이 화면에서 쓸 수 없는 값'으로 바뀌었다.)
    expect(m.summaryText).toContain(`느린 실행 기준 이 화면에서 쓸 수 없는 값: ${longRaw}`);

    // 키보드: 요약 버튼에서 Enter → 펼쳐지고 포커스는 접기 토글로 이동한다.
    await expand.press('Enter');
    await expect(collapse).toBeVisible();
    await expect(collapse).toHaveAttribute('aria-expanded', 'true');
    await expect(bar.getByRole('combobox', { name: '느린 실행 기준' })).toBeVisible();
    await expect(bar.getByRole('combobox', { name: '정렬' })).toBeVisible();
    await expect(collapse).toBeFocused();

    // 접힘 기억과 사이드바 상태는 storage state 없이 context마다 격리되지만, 테스트가 남긴 키를 지워 기본값으로 끝낸다.
    await page.evaluate(() => {
      localStorage.removeItem('platform:page-filter-collapsed:cycle-time');
      localStorage.removeItem('platform:page-head-collapsed:cycle-time');
      localStorage.removeItem('platform:sidebar-collapsed');
    });
  });
});

test.describe('공통 상태 화면 (06 §19)', () => {
  const EQUIPMENT = '/mars/equipment-master?v=1&scopeId=MEM';
  for (const { scenario, title, retry } of [
    { scenario: '서버 오류 (error)', title: '데이터를 불러오지 못했습니다', retry: true },
    { scenario: '시간 초과 (timeout)', title: '조회 시간이 초과되었습니다', retry: true },
    { scenario: '0건 (empty)', title: '조건에 맞는 결과가 없습니다', retry: false },
    { scenario: '권한 거부 (forbidden)', title: '이 Scope에 접근 권한이 없습니다', retry: false },
  ]) {
    test(`${scenario} → "${title}"`, async ({ page }, testInfo) => {
      await page.goto(EQUIPMENT);
      await expect(page.getByRole('table')).toBeVisible();
      await setScenario(page, scenario);
      const state = page.getByRole('main').getByText(title);
      await expect(state).toBeVisible();
      await expect(page.getByRole('table')).toHaveCount(0);
      if (retry) await expect(page.getByRole('main').getByRole('button', { name: '다시 시도' })).toBeVisible();
      await evidence(page, testInfo, scenario);
    });
  }
});

test.describe('공유 위젯 응답 (06 §19, #55)', () => {
  test('생산성의 같은 오류 네 개는 배너 하나와 이름 있는 간결 상태 네 개로 표시한다', async ({ page }, testInfo) => {
    await page.goto('/mars/productivity-overview?v=1&scopeId=MEM');
    await expect(page.getByRole('heading', { name: '네 지표 요약' })).toBeVisible();
    await setScenario(page, '서버 오류 (error)');
    const main = page.getByRole('main');
    const banner = main.getByRole('group', { name: '위젯 상태 요약' });
    await expect(main.locator('[data-outcome-banner]')).toHaveCount(1);
    await expect(banner).toContainText('위젯 4개에서 같은 응답(서버 오류)이 확인되었습니다.');
    await expect(banner.getByText('데이터를 불러오지 못했습니다')).toBeVisible();
    await expect(banner.getByRole('button', { name: '다시 시도' })).toHaveCount(1);
    await expect(banner).not.toContainText('Correlation ID');
    await expect(main.locator('[data-widget-state]')).toHaveCount(4);
    for (const name of ['네 지표 요약', 'Job 처리량 추세', '점유 구성', '확인할 항목']) {
      const state = main.getByRole('group', { name, exact: true });
      await expect(state).toBeVisible();
      await expect(state.getByText('데이터를 불러오지 못했습니다')).toBeVisible();
      await expect(state.getByRole('button', { name: '다시 시도' })).toHaveCount(1);
      await expect(state).toContainText('corr-');
    }
    await expect(main.getByRole('alert')).toHaveCount(0);
    await expect(main.locator('[data-outcome-announcer="assertive"]')).toContainText('위젯 4개에서 같은 응답');
    await expect(main.getByText('네 지표 요약', { exact: true })).toHaveCount(1);
    await evidence(page, testInfo, 'shared-error-banner');
  });

  test('일부 위젯 실패에서 단일 실패는 배너 없이 전체 상태를 유지한다', async ({ page }, testInfo) => {
    // The scenario fails every other query. Equipment detail has two queries;
    // productivity has four and therefore intentionally groups its two equal failures.
    await page.goto('/mars/equipment-detail/MEM-PHOTO-0103?v=1&scopeId=MEM');
    const loadedHeader = page.getByRole('main').locator('[data-platform-page-content] > [aria-busy]');
    const loadedPanel = page.getByRole('tabpanel');
    await expect(loadedHeader.getByText('MEM-PHOTO-0103')).toBeVisible();
    await expect(loadedPanel.getByText('MEM-PHOTO-0103')).toBeVisible();
    await setScenario(page, '일부 위젯 실패');
    const main = page.getByRole('main');
    await expect(main.getByRole('alert')).toHaveCount(1);
    await expect(main.getByRole('alert')).toContainText('위젯 쿼리가 실패했습니다(부분 실패 시나리오)');
    await expect(main.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(main.locator('[data-outcome-banner]')).toHaveCount(0);
    await expect(main.locator('[data-widget-state]')).toHaveCount(0);
    await expect(main.getByRole('button', { name: '다시 시도' })).toHaveCount(1);
    await evidence(page, testInfo, 'single-widget-failure');
  });
});

// 사이클타임은 3b에서 PanelWorkspace로 옮겨 갔다. 차트 2개가 한 행에 서는 정렬 검사는 AnalysisLayout 소비자(차트 2개 이상)가 없어
// 내렸다(.planning/backlog.md). 접기·칩·기억·포커스는 남은 소비자인 OperationTime으로 검사한다.
test.describe('분석 레이아웃 접기 (06 §12.6, ADR-0022)', () => {
  test('접힌 차트·분해 영역을 기억하여 칩으로 복원하고 포커스를 옮긴다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/clas/operation-time?v=1&scopeId=MEM&roomNames=PHOTO&${PERIOD}`);
    const ranking = page.getByRole('region', { name: '설비별 동작시간', exact: true });
    await expect(ranking).toBeVisible();
    const collapsed = page.getByRole('group', { name: '접힌 항목' });
    await expect(collapsed).toHaveCount(0);

    await page.getByRole('button', { name: '설비별 동작시간 접기' }).click();
    const rankingChip = collapsed.getByRole('button', { name: '설비별 동작시간 펼치기' });
    await expect(rankingChip).toBeVisible();
    await expect(rankingChip).toBeFocused();
    await expect(ranking).toHaveCount(0);
    await evidence(page, testInfo, 'analysis-ranking-collapsed');
    await page.reload();
    await expect(rankingChip).toBeVisible();
    await expect(ranking).toHaveCount(0);
    await evidence(page, testInfo, 'analysis-collapse-persisted');

    await rankingChip.click();
    await expect(page.getByRole('button', { name: '설비별 동작시간 접기' })).toBeFocused();
    await expect(ranking).toBeVisible();
    await expect(collapsed).toHaveCount(0);
    await evidence(page, testInfo, 'analysis-ranking-restored');

    // The breakdown's title carries the equipment id, so match its fixed tail.
    await page.getByRole('button', { name: /모듈별 동작 흐름 접기$/ }).click();
    const flowChip = collapsed.getByRole('button', { name: /모듈별 동작 흐름 펼치기$/ });
    await expect(flowChip).toBeFocused();
    await expect(page.getByRole('button', { name: /모듈별 동작 흐름 접기$/ })).toHaveCount(0);
    await evidence(page, testInfo, 'analysis-breakdown-collapsed');
    await flowChip.click();
    await expect(page.getByRole('button', { name: /모듈별 동작 흐름 접기$/ })).toBeFocused();
    await expect(collapsed).toHaveCount(0);
    await evidence(page, testInfo, 'analysis-breakdown-restored');
  });
});

test.describe('키보드 상세 포커스 복귀 (06 §13·§26)', () => {
  test('권한 목록에서 키보드로 상세를 닫으면 같은 행의 보기로 돌아온다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/operations/admin-roles?v=1');
    try {
      const opener = page.getByRole('row').filter({ has: page.getByRole('button', { name: /보기$/ }) }).first().getByRole('button', { name: /보기$/ });
      await expect(opener).toBeVisible();
      // Reach the action through the keyboard, then activate it without a pointer click.
      for (let attempt = 0; attempt < 100 && !(await opener.evaluate(node => node === document.activeElement)); attempt++) await page.keyboard.press('Tab');
      await expect(opener).toBeFocused();
      await opener.evaluate(node => node.setAttribute('data-focus-return-opener', 'true'));
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: '상세 닫기' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page).toHaveURL(url => !url.searchParams.has('focus'));
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const sameOpener = page.locator('[data-focus-return-opener]');
      await expect(sameOpener).toHaveCount(1);
      expect(await sameOpener.evaluate(node => node.isConnected)).toBe(true);
      await expect(sameOpener).toBeFocused();
      await evidence(page, testInfo, 'roles-keyboard-focus-return');
    } catch (error) {
      const focusState = await page.evaluate(() => {
        const active = document.activeElement;
        return {
          activeElement: active ? { tag: active.tagName, id: active.id, role: active.getAttribute('role'), label: active.getAttribute('aria-label'), text: active.textContent?.slice(0, 200), connected: active.isConnected } : null,
          hasFocus: document.hasFocus(),
          url: location.href,
          focusKey: new URLSearchParams(location.search).get('focus'),
          detailSlots: Array.from(document.querySelectorAll('aside[aria-label]')).map(slot => ({ label: slot.getAttribute('aria-label'), open: slot.getAttribute('data-open'), hidden: slot.hasAttribute('hidden'), dialogs: slot.querySelectorAll('[role="dialog"]').length })),
          marker: Array.from(document.querySelectorAll('[data-focus-return-opener]')).map(node => ({ connected: node.isConnected, focused: node === active })),
        };
      });
      await testInfo.attach('roles-keyboard-focus-state', { body: JSON.stringify(focusState, null, 2), contentType: 'application/json' });
      throw error;
    }
  });

  // #312: a closing overlay kept mounted by its exit motion stayed the topmost Radix layer and took the next Escape.
  const closeOverlay: Record<string, (page: Page) => Promise<void>> = {
    '툴팁이': async page => {
      await page.getByRole('heading', { level: 1 }).focus();
      await expect(page.getByRole('tooltip')).toHaveCount(1);
    },
    '팝오버가': async page => {
      const trigger = page.getByRole('button', { name: /컬럼|열 설정/ }).first();
      await trigger.click();
      await expect(page.locator('[data-radix-popper-content-wrapper]').first()).toBeVisible();
      await trigger.click();
    },
    '대화상자가': async page => {
      await page.getByRole('button', { name: '메뉴 검색…' }).click();
      await expect(page.getByRole('combobox')).toBeFocused();
      await page.getByRole('button', { name: '닫기' }).click();
    },
  };
  for (const [overlay, close] of Object.entries(closeOverlay)) {
    test(`${overlay} 닫힌 직후의 Escape도 상세를 닫는다`, async ({ page }) => {
      await signInAs(page, 'admin');
      await page.goto('/operations/admin-roles?v=1');
      const opener = page.getByRole('row').filter({ has: page.getByRole('button', { name: /보기$/ }) }).first().getByRole('button', { name: /보기$/ });
      await expect(opener).toBeVisible();
      await close(page);
      // Radix hands focus back to the closed overlay's trigger in a deferred task (FocusScope unmount, setTimeout 0).
      // Let that task run first; under load it otherwise lands after opener.focus() and Enter reopens the overlay.
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
      await opener.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: '상세 닫기' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page).toHaveURL(url => !url.searchParams.has('focus'), { timeout: 2000 });
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  }
});

test.describe('표 쪽 이동 포커스 (06 §26)', () => {
  test('범위 밖 page 딥링크는 마지막 쪽으로 맞추고 히스토리를 늘리지 않는다 (06 §15, #314)', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM&sort=status:desc&page=9');
    await expect.poll(() => query(page).get('page')).toBe('3');
    expect(query(page).get('sort')).toBe('status:desc');
    await expect(tableStatusLine(page)).toContainText('54건 · 3/3 페이지');
    await expect(page.getByRole('main').locator('[data-row-id]').first()).toBeVisible();
    await evidence(page, testInfo, 'table-page-clamped');
    // replace, not push: one Back leaves the app instead of returning to page=9.
    await page.goBack();
    await expect(page).toHaveURL('about:blank');
  });

  test('마지막 쪽과 첫 쪽에 도달하면 반대쪽 버튼으로 포커스를 옮긴다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
    await expect(page.getByText(/1\/2 페이지/)).toBeVisible();
    const next = page.getByRole('button', { name: '다음', exact: true });
    const previous = page.getByRole('button', { name: '이전', exact: true });
    await expect(next).not.toHaveAttribute('aria-disabled');
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/2\/2 페이지/)).toBeVisible();
    await expect(previous).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/1\/2 페이지/)).toBeVisible();
    await expect(next).toBeFocused();
    await evidence(page, testInfo, 'pager-focus-return');
  });
});

test.describe('표 높이·고정 동작 열 (06 §15, ADR-0037)', () => {
  // #654: the old subject (`/voc` MyVocHistory table) moved to the VOC feature; the short-result case now uses a narrowed equipment table.
  test('짧은 설비 결과는 240px보다 작고 행 영역에 빈 스크롤이 없다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM&q=PHOTO-0103');
    const rows = page.getByLabel('스크롤 가능한 행 영역', { exact: true });
    await expect(rows.getByRole('button', { name: /보기$/ }).first()).toBeVisible();
    await expect.poll(() => rows.evaluate(el => el.clientHeight)).toBeGreaterThan(0);
    await expect.poll(() => rows.evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(240);
    await expect.poll(() => rows.evaluate(el => el.scrollHeight - el.clientHeight)).toBe(0);
    await evidence(page, testInfo, 'equipment-short-content-height');
  });

  test('긴 설비 결과는 안쪽에서 스크롤하고 쪽 넘김은 화면 안에 있다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
    const rows = page.getByLabel('스크롤 가능한 행 영역', { exact: true });
    await expect(rows.getByRole('button', { name: /보기$/ }).first()).toBeVisible();
    await expect.poll(() => rows.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0);
    const next = page.getByRole('button', { name: '다음', exact: true });
    await expect.poll(() => next.evaluate(el => {
      const box = el.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= window.innerHeight;
    })).toBe(true);
    await evidence(page, testInfo, 'equipment-cap-pager');
  });

  test('1280px에서 상세를 열어도 본문은 넘치지 않고 건수는 한 줄이다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
    const rows = page.getByLabel('스크롤 가능한 행 영역', { exact: true });
    await rows.getByRole('button', { name: /보기$/ }).first().click();
    await expect(page.getByRole('button', { name: '상세 닫기', exact: true })).toBeVisible();
    await expect.poll(() => page.locator('#platform-main').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    const count = page.getByText(/^\d+건 · \d+\/\d+ 페이지$/);
    await expect(count).toBeVisible();
    await expect.poll(() => count.evaluate(el => {
      const range = document.createRange(); range.selectNodeContents(el);
      return new Set([...range.getClientRects()].map(box => box.top)).size;
    })).toBe(1);
    await evidence(page, testInfo, 'equipment-detail-1280');
  });

  test('감사 표는 선택 열 없이 양쪽 스크롤 끝에서도 첫 상세 링크가 보인다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAs(page, 'admin');
    await page.goto('/operations/admin-audit?v=1');
    const rows = page.getByLabel('스크롤 가능한 행 영역', { exact: true });
    const table = rows.getByRole('table');
    const detail = table.getByRole('row').filter({ has: page.getByRole('link', { name: /상세$/ }) }).first().getByRole('link', { name: /상세$/ });
    await expect(detail).toBeVisible();
    await expect(table.getByRole('checkbox')).toHaveCount(0);
    await expect.poll(() => rows.evaluate(el => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0);
    for (const end of ['right', 'left'] as const) {
      await rows.evaluate((el, side) => { el.scrollLeft = side === 'right' ? el.scrollWidth : 0; }, end);
      await expect.poll(() => rows.evaluate((el, side) => side === 'right'
        ? Math.abs(el.scrollWidth - el.clientWidth - el.scrollLeft) <= 1 : el.scrollLeft === 0, end)).toBe(true);
      await expect.poll(() => detail.evaluate(el => {
        const viewport = el.closest('[aria-label="스크롤 가능한 행 영역"]');
        if (!viewport) return false;
        const frame = viewport.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        const left = frame.left + viewport.clientLeft, top = frame.top + viewport.clientTop;
        return box.left >= left && box.right <= left + viewport.clientWidth && box.top >= top && box.bottom <= top + viewport.clientHeight;
      })).toBe(true);
      await evidence(page, testInfo, `audit-action-${end}`);
    }
  });

  // #399 AC-3: at 1024 with the expanded sidebar and the docked detail panel the scrollport is ~226px, so the full 128px
  // action column cannot stay pinned; the compact 72px icon form stays pinned and still opens the row's drawer.
  test('1024px 펼친 사이드바·상세 패널에서 동작 열은 72px 아이콘으로 고정되고 눌린다 (#399)', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await signInAs(page, 'admin');
    await page.addInitScript(() => localStorage.setItem('platform:sidebar-collapsed', '0'));
    await page.goto('/operations/admin-roles?v=1');
    await expect(page.getByRole('button', { name: '사이드바 접기' })).toBeVisible();
    const rows = page.getByLabel('스크롤 가능한 행 영역', { exact: true });
    const firstOpen = rows.getByRole('button', { name: / 보기$/ }).first();
    await expect(firstOpen).toBeVisible();
    const id = (await firstOpen.getAttribute('aria-label'))!.replace(/ 보기$/, '');
    await page.goto(`/operations/admin-roles?v=1&focus=${encodeURIComponent(id)}`);
    await expect(page.getByRole('button', { name: '상세 닫기', exact: true })).toBeVisible();
    const open = rows.getByRole('button', { name: `${id} 보기`, exact: true });
    await expect(open).toBeVisible();
    const cell = open.locator('xpath=ancestor::*[@role="cell"][1]');
    await expect.poll(() => cell.evaluate(el => getComputedStyle(el).position)).toBe('sticky');
    await expect.poll(() => cell.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBeGreaterThanOrEqual(71);
    await expect.poll(() => cell.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBeLessThanOrEqual(73);
    await evidence(page, testInfo, 'roles-compact-action-1024');
    // Keep the dock open: the table stays compact. Activating another row's compact action switches the drawer to that row.
    const other = rows.getByRole('button', { name: / 보기$/ }).nth(1); // row A (`id`) is the first row
    await expect(other).toBeVisible();
    const otherName = (await other.getAttribute('aria-label'))!;
    const otherId = otherName.replace(/ 보기$/, '');
    const otherCell = other.locator('xpath=ancestor::*[@role="cell"][1]');
    expect(Math.round(await otherCell.evaluate(el => el.getBoundingClientRect().width))).toBeLessThanOrEqual(73);
    await other.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`focus=${encodeURIComponent(otherId)}`));
    // Escape closes the dock; the table widens and the same action node, now in its full text form, keeps the focus.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '상세 닫기', exact: true })).toHaveCount(0);
    await expect.poll(() => otherCell.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBeGreaterThanOrEqual(127);
    const restored = rows.getByRole('button', { name: otherName, exact: true });
    await expect(restored).toHaveText('보기');
    await expect(restored).toBeFocused();
  });
});

// #556a (ADR-0024 amendment): the Columns popover reorders columns; the header, the saved preference and reset follow.
test.describe('표 고급 기능 (#556)', () => {
  test('컬럼 팝오버에서 열을 아래로 옮기면 머리 순서가 바뀌고 새로고침 뒤에도 남으며 기본값으로 되돌린다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
    const headers = page.locator('[role="columnheader"][data-column]:not([data-column^="_"])');
    await expect(headers.first()).toBeVisible();
    const declared = await headers.evaluateAll(els => els.map(el => el.getAttribute('data-column')));
    expect(declared.length).toBeGreaterThan(2);
    const moved = [declared[1], declared[0], ...declared.slice(2)];
    const open = async () => {
      await page.getByRole('button', { name: '컬럼', exact: true }).click();
      return page.getByRole('dialog');
    };
    let popover = await open();
    await popover.locator('[data-column-pref-row]').first().getByRole('button', { name: /아래로$/ }).click();
    await expect.poll(() => headers.evaluateAll(els => els.map(el => el.getAttribute('data-column')))).toEqual(moved);
    await evidence(page, testInfo, 'column-order-moved');
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(headers.first()).toBeVisible();
    await expect.poll(() => headers.evaluateAll(els => els.map(el => el.getAttribute('data-column')))).toEqual(moved);
    popover = await open();
    await popover.getByRole('button', { name: '기본값으로' }).click();
    await expect.poll(() => headers.evaluateAll(els => els.map(el => el.getAttribute('data-column')))).toEqual(declared);
  });
});

// #680 (ADR-0075): a fill page's head (notes + page filter + chips) folds to one line; shared responses become a thin strip.
test.describe('페이지 머리 접기 (#680)', () => {
  const CYCLE = `/mars/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&${PERIOD}`;
  const HEAD_KEY = 'platform:page-head-collapsed:cycle-time';
  /** Upper bound of the workspace top (px) at 1440×900 with the query bar and the page head collapsed: measured 230.8 (315 before #680), plus 9px for font metrics on CI. */
  const COLLAPSED_WORKSPACE_TOP_MAX = 240;
  const line = (page: Page) => page.locator('[data-page-head-line]');
  const workspaceTop = async (page: Page) => (await page.locator('[data-panel-workspace]').boundingBox())!.y;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('platform:e2e-head-reset')) return;
      localStorage.removeItem('platform:page-head-collapsed:cycle-time');
      localStorage.removeItem('platform:page-filter-collapsed:cycle-time');
      localStorage.removeItem('platform:query-bar-collapsed:cycle-time');
      sessionStorage.setItem('platform:e2e-head-reset', '1');
    });
  });

  test('fill 페이지는 접힌 채 시작하고, 조회 조건까지 접으면 작업 영역이 위쪽 한계 안에서 시작한다', async ({ page }, testInfo) => {
    await page.goto(CYCLE);
    await expect(line(page)).toBeVisible();
    await expect(page.getByRole('button', { name: '페이지 머리 펼치기' })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('page-filter-bar')).toBeHidden();
    await page.getByRole('button', { name: '조회 조건 접기' }).click();
    await expect(page.locator('[data-panel-workspace]')).toBeVisible();
    await expect.poll(() => workspaceTop(page)).toBeLessThanOrEqual(COLLAPSED_WORKSPACE_TOP_MAX);
    await evidence(page, testInfo, 'page-head-collapsed-1440x900');
  });

  test('펼침·접힘은 새로고침 뒤에도 유지된다', async ({ page }) => {
    await page.goto(CYCLE);
    await page.getByRole('button', { name: '페이지 머리 펼치기' }).click();
    await expect(page.getByRole('button', { name: '페이지 머리 접기' })).toBeFocused();
    await expect(page.getByTestId('page-filter-bar')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('page-filter-bar')).toBeVisible();
    await page.getByRole('button', { name: '페이지 머리 접기' }).click();
    await expect(page.getByRole('button', { name: '페이지 머리 펼치기' })).toBeFocused();
    await page.reload();
    await expect(page.getByRole('button', { name: '페이지 머리 펼치기' })).toBeVisible();
    await expect(page.getByTestId('page-filter-bar')).toBeHidden();
  });

  test('서버 오류 응답은 얇은 띠로 뜨고 #platform-main이 스크롤되지 않는다', async ({ page }, testInfo) => {
    await page.goto(CYCLE);
    await expect(page.locator('[data-panel-workspace]')).toBeVisible();
    await page.getByRole('button', { name: '조회 조건 접기' }).click();
    await setScenario(page, '서버 오류 (error)');
    const strip = page.getByRole('main').locator('[data-outcome-banner]');
    await expect(strip).toHaveCount(1);
    await expect(strip).toHaveAttribute('data-outcome-compact', 'true');
    await expect(strip).toContainText('서버 오류 ·');
    await expect(strip.getByRole('button', { name: '자세히' })).toBeVisible();
    await expect(strip.getByRole('button', { name: '다시 시도' })).toBeVisible();
    expect(await page.locator('#platform-main').evaluate(element => element.scrollHeight > element.clientHeight + 1)).toBe(false);
    await evidence(page, testInfo, 'page-head-thin-strip-1440x900');
  });

  test('접힌 줄에 적용된 버킷 칩이 보이고, 초안 페이지 조건은 미적용 표식으로 남는다', async ({ page }) => {
    await page.goto(`${CYCLE}&bucket=2026-09-25T09:00:00`);
    await expect(line(page)).toContainText('버킷');
    await expect(line(page)).not.toContainText('미적용 변경 있음');
    await page.getByRole('button', { name: '페이지 머리 펼치기' }).click();
    await page.getByRole('button', { name: '주', exact: true }).click();
    await page.getByRole('button', { name: '페이지 머리 접기' }).click();
    await expect(line(page)).toContainText('미적용 변경 있음');
    await expect(line(page)).toContainText('버킷');
  });

  test('틀린 페이지 키(granularity)면 저장값과 무관하게 펼친 채 시작하고 페이지 조건 기본값이 보인다', async ({ page }) => {
    await page.addInitScript(key => { if (!sessionStorage.getItem('platform:e2e-head-seeded')) { localStorage.setItem(key, 'true'); sessionStorage.setItem('platform:e2e-head-seeded', '1'); } }, HEAD_KEY);
    await page.goto(`${CYCLE}&granularity=zzz`);
    await expect(page.getByRole('button', { name: '페이지 머리 접기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '페이지 조건 기본값' })).toBeVisible();
    await expect(page.getByRole('alert')).toBeVisible();
  });
});

