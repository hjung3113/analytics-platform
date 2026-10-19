#!/usr/bin/env node
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat, realpath } from "node:fs/promises";
import { resolve, dirname, join, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!["--demo", "--out"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--"))
    throw new Error("사용법: node site/scripts/shots.mjs --demo <dist> --out <새 dir>");
  options[args[i].slice(2)] = resolve(args[i + 1]);
}
if (!options.demo || !options.out) throw new Error("--demo와 --out이 필요합니다.");
await stat(join(options.demo, "index.html"));
// Captures must never overwrite sources or reuse a partial capture manifest.
const outputParent = await realpath(dirname(options.out));
const physicalOut = join(outputParent, options.out.split("/").at(-1));
if (
  physicalOut !== join(root, "_shots") &&
  (!relative(root, physicalOut).startsWith("..") ||
    relative(physicalOut, root) === "" ||
    !relative(physicalOut, root).startsWith(".."))
)
  throw new Error("캡처 출력은 저장소 밖의 새 폴더를 지정하세요.");
await mkdir(options.out); // EEXIST is deliberate: a fresh run cannot publish stale shots.
const { chromium, expect } = createRequire(join(root, "apps/platform-e2e/package.json"))("@playwright/test");
const base = "/analytics-platform/demo/";
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (!pathname.startsWith(base)) {
      res.writeHead(404).end();
      return;
    }
    const path = resolve(options.demo, pathname.slice(base.length) || "index.html");
    if (relative(options.demo, path).startsWith("..")) {
      res.writeHead(403).end();
      return;
    }
    let body,
      extension = extname(path);
    try {
      body = await readFile(path);
    } catch {
      body = await readFile(join(options.demo, "index.html"));
      extension = ".html";
    }
    res.writeHead(200, { "Content-Type": mime[extension] || "application/octet-stream" });
    res.end(body);
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
});
await new Promise((done, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", done);
});
const origin = `http://127.0.0.1:${server.address().port}`;
const period = "v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&roomNames=PHOTO";
const productivity = `/analytics/productivity?${period}`;
const equipment = "/equipment?v=1&scopeId=MEM";
const manifest = [];
let browser;
let currentId = "browser-launch";
try {
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
    locale: "ko-KR",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const button = (name, parent = page) => parent.getByRole("button", { name, exact: true });
  const trend = () => page.getByRole("region", { name: "사이클타임 추세", exact: true });
  async function go(path) {
    await page.goto(origin + base.slice(0, -1) + path);
    await page.getByRole("main").getByRole("heading", { level: 1 }).waitFor();
    await expect(page.getByRole("main").locator('[aria-busy="true"]')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
  }
  async function readyChart(chart) {
    await chart.locator("canvas").waitFor();
    await expect(chart.getByRole("group", { name: "범례", exact: true })).toContainText("P50");
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  }
  async function cycle() {
    await go(`/analytics/cycle-time?${period}`);
    // 분포가 열려 있으면 접어 차트를 넓게 쓴다. 렌더 타이밍 때문에 isVisible 즉시
    // 확인은 누락될 수 있어, 짧은 대기 click으로 확인한다.
    try {
      await button("사이클타임 분포 접기").click({ timeout: 5000 });
    } catch {
      // 분포가 이미 접힌 화면이면 버튼이 없다.
    }
    await readyChart(trend());
  }
  // The shell header + GlobalContextBar are one sticky block that overlays
  // content scrolled beneath it. Captures hide it while shooting, restore after.
  // 표의 sticky 머리행까지 지우지 않게 셸 구조의 직계 sticky만 맞춘다.
  const hideChrome = (top) =>
    page.evaluate((limit) => {
      let hidden = 0;
      for (const el of document.querySelectorAll("main > div > .sticky, main > div > .fixed")) {
        if (el.clientHeight > 20 && el.getBoundingClientRect().bottom > limit) {
          el.style.visibility = "hidden";
          hidden += 1;
        }
      }
      return hidden;
    }, top);
  const restoreChrome = () =>
    page.evaluate(() => {
      for (const el of document.querySelectorAll("main > div > .sticky, main > div > .fixed"))
        if (el.style.visibility === "hidden") el.style.removeProperty("visibility");
    });
  // Keep the clip inside the viewport; Playwright rejects clips that leave it.
  const frame = (clip) => {
    const viewport = page.viewportSize();
    const x = Math.max(0, Math.round(clip.x));
    const y = Math.max(0, Math.round(clip.y));
    return {
      x,
      y,
      width: Math.max(1, Math.min(Math.round(clip.width), viewport.width - x)),
      height: Math.max(1, Math.min(Math.round(clip.height), viewport.height - y)),
    };
  };
  async function elementClip(locator, pad = 0) {
    await expect(locator).toBeVisible();
    await locator.scrollIntoViewIfNeeded();
    let box = await locator.boundingBox();
    if (box.y < 0) {
      await page.evaluate((top) => document.querySelector("main").scrollBy(0, top - 8), box.y);
      box = await locator.boundingBox();
    }
    return { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 };
  }
  // 팝오버·메뉴는 열린 직후 위치가 정착되기 전에 재므로 두 번 연결 같은 상자를 볼 때까지 기다린다.
  async function stableBox(locator) {
    let prev = await locator.boundingBox();
    for (let round = 0; round < 10; round += 1) {
      await page.waitForTimeout(120);
      const next = await locator.boundingBox();
      if (
        prev &&
        next &&
        Math.abs(prev.x - next.x) < 0.5 &&
        Math.abs(prev.y - next.y) < 0.5 &&
        Math.abs(prev.width - next.width) < 0.5 &&
        Math.abs(prev.height - next.height) < 0.5
      )
        return next;
      prev = next;
    }
    return prev;
  }
  async function unionClip(parts, pad = 0) {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = 0,
      y1 = 0;
    for (const part of parts) {
      const box = await stableBox(part);
      x0 = Math.min(x0, box.x);
      y0 = Math.min(y0, box.y);
      x1 = Math.max(x1, box.x + box.width);
      y1 = Math.max(y1, box.y + box.height);
    }
    return { x: x0 - pad, y: y0 - pad, width: x1 - x0 + pad * 2, height: y1 - y0 + pad * 2 };
  }
  // 전역 바는 찍을 대상이므로 sticky 숨김을 끈다.
  async function mainTopClip(height) {
    const box = await page.getByRole("main").boundingBox();
    return { clip: { x: box.x, y: box.y, width: box.width, height }, hideSticky: false, cover: true };
  }
  // 900px 고정 대신 내용 하단(마지막 패널 bottom + 여백)까지만 찍는다.
  async function mainContentClip() {
    const box = await page.getByRole("main").boundingBox();
    const bottom = await page.evaluate(() => {
      const main = document.querySelector("main");
      const inner = main.firstElementChild && main.firstElementChild.lastElementChild;
      const scan = inner || main;
      // flex 채움 래퍼가 화면을 다 채우므로 실제 내용 하단은 자식들에서 본다.
      let max = 0;
      for (const el of scan.children) {
        const b = el.getBoundingClientRect().bottom;
        if (b > max) max = b;
      }
      return max || scan.getBoundingClientRect().bottom;
    });
    return {
      clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, Math.ceil(bottom - box.y) + 8) },
      hideSticky: false,
    };
  }
  // 번호 위치: 캡처 영역 안에서 대상 요소의 왼쪽 위 안쪽 점을 %로 잰다. 못 찾은 번호는 건너뛴다.
  async function placeMarks(targets, area) {
    const marks = [];
    for (const [n, locate] of targets) {
      try {
        const box = await locate().first().boundingBox({ timeout: 3000 });
        if (!box) throw new Error("no box");
        const x = ((box.x + Math.min(14, box.width / 2) - area.x) / area.width) * 100;
        const y = ((box.y + Math.min(14, box.height / 2) - area.y) / area.height) * 100;
        if (x < 0 || x > 100 || y < 0 || y > 100) throw new Error("outside the capture");
        marks.push({ n, x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) });
      } catch (error) {
        console.warn(`  번호 ${n} 건너뜀: ${String(error.message).split("\n")[0]}`);
      }
    }
    return marks;
  }
  async function capture(id, title, description, group, action, plan, cards = [], targets = null) {
    currentId = id;
    await action();
    const planned = await plan();
    // 상호작용 뒤 처음 나온 글자의 Pretendard 조각(unicode-range)이 늦게 오면 대체 글꼴로 찍힌다.
    await page.evaluate(() => document.fonts.ready);
    const { clip = planned, cover = false, hideSticky = true } = planned.clip ? planned : {};
    const area = frame(clip);
    const marks = targets ? await placeMarks(targets, area) : [];
    if (hideSticky) await hideChrome(area.y);
    const png = await page.screenshot({ clip: area, animations: "disabled", caret: "hide", scale: "device" });
    if (hideSticky) await restoreChrome();
    if (png.length < 10 * 1024) throw new Error(`캡처가 비어 있을 수 있습니다(${(png.length / 1024).toFixed(1)} KB)`);
    await writeFile(join(options.out, `${id}.png`), png);
    manifest.push({
      id,
      title,
      description,
      group,
      path: new URL(page.url()).pathname.slice(base.length - 1) + new URL(page.url()).search,
      width: area.width,
      height: area.height,
      // PNG 픽셀은 DPR2이고 width·height는 CSS px이다.
      scale: 2,
      ...(cover ? { fit: "cover-top" } : {}),
      cards,
      ...(marks.length ? { marks } : {}),
    });
    console.log(`${id}: ${area.width}×${area.height}, ${(png.length / 1024).toFixed(1)} KB`);
  }
  await capture(
    "chart-trend",
    "AnalysisChartFrame · 기본 추이",
    "P50·P95 선, 툴바와 범례를 함께 봅니다.",
    "charts",
    cycle,
    () => elementClip(trend()),
    ["C1"],
  );
  await capture(
    "chart-compare",
    "AnalysisChartFrame · 이전 기간 비교",
    "이전 동일 기간을 같은 시간 축에 함께 봅니다.",
    "charts",
    async () => {
      await cycle();
      await button("비교", trend()).click();
      await expect(trend().getByRole("group", { name: "범례", exact: true })).toContainText("P50 이전 기간");
    },
    () => elementClip(trend()),
  );
  const annotateButton = () => button("주석", trend());
  // 브러시 저장이 잠시 뒤 정리되는 타이밍이 있어, 주석이 필요하면 드래그 직후 바로
  // 연다. 정리되었으면 다시 드래그한다.
  async function brush(openAnnotate = false) {
    await cycle();
    await button("구간 선택", trend()).click();
    const canvas = trend().getByRole("img", { name: /^사이클타임 추세/ });
    await canvas.scrollIntoViewIfNeeded();
    for (let attempt = 0; ; attempt += 1) {
      if (attempt === 5) throw new Error("구간 선택이 안정적으로 만들어지지 않습니다");
      const box = await canvas.boundingBox();
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.45);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.45, { steps: 20 });
      await page.mouse.up();
      try {
        if (openAnnotate) await annotateButton().click({ timeout: 2000 });
        else await expect(button("분석 구간 적용…", trend())).toBeVisible({ timeout: 2000 });
        return;
      } catch {
        // 선택이 정리되었으면 다시 드래그한다.
      }
    }
  }
  await capture(
    "chart-brush",
    "AnalysisChartFrame · 구간 선택",
    "드래그한 구간의 건수·평균·최댓값을 봅니다.",
    "charts",
    trend,
    async () => {
      await brush();
      return elementClip(trend());
    },
  );
  await capture(
    "chart-zoom",
    "AnalysisChartFrame · 확대",
    "툴바로 시간 축의 가운데 구간을 확대합니다.",
    "charts",
    async () => {
      await cycle();
      await button("확대", trend()).click();
    },
    () => elementClip(trend()),
  );
  await capture(
    "chart-annotate",
    "AnalysisChartFrame · 주석",
    "구간에 주석을 저장하면 차트와 목록에 남습니다.",
    "charts",
    async () => {
      await brush(true);
      await page.getByRole("textbox", { name: "주석 내용" }).fill("예시: PM 작업 구간");
      await button("저장", trend()).click();
      await expect(trend().getByRole("list")).toContainText("예시: PM 작업 구간");
      // brush 선택 라벨이 주석 라벨과 겹치지 않게 선택을 지운다. 저장된 주석은 유지된다.
      await button("지우기", trend()).click();
      await expect(button("분석 구간 적용…", trend())).toHaveCount(0);
    },
    () => elementClip(trend()),
  );
  await capture(
    "chart-bar",
    "AnalysisChartFrame · 막대 추세",
    "완료 Job 수를 0축 막대로 봅니다(합성 데이터라 버킷값이 같습니다).",
    "charts",
    async () => {
      await go(productivity);
      await button(/^Job 처리량/).click();
      await page.getByRole("region", { name: "Job 처리량 추세", exact: true }).locator("canvas").waitFor();
    },
    () => elementClip(page.getByRole("region", { name: "Job 처리량 추세", exact: true })),
  );
  await capture(
    "chart-table",
    "AnalysisChartFrame · 같은 데이터 표",
    "더보기에서 선 추이와 같은 데이터를 표로 펼칩니다.",
    "charts",
    async () => {
      await cycle();
      await button("더보기", trend()).click();
      await button("같은 데이터를 표로 보기").click();
      await page.keyboard.press("Escape");
      await expect(trend().getByRole("table")).toBeVisible();
      // 메뉴가 닫힌 뒤 트리거로 포커스가 돌아온 것을 확인하고 지운다. 닫힘 애니메이션
      // 뒤 복귀가 늦어 바로 지우면 링이 남는다.
      await page
        .waitForFunction(() => document.activeElement !== document.body, undefined, { timeout: 2000 })
        .catch(() => {});
      await page.evaluate(() => {
        const el = document.activeElement;
        if (el && el !== document.body && el.blur) el.blur();
      });
      await page.waitForFunction(() => document.activeElement === document.body);
      await page.mouse.move(0, 0);
    },
    () => elementClip(trend()),
  );
  await capture(
    "kpi",
    "StatCard · 네 지표 요약",
    "점유율·체류·사이클타임·처리량을 비교합니다.",
    "tables",
    async () => {
      await go(productivity);
      // 늦게 마운트되는 KPI 위젯의 스켈레톤이 남지 않았는지 값까지 확인한다.
      const kpi = page.getByRole("region", { name: "네 지표 요약" });
      await expect(kpi.locator('[role="status"][aria-busy]')).toHaveCount(0);
      await expect(kpi.locator(".t-stat").first()).toContainText(/\d/);
    },
    () => elementClip(page.getByRole("region", { name: "네 지표 요약" })),
    ["C10"],
  );
  const table = () => page.getByRole("region", { name: "설비 마스터 목록", exact: true });
  async function tableReady() {
    await go(equipment);
    await expect(table().getByRole("table")).toBeVisible();
    await expect(table().locator("[data-row-id]").first()).toBeVisible();
  }
  await capture(
    "table",
    "PlatformDataTable · 서버 페이징",
    "서버 정렬과 페이지 정보를 함께 봅니다.",
    "tables",
    async () => {
      await tableReady();
      await table().locator('[role="columnheader"][data-column="status"]').getByRole("button").first().click();
      await expect(table().getByRole("table")).toHaveAttribute("aria-busy", "false");
      // 정렬 클릭이 표를 가로 스크롤시킨다. 설비 ID부터 보이게 되돌린다.
      await table().evaluate((region) => {
        for (const el of region.querySelectorAll("*")) if (el.scrollWidth > el.clientWidth) el.scrollLeft = 0;
      });
    },
    () => elementClip(table()),
    ["C3"],
  );
  await capture(
    "table-columns",
    "PlatformDataTable · 열 설정",
    "열 표시와 왼쪽 고정을 조작합니다.",
    "tables",
    async () => {
      await tableReady();
      await button("컬럼", table()).click();
    },
    () =>
      unionClip(
        [
          table().getByRole("button", { name: "컬럼", exact: true }),
          page.getByRole("dialog").filter({ hasText: "컬럼 설정" }),
        ],
        48,
      ).then((clip) => ({ clip, cover: true })),
  );
  const drawer = () => page.getByRole("complementary", { name: "상세 패널" }).getByRole("dialog");
  async function openDrawer() {
    await tableReady();
    await table().locator("[data-row-id]").first().getByRole("button", { name: /보기$/ }).click();
    await expect(drawer()).toBeVisible();
    await expect(drawer().locator('[aria-busy="true"]')).toHaveCount(0);
  }
  // 세로로 긴 패널은 위쪽 내용 중심만 찍는다.
  const drawerTopClip = async () => {
    const box = await drawer().boundingBox();
    return { clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 500) }, cover: true };
  };
  await capture(
    "drawer",
    "DetailDrawer · 설비 상세",
    "목록을 유지하며 속성을 확인합니다.",
    "tables",
    openDrawer,
    drawerTopClip,
    ["C6"],
  );
  await capture(
    "audit",
    "AuditTimeline · 변경 이력",
    "상세 패널의 변경 이력 탭에서 변경을 봅니다.",
    "tables",
    async () => {
      await openDrawer();
      await drawer().getByRole("tab", { name: "변경 이력" }).click();
      await expect(drawer().getByRole("tabpanel")).toBeVisible();
      await expect(drawer().locator('[aria-busy="true"]')).toHaveCount(0);
    },
    drawerTopClip,
    ["C7"],
  );
  await capture(
    "trust",
    "DataTrustIndicator · 원천과 미확인",
    "갱신·커버리지와 상태 원천을 펼쳐 봅니다.",
    "tables",
    async () => {
      await go(productivity);
      await button("데이터 신뢰").first().click();
    },
    () =>
      unionClip([button("데이터 신뢰").first(), page.getByRole("dialog").filter({ hasText: "문제 없음은" })], 48).then(
        (clip) => ({ clip, cover: true }),
      ),
    ["C8"],
  );
  await capture(
    "context-bar",
    "GlobalContextBar · 전역 조건",
    "기간과 room 조건을 메뉴 사이에 유지합니다.",
    "shell",
    () => go(productivity),
    () => mainTopClip(170),
    ["K3"],
  );
  await capture(
    "scope",
    "ScopeSelector · 사이트 선택",
    "단일 Scope와 room 권한 범위를 봅니다.",
    "shell",
    async () => {
      await go(productivity);
      await button(/^Scope:/).click();
    },
    () => unionClip([button(/^Scope:/), page.getByRole("menu")], 48).then((clip) => ({ clip, cover: true })),
    ["U4"],
  );
  await capture(
    "palette",
    "CommandPalette · 메뉴 검색",
    "단축키로 메뉴와 목적지를 찾습니다.",
    "shell",
    async () => {
      await go(productivity);
      await page.keyboard.press("ControlOrMeta+k");
      await page.getByRole("dialog").getByRole("combobox").fill("사이클타임");
    },
    () => elementClip(page.getByRole("dialog"), 48).then((clip) => ({ clip, cover: true })),
    ["K2", "U3"],
  );
  await capture(
    "launcher",
    "AppShell · 홈 런처",
    "공간별 진입 카드를 봅니다.",
    "shell",
    () => go("/"),
    mainContentClip,
    ["K1"],
  );
  await capture(
    "drill",
    "DrillLayout · 공정 드릴",
    "공정에 들어가 드릴 경로와 하위 분석을 봅니다.",
    "shell",
    async () => {
      await go(productivity);
      await button("PHOTO 들어가기").click();
      await expect(page.getByRole("navigation", { name: "드릴 경로" })).toContainText("PHOTO");
      await expect(page.getByRole("main").locator('[aria-busy="true"]')).toHaveCount(0);
    },
    mainContentClip,
    ["C14"],
  );
  await capture(
    "management",
    "ManagementLayout · 설비 관리",
    "필터 레일과 목록을 나란히 봅니다.",
    "tables",
    tableReady,
    mainContentClip,
  );
  await capture(
    "catalog",
    "PlatformDataTable · 지표 카탈로그",
    "지표 이름·버전·상태를 목록으로 봅니다.",
    "tables",
    async () => {
      await go("/metrics?v=1&scopeId=MEM");
      await expect(page.getByRole("table")).toBeVisible();
    },
    mainContentClip,
  );
  for (const [id, label, title, description] of [
    ["empty", "0건 (empty)", "조건에 맞는 결과가 없습니다", "0건 결과를 오류와 구분해 보여 줍니다"],
    ["error", "서버 오류 (error)", "데이터를 불러오지 못했습니다", "조회 실패를 다시 시도 버튼과 함께 알립니다"],
    ["forbidden", "권한 거부 (forbidden)", "이 Scope에 접근 권한이 없습니다", "권한 없음을 빈 결과와 구분합니다"],
    ["too-large", "조회 과대 (too_large)", "조회 범위가 너무 큽니다", "선언한 한도를 넘은 조회를 따로 알립니다"],
  ]) {
    await capture(
      `state-${id}`,
      `QueryView · ${label}`,
      description,
      "states",
      async () => {
        await tableReady();
        await button("응답 시나리오").click();
        await page.getByRole("radio", { name: label, exact: true }).click();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("main").getByText(title, { exact: true }).first()).toBeVisible();
        await expect(page.getByRole("table")).toHaveCount(0);
      },
      // 상태 메시지 상자가 들린 전체 화면 대신 설비 목록 패널만 찍는다.
      () => elementClip(table()),
      id === "error" ? ["C11"] : [],
    );
  }
  // 02 절 주석 캡처: 1440폭 전체 화면(셸 포함). 번호 7개의 위치를 캡처 때 잰다.
  await capture(
    "cycle-time-full",
    "MARS · 사이클타임 상세 전체 화면",
    "조건 바·차트·표·상세 진입·VOC 진입이 한 화면에 있는 모습입니다.",
    "tables",
    async () => {
      await page.setViewportSize({ width: 1440, height: 1100 });
      await cycle();
    },
    () => {
      const viewport = page.viewportSize();
      return { clip: { x: 0, y: 0, width: viewport.width, height: viewport.height }, hideSticky: false };
    },
    [],
    [
      [1, () => page.getByRole("button", { name: "링크 복사", exact: true }).locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' sticky ')][1]")],
      [2, () => page.getByRole("button", { name: "링크 복사", exact: true })],
      [3, () => button("데이터 신뢰").first()],
      [4, () => button("비교", trend())],
      [5, () => page.getByRole("button", { name: "컬럼", exact: true })],
      [6, () => page.getByRole("button", { name: /^상세/ })],
      [7, () => page.getByRole("navigation", { name: "FeedbackOps · MARS", exact: true })],
    ],
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await capture(
    "feedbackops-entry",
    "FeedbackOps · VOC 진입",
    "MARS 화면 아래 고정 영역에서 VOC 등록 등 연결 상태를 확인합니다.",
    "shell",
    async () => {
      await go(productivity);
      const block = page.getByRole("navigation", { name: "FeedbackOps · MARS", exact: true });
      await expect(block).toBeVisible();
      await expect(block.getByRole("link", { name: /^VOC 등록/ })).toBeVisible();
    },
    () => elementClip(page.getByRole("navigation", { name: "FeedbackOps · MARS", exact: true }), 24),
  );
  await capture(
    "system-switcher",
    "업무 시스템 전환기",
    "MARS에서 BRAVO 등 업무 시스템을 바꾸는 전환기입니다.",
    "shell",
    async () => {
      await go(productivity);
      await button("업무 시스템 전환 · 현재: MARS").click();
      const dialog = page.getByRole("dialog", { name: "업무 시스템 전환", exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("BRAVO");
    },
    () =>
      unionClip(
        [
          // The open dialog hides the trigger from the accessibility tree; find it by attribute.
          page.locator('button[aria-haspopup="dialog"][aria-label="업무 시스템 전환 · 현재: MARS"]'),
          page.getByRole("dialog", { name: "업무 시스템 전환", exact: true }),
        ],
        32,
      ).then((clip) => ({ clip, cover: true })),
  );
  // Console screens need the demo's platform-admin role (the same switch D8 tells readers to use).
  await page.evaluate(() => localStorage.setItem("platform:role", JSON.stringify("admin")));
  await capture(
    "change-audit",
    "운영 콘솔 · 변경 감사",
    "운영 콘솔에서 변경 내역을 확인합니다.",
    "tables",
    async () => {
      await go("/admin/audit?v=1");
      await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "변경 감사", exact: true })).toBeVisible();
    },
    mainContentClip,
  );
  await capture(
    "menu-registry",
    "운영 콘솔 · 메뉴 레지스트리",
    "등록된 업무 화면과 정의를 목록으로 확인합니다.",
    "tables",
    async () => {
      await go("/admin/registry?v=1");
      await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "메뉴 레지스트리", exact: true })).toBeVisible();
    },
    mainContentClip,
  );
  await capture(
    "menu-usage",
    "운영 콘솔 · 메뉴 활용률",
    "등록된 업무 화면의 사용 현황을 확인합니다.",
    "tables",
    async () => {
      await go("/admin/usage?v=1");
      await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "메뉴 활용률", exact: true })).toBeVisible();
    },
    mainContentClip,
  );
  const total = (await Promise.all(manifest.map((s) => stat(join(options.out, `${s.id}.png`))))).reduce(
    (sum, s) => sum + s.size,
    0,
  );
  if (total > 8 * 1024 * 1024) throw new Error(`이미지 총량 ${(total / 1024 / 1024).toFixed(2)} MB: 8 MB 상한 초과`);
  await writeFile(join(options.out, "shots.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`캡처 완료: ${manifest.length}장, ${(total / 1024 / 1024).toFixed(2)} MB, ${options.out}`);
} catch (error) {
  console.error(`캡처 실패 [${currentId}]: ${error.stack || error}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
