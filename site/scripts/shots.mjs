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
  // go()가 매번 뷰포트를 이 높이로 되돌려, 앞 캡처가 키운 뷰포트가 다음에 새지 않는다.
  let viewportHeight = 900;
  let viewportWidth = 1440;
  async function go(path) {
    await page.setViewportSize({ width: viewportWidth, height: viewportHeight });
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
  async function hideSavedAnnotationToast() {
    const toast = page.getByText("주석을 저장했습니다.", { exact: true });
    await toast.waitFor({ state: "visible" });
    await toast.evaluate((element) => {
      let wrapper = element.closest("[data-sonner-toast]");
      if (!wrapper) {
        for (let ancestor = element; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
          if (getComputedStyle(ancestor).position === "fixed") {
            wrapper = ancestor;
            break;
          }
        }
      }
      wrapper ??= element.closest('[role="status"], [role="alert"]') ?? element;
      wrapper.style.visibility = "hidden";
    });
  }
  async function cycle(query = period) {
    await go(`/analytics/cycle-time?${query}`);
    // 분포가 열려 있으면 접어 차트를 넓게 쓴다. 렌더 타이밍 때문에 isVisible 즉시
    // 확인은 누락될 수 있어, 짧은 대기 click으로 확인한다.
    try {
      await button("사이클타임 분포 접기").click({ timeout: 5000 });
    } catch {
      // 분포가 이미 접힌 화면이면 버튼이 없다.
    }
    await readyChart(trend());
  }
  async function seedBoard() {
    await page.evaluate(() => {
      const screen = (roomNames, extra = "") => ({
        menuId: "cycle-time",
        params: {},
        query: `?v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&roomNames=${roomNames}${extra}`,
      });
      const board = {
        v: 1,
        activeSheetId: "sheet-compare",
        sheets: [
          {
            id: "sheet-compare",
            name: "조건 비교",
            layout: "2x2",
            selected: 0,
            panes: [screen("PHOTO"), screen("ETCH"), screen("CVD"), screen("PHOTO", "&granularity=day")],
          },
          {
            id: "sheet-process",
            name: "공정 비교",
            layout: "1x2",
            selected: 0,
            panes: [screen("PHOTO"), screen("ETCH")],
          },
        ],
      };
      localStorage.setItem("platform:role", JSON.stringify("engineer"));
      // 도킹 보드가 저장한 v2·백업이 남아 있으면 v1 시드 대신 그것을 읽는다.
      for (const key of ["platform:board:v2:engineer", "platform:board:v1-backup:engineer"]) localStorage.removeItem(key);
      localStorage.setItem("platform:board:engineer", JSON.stringify(board));
    });
  }
  async function seedMixedBoard() {
    await page.evaluate(() => {
      const query = "?v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&roomNames=PHOTO";
      const board = {
        v: 1,
        activeSheetId: "sheet-mixed",
        sheets: [
          {
            id: "sheet-mixed",
            name: "업무 시스템 섞기",
            layout: "2x2",
            selected: 0,
            panes: [
              { menuId: "productivity-overview", params: {}, query },
              { menuId: "cycle-time", params: {}, query },
              { menuId: "operation-time", params: {}, query },
              { menuId: "metric-catalog", params: {}, query: query + "&metricId=cycle_time&metricVersion=4" },
            ],
          },
        ],
      };
      localStorage.setItem("platform:role", JSON.stringify("engineer"));
      // 도킹 보드가 저장한 v2·백업이 남아 있으면 v1 시드 대신 그것을 읽는다.
      for (const key of ["platform:board:v2:engineer", "platform:board:v1-backup:engineer"]) localStorage.removeItem(key);
      localStorage.setItem("platform:board:engineer", JSON.stringify(board));
    });
  }
  const boardPaneChart = (index) =>
    page.locator(`[data-pane-index="${index}"]`).getByRole("region", { name: "사이클타임 추세", exact: true });
  // 기본 보드는 도킹 배치다. 도킹 엔진은 늦게 올라오므로 칸 머리(시스템 칩)가 그려지고 안의 내용이 찰 때까지 기다린다(#725).
  // 칸 안의 작업 영역도 .dv-groupview를 가지므로 묶음 수가 아니라 칸 머리 수를 센다.
  async function readyDock(panes) {
    await expect(page.locator("[data-pane-system]")).toHaveCount(panes, { timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole("main").locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20000 });
  }
  async function readyBoard() {
    await expect(page.getByRole("tab", { name: "조건 비교", exact: true })).toBeVisible();
    await readyDock(4);
    for (let index = 0; index < 4; index += 1) {
      await expect(boardPaneChart(index)).toBeVisible({ timeout: 20000 });
      await boardPaneChart(index).locator("canvas").waitFor();
    }
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  }
  async function failBoardPane(index) {
    return page.evaluate((paneIndex) => {
      const container = document.getElementById("root");
      const key = container && Object.keys(container).find((name) => name.startsWith("__reactContainer$"));
      const root = key && container[key];
      const stack = [root?.current ?? root];
      while (stack.length) {
        const fiber = stack.pop();
        if (!fiber) continue;
        if (fiber.sibling) stack.push(fiber.sibling);
        if (fiber.child) stack.push(fiber.child);
        const boundary = fiber.stateNode;
        const state = boundary?.state;
        if (
          fiber.tag !== 1 ||
          !state ||
          typeof state.failed !== "boolean" ||
          typeof boundary?.props?.onError !== "function"
        ) continue;
        let ancestor = fiber;
        while (ancestor && !(ancestor.tag === 5 && String((ancestor.memoizedProps ?? ancestor.pendingProps)?.["data-pane-index"]) === String(paneIndex))) {
          ancestor = ancestor.return;
        }
        if (!ancestor) continue;
        const correlationId = boundary.props.onError(new Error("Capture-only pane failure"));
        boundary.setState({ failed: true, correlationId, chunkFailure: false });
        return correlationId;
      }
      throw new Error(`No RouteErrorBoundary found in pane ${paneIndex + 1}`);
    }, index);
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
  // 앞 캡처가 저장한 작업 영역·접힘·보드 상태가 다음 캡처로 새지 않게, 역할만 남기고 저장소를 비운 뒤 빈 페이지로 나간다(#725).
  async function resetStorage() {
    if (new URL(page.url()).origin === origin)
      await page.evaluate(() => {
        const role = localStorage.getItem("platform:role");
        localStorage.clear();
        if (role !== null) localStorage.setItem("platform:role", role);
        sessionStorage.clear();
      });
    await page.goto("about:blank");
  }
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
  // 차트 틀 전체를 찍는다. 작업 영역 패널이 틀보다 낮으면 틀 아래가 패널 안에서 잘리므로(UX2 V2) 그때는 실패시킨다.
  // 틀과 그 위 스크롤 가능한 조상 모두 내용이 넘치지 않아야 한다.
  async function frameClip(locator) {
    const clip = await elementClip(locator);
    const overflow = await locator.evaluate((el) => {
      const found = [];
      for (let node = el; node && node !== document.body; node = node.parentElement) {
        const scrolls = node === el || ["auto", "scroll", "hidden"].includes(getComputedStyle(node).overflowY);
        if (scrolls && node.scrollHeight > node.clientHeight + 1) found.push(`${node.tagName}#${node.id || "-"} ${node.scrollHeight}>${node.clientHeight}`);
        if (node.id.includes("-panel-")) break; // 패널까지만 본다. 그 위는 페이지 스크롤이다.
      }
      return found;
    });
    if (overflow.length) throw new Error(`차트 틀이 패널에서 잘립니다: ${overflow.join(", ")}`);
    return clip;
  }
  // 글자 하나에서 시작해, 폭 640px 미만이고 글이 짧은 가장 바깥 부모까지 올라가 메시지 상자 하나를 찍는다.
  async function messageClip(locator, pad = 12) {
    await expect(locator).toBeVisible();
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.evaluate((el) => {
      let node = el;
      while (
        node.parentElement &&
        node.parentElement.tagName !== "MAIN" &&
        node.parentElement.getBoundingClientRect().height < 170 &&
        node.parentElement.innerText.length < 300
      )
        node = node.parentElement;
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    // 글자가 화면에서 11px 이상으로 보이도록 폭을 600px로 자른다(왼쪽부터).
    return { x: box.x - pad, y: box.y - pad, width: Math.min(box.width, 600) + pad * 2, height: box.height + pad * 2 };
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
  // 감사·레지스트리처럼 긴 표는 머리와 첫 몇 행, 왼쪽 열만 원본 크기로 찍는다.
  // 오른쪽은 열 경계에서, 아래는 행 경계에서 끊어 열이나 행이 가운데서 잘리지 않게 한다.
  async function tableCropClip(maxWidth = 620, maxHeight = 360) {
    const table = page.getByRole("main").getByRole("table").first();
    const clip = await elementClip(table);
    const cut = await table.evaluate(
      (el, limit) => {
        const origin = el.getBoundingClientRect();
        const heads = [...el.querySelectorAll('[role="columnheader"], th')].map((h) => h.getBoundingClientRect());
        let right = 0;
        for (const h of heads) if (h.right - origin.x <= limit.w && h.right - origin.x > right) right = h.right - origin.x;
        const rows = [...el.querySelectorAll("[data-row-id], tbody tr")].map((r) => r.getBoundingClientRect());
        let bottom = 0;
        for (const r of rows) if (r.bottom - origin.y <= limit.h && r.bottom - origin.y > bottom) bottom = r.bottom - origin.y;
        return { right, bottom };
      },
      { w: maxWidth, h: maxHeight },
    );
    return {
      clip: { ...clip, width: cut.right || Math.min(clip.width, maxWidth), height: cut.bottom || Math.min(clip.height, maxHeight) },
      cover: true,
      hideSticky: false,
    };
  }
  // 번호 위치: 캡처 영역 안에서 대상 요소의 왼쪽 위 모서리를 %로 잰다. 못 찾은 번호는 건너뛴다.
  async function placeMarks(targets, area) {
    const marks = [];
    for (const [n, locate] of targets) {
      try {
        const box = await locate().first().boundingBox({ timeout: 3000 });
        if (!box) throw new Error("no box");
        // The badge centres on the element's top-left corner so it never covers the element's own text or numbers.
        const x = ((box.x - area.x) / area.width) * 100;
        const y = ((box.y - area.y) / area.height) * 100;
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
    if (png.length < (group === "states" || id === "lane-timeline" ? 4 : 10) * 1024) throw new Error(`캡처가 비어 있을 수 있습니다(${(png.length / 1024).toFixed(1)} KB)`);
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
  // 차트 틀이 작업 영역 패널 안에서 잘리지 않을 높이(패널 높이는 화면 높이를 따른다, UX2 V2).
  viewportHeight = 1560;
  await capture(
    "chart-trend",
    "AnalysisChartFrame · 기본 추이",
    "P50·P95 선, 툴바와 범례를 함께 봅니다.",
    "charts",
    cycle,
    () => frameClip(trend()),
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
    () => frameClip(trend()),
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
      await expect(trend()).toContainText(/n=\d+/);
      return frameClip(trend());
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
    () => frameClip(trend()),
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
      await hideSavedAnnotationToast();
    },
    () => frameClip(trend()),
  );
  await capture(
    "chart-compare-annotate",
    "AnalysisChartFrame · 비교 + 주석",
    "이전 기간을 같은 시간 축에 겹치고 구간에 판단을 주석으로 남깁니다.",
    "charts",
    async () => {
      await brush(true);
      await page.getByRole("textbox", { name: "주석 내용" }).fill("예시: 확인할 구간");
      await button("저장", trend()).click();
      await expect(trend().getByRole("list")).toContainText("예시: 확인할 구간");
      await button("지우기", trend()).click();
      await expect(button("분석 구간 적용…", trend())).toHaveCount(0);
      await button("비교", trend()).click();
      await expect(trend().getByRole("group", { name: "범례", exact: true })).toContainText("P50 이전 기간");
      await hideSavedAnnotationToast();
    },
    () => frameClip(trend()),
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
    "chart-topn",
    "AnalysisChart · TopN 가로 막대",
    "CLAS 설비 동작시간 견본에서 상위 설비를 가로 막대로 봅니다.",
    "charts",
    async () => {
      await go(`/clas/operation-time?${period}`);
      await page.getByRole("region", { name: "설비별 동작시간", exact: true }).locator("canvas").waitFor();
    },
    () => elementClip(page.getByRole("region", { name: "설비별 동작시간", exact: true })),
  );
  await capture(
    "lane-timeline",
    "LaneTimeline · 모듈별 동작 흐름",
    "CLAS 설비 한 대의 모듈별 작업 구간을 시간선으로 봅니다.",
    "charts",
    async () => {
      await go(`/clas/operation-time?${period}`);
      await expect(page.getByRole("img", { name: /모듈별 동작 흐름$/ }).first()).toBeVisible();
    },
    async () => {
      // 칸 줄 아래의 빈 면은 자른다: 줄을 이루는 막대와 이름의 아래 끝까지만 찍는다.
      const lane = page.getByRole("img", { name: /모듈별 동작 흐름$/ }).first();
      const clip = await elementClip(lane, 8);
      // 캔버스라 안쪽 요소가 없다. 그려진 마지막 픽셀 줄(CSS px)까지만 남기고 아래 빈 면을 자른다.
      const drawn = await lane.evaluate((el) => {
        const ctx = el.getContext("2d");
        const scale = el.height / el.getBoundingClientRect().height;
        const { data, width, height } = ctx.getImageData(0, 0, el.width, el.height);
        for (let y = height - 1; y >= 0; y -= 1)
          for (let x = 0; x < width; x += 1) if (data[(y * width + x) * 4 + 3] > 0) return (y + 1) / scale;
        return null;
      });
      if (drawn === null) throw new Error("모듈별 동작 흐름 캔버스에 그려진 것이 없습니다");
      const bottom = clip.y + 8 + drawn;
      return { ...clip, height: Math.min(clip.height, bottom - clip.y + 8) };
    },
  );
  await capture(
    "chart-table",
    "AnalysisChartFrame · 같은 데이터 표",
    "더보기에서 선 추이와 같은 데이터를 표로 펼칩니다.",
    "charts",
    async () => {
      await cycle("v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-25T15:00:00&roomNames=PHOTO");
      await button("더보기", trend()).click();
      await button("같은 데이터를 표로 보기").click();
      await page.keyboard.press("Escape");
      await expect(trend().getByRole("table")).toBeVisible();
      await expect(trend().getByRole("table").getByRole("row")).not.toHaveCount(1);
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
    () => frameClip(trend()),
  );
  viewportHeight = 900;
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
    async () => {
      const region = page.getByRole("region", { name: "네 지표 요약" });
      await region.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
      return elementClip(region);
    },
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
    () => unionClip([page.getByRole("dialog").filter({ hasText: "컬럼 설정" })], 0).then((clip) => ({ clip, cover: true })),
  );
  const drawer = () => page.getByRole("complementary", { name: "상세 패널" }).getByRole("dialog");
  async function openDrawer() {
    await tableReady();
    await table().locator("[data-row-id]").first().getByRole("button", { name: /보기$/ }).click();
    await expect(drawer()).toBeVisible();
    await expect(drawer().locator('[aria-busy="true"]')).toHaveCount(0);
  }
  // 패널 전체를 찍는다(잘리지 않게). 화면 높이가 모자라면 먼저 뷰포트를 키운다.
  const drawerTopClip = async () => {
    const box = await stableBox(drawer());
    const viewport = page.viewportSize();
    if (box.y + box.height > viewport.height) {
      await page.setViewportSize({ width: viewport.width, height: Math.ceil(box.y + box.height) + 24 });
      const moved = await stableBox(drawer());
      return { clip: { x: moved.x, y: moved.y, width: moved.width, height: moved.height }, cover: true };
    }
    return { clip: { x: box.x, y: box.y, width: box.width, height: box.height }, cover: true };
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
    async () => {
      // 변경 이력 목록 아래의 빈 면은 자른다.
      const planned = await drawerTopClip();
      const bottom = await drawer().getByRole("tabpanel").evaluate((el) => {
        let max = el.getBoundingClientRect().top;
        for (const child of el.querySelectorAll("*")) max = Math.max(max, child.getBoundingClientRect().bottom);
        return max;
      });
      return { ...planned, clip: { ...planned.clip, height: Math.min(planned.clip.height, bottom - planned.clip.y + 20) } };
    },
    ["C7"],
  );
  await capture(
    "trust",
    "DataTrustIndicator · 원천과 미확인",
    "갱신·커버리지와 상태 원천을 펼친 패널입니다.",
    "tables",
    async () => {
      await go(productivity);
      await button("데이터 신뢰").first().click();
    },
    () =>
      unionClip([page.getByRole("dialog").filter({ hasText: "문제 없음은" })], 0).then((clip) => ({ clip, cover: true })),
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
    "link-copy",
    "GlobalContextBar · 현재 조건 공유",
    "현재 적용된 조건만 담은 링크를 복사하고 복사됐다는 알림을 봅니다.",
    "shell",
    async () => {
      await go(productivity);
      const kpi = page.getByRole("region", { name: "네 지표 요약" });
      await expect(kpi.locator(".t-stat").first()).toContainText(/\d/);
      await expect(page.getByRole("main").locator('[role="status"][aria-busy]')).toHaveCount(0);
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
      await button("현재 조건 공유").click();
      await expect(page.locator("[data-toast-item]").filter({ hasText: "현재 적용된 조건의 링크를 복사했습니다" })).toBeVisible();
    },
    () =>
      elementClip(page.locator("[data-toast-item]").filter({ hasText: "현재 적용된 조건의 링크를 복사했습니다" }), 12).then((clip) => ({
        clip,
        cover: true,
        hideSticky: false,
      })),
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
    () => unionClip([page.getByRole("menu")], 0).then((clip) => ({ clip, cover: true })),
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
    "업무 시스템 카드, 최근 방문, 지금 Site의 공지를 봅니다.",
    "shell",
    async () => {
      await go("/?v=1&scopeId=MEM");
      await page.getByRole("region", { name: "공지" }).getByRole("status").first().waitFor();
    },
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
    "board-mixed",
    "분석 보드 · 업무 시스템을 섞은 네 칸",
    "MARS·CLAS·BRAVO 메뉴를 한 시트에 놓고 칸 머리의 업무 시스템 이름으로 구분합니다.",
    "shell",
    async () => {
      viewportHeight = 1100;
      await seedMixedBoard();
      await go("/board?sheet=sheet-mixed");
      await expect(page.getByRole("tab", { name: "업무 시스템 섞기", exact: true })).toBeVisible();
      await readyDock(4);
      // 도킹 칸 머리는 묶음의 탭 띠에 들어가므로 시스템 칩은 칸 본문 밖에 있다.
      // DOM 순서는 화면 순서와 달라 이름을 정렬해 비교한다.
      await expect
        .poll(() => page.locator("[data-pane-system]").allTextContents().then((names) => names.sort().join()), { timeout: 20000 })
        .toBe("BRAVO,CLAS,MARS,MARS");
      await expect(page.locator('[data-pane-index="1"]').getByRole("region", { name: "사이클타임 추세", exact: true })).toBeVisible({ timeout: 20000 });
      await expect(page.locator('[data-pane-index="2"]').getByText("동작시간 요약", { exact: true })).toBeVisible({ timeout: 20000 });
      await expect(page.locator('[data-pane-index="3"]').getByRole("table")).toBeVisible({ timeout: 20000 });
      await expect(page.locator('[data-pane-index="3"]')).not.toContainText("전역 지표 쌍 없음");
      await expect(page.locator('[data-pane-index="3"]')).not.toContainText("이 지표의 버전이 아닙니다");
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    },
    () => {
      const viewport = page.viewportSize();
      return { clip: { x: 0, y: 0, width: viewport.width, height: viewport.height }, hideSticky: false };
    },
  );
  await capture(
    "board-2x2",
    "분석 보드 · 서로 다른 조건의 네 칸",
    "사이클타임 화면 네 개를 서로 다른 room 또는 기간 조건으로 나란히 봅니다.",
    "shell",
    async () => {
      viewportHeight = 1600;
      await seedBoard();
      await go("/board?sheet=sheet-compare");
      await readyBoard();
    },
    () => {
      const viewport = page.viewportSize();
      return { clip: { x: 0, y: 0, width: viewport.width, height: viewport.height }, hideSticky: false };
    },
  );
  await capture(
    "board-sheets",
    "분석 보드 · 시트 탭",
    "두 비교 구성을 아래 시트 탭으로 전환합니다.",
    "shell",
    async () => {
      viewportHeight = 1000;
      await seedBoard();
      await go("/board?sheet=sheet-compare");
      await readyBoard();
      const processSheet = page.getByRole("tab", { name: "공정 비교", exact: true });
      await processSheet.click();
      await expect(processSheet).toHaveAttribute("aria-selected", "true");
      for (let index = 0; index < 2; index += 1) {
        await expect(boardPaneChart(index)).toBeVisible();
        await boardPaneChart(index).locator("canvas").waitFor();
      }
    },
    () => {
      const viewport = page.viewportSize();
      return { clip: { x: 0, y: 0, width: viewport.width, height: viewport.height }, hideSticky: false };
    },
  );
  // 도킹 보드(#725): 한 묶음에 탭 둘이 겹친 시트. v2 저장 모양을 직접 심어 첫 묶음에 사이클타임 상세와 생산성 개요를 탭으로 둔다.
  async function seedDockBoard() {
    await page.evaluate(() => {
      const query = "?v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&roomNames=PHOTO";
      const pane = (id, menuId) => ({ id, screen: { menuId, params: {}, query }, previous: null });
      const board = {
        v: 2,
        activeSheetId: "sheet-dock",
        sheets: [
          {
            id: "sheet-dock",
            name: "탭으로 묶은 시트",
            panes: [pane("p1", "cycle-time"), pane("p2", "productivity-overview"), pane("p3", "operation-time"), pane("p4", "equipment-master")],
            selectedPaneId: "p1",
            tree: {
              type: "branch",
              dir: "row",
              sizes: [56, 44],
              children: [
                { type: "group", panes: ["p1", "p2"], active: "p1" },
                {
                  type: "branch",
                  dir: "column",
                  sizes: [50, 50],
                  children: [
                    { type: "group", panes: ["p3"], active: "p3" },
                    { type: "group", panes: ["p4"], active: "p4" },
                  ],
                },
              ],
            },
          },
        ],
      };
      localStorage.setItem("platform:role", JSON.stringify("engineer"));
      localStorage.removeItem("platform:board:engineer");
      localStorage.setItem("platform:board:v2:engineer", JSON.stringify(board));
    });
  }
  async function openDockBoard() {
    viewportHeight = 900;
    await seedDockBoard();
    await go("/board?sheet=sheet-dock");
    await expect(page.getByRole("tab", { name: "탭으로 묶은 시트", exact: true })).toBeVisible();
    // 묶음 하나에 칸 머리(시스템 칩)가 하나라, 탭으로 겹친 두 칸은 칩 하나다.
    await readyDock(3);
    await expect(page.locator('[data-pane-index="0"]').getByRole("region", { name: "사이클타임 추세", exact: true })).toBeVisible({ timeout: 20000 });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  }
  const viewportClip = () => {
    const viewport = page.viewportSize();
    return { clip: { x: 0, y: 0, width: viewport.width, height: viewport.height }, hideSticky: false };
  };
  await capture(
    "board-dock-tabs",
    "분석 보드 · 탭으로 겹친 칸",
    "한 묶음에 사이클타임 상세와 생산성 개요가 탭으로 겹쳐 있고, 오른쪽에는 CLAS 동작시간과 MARS 설비 마스터 칸이 나뉘어 있습니다.",
    "shell",
    openDockBoard,
    viewportClip,
  );
  // 최대화한 칸의 내용이 칸 폭을 채울 때까지 기다린다. 한 번 크기를 흔들어 다시 배치시킨 뒤 차트 폭을 잰다(#725 UX U4).
  async function maximizePane() {
    await button("칸 1 최대화").click();
    await expect(button("원래 크기로").first()).toBeVisible();
    const vp = page.viewportSize();
    await page.setViewportSize({ width: vp.width - 2, height: vp.height });
    await page.setViewportSize(vp);
    const chart = page.locator('[data-pane-index="0"]').getByRole("region", { name: "사이클타임 추세", exact: true });
    await expect(chart).toBeVisible();
    await expect.poll(async () => (await chart.boundingBox())?.width ?? 0, { timeout: 15000 }).toBeGreaterThan(vp.width * 0.6);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  }
  await capture(
    "board-dock-maximized",
    "분석 보드 · 칸 최대화",
    "칸 머리의 최대화 버튼으로 한 칸을 시트 전체 크기로 키웁니다. 같은 자리의 ‘원래 크기로’를 누르면 돌아갑니다.",
    "shell",
    async () => {
      await openDockBoard();
      await maximizePane();
    },
    viewportClip,
  );
  await capture(
    "board-pane-menu",
    "분석 보드 · 칸 동작 메뉴",
    "칸 머리의 ⋯ 메뉴에 칸 동작과 ‘화면 배치’ 명령이 모여 있습니다.",
    "shell",
    async () => {
      await openDockBoard();
      // 칸이 좁으면 `화면 배치`·`높이 방식`이 꺼지므로, 넓은 칸(최대화한 칸 1)에서 연다.
      await maximizePane();
      await button("칸 1 동작").click();
      await expect(page.getByRole("menu")).toBeVisible();
      const layout = page.getByRole("menuitem", { name: /화면 배치|기본 배치|집중|세로/ }).first();
      await expect(layout).toBeVisible();
      await expect(layout).not.toHaveAttribute("aria-disabled", "true");
      await expect(layout).not.toHaveAttribute("data-disabled", "");
    },
    async () => {
      const menu = page.getByRole("menu").first();
      const box = await stableBox(menu);
      const viewport = page.viewportSize();
      // 메뉴와 그 위의 칸 머리 띠(탭 줄)를 함께 담는다.
      const x = Math.max(0, box.x - 6);
      const y = Math.max(0, box.y - 52);
      return { clip: { x, y, width: Math.min(viewport.width - x, box.width + 24), height: box.height + 64 }, cover: true, hideSticky: false };
    },
  );
  // 메뉴 작업 영역(PanelWorkspace, #664): 첫 소비자인 사이클타임 상세. 조회 조건 막대를 접어 작업 영역이 화면을 쓰게 한다.
  async function cycleWorkspace(height = 1500) {
    // `화면 맞춤`은 패널 높이가 화면 높이에 비례해서, 패널 안 내용이 잘리지 않으려면 1500 높이가 필요하다(1400 이하에서는 요약 안내 문장이 잘린다). 더 높으면 패널 아래가 비어 보인다.
    // 앞 캡처의 저장 상태는 비운다.
    viewportHeight = height;
    await resetStorage();
    await go(`/analytics/cycle-time?${period}`);
    await expect(page.getByRole("region", { name: "사이클타임 분석 영역", exact: true })).toBeVisible();
    // 접힘 상태는 이 브라우저에 저장되므로, 접혀 있으면 펼치고 시작한다. 접기 버튼이 있을 때만 누른다.
    const collapse = page.getByRole("button", { name: "조회 조건 접기" });
    if (await collapse.count()) await collapse.click();
    await expect(page.getByRole("button", { name: "조회 조건 펼치기" })).toBeVisible();
    await readyChart(trend());
  }
  const mainClip = async (height) => {
    const box = await page.getByRole("main").boundingBox();
    return { clip: { x: box.x, y: box.y, width: box.width, height: height ?? box.height }, cover: true, hideSticky: false };
  };
  await capture(
    "cycle-workspace",
    "메뉴 작업 영역 · 사이클타임 상세",
    "추세·요약·분포·느린 실행이 패널로 나뉘어 있고, 위 도구줄에서 프리셋·높이 방식·기본 배치를 고릅니다.",
    "shell",
    () => cycleWorkspace(),
    () => mainClip(),
  );
  // 같은 폭에서 조회 조건 막대를 접은 모습과 펼친 모습을 비교한다. 페이지 머리는 두 경우 모두 한 줄이다.
  await capture(
    "cycle-head-fold",
    "페이지 머리 한 줄 · 조회 조건 접힘",
    "페이지 머리는 한 줄(경로·제목·설명·상태)이고, 조회 조건 막대는 한 줄로 접혀 있으며 조회 결과는 그 아래 얇은 띠로 보입니다.",
    "shell",
    () => cycleWorkspace(900),
    () => mainClip(220),
  );
  await capture(
    "cycle-head-open",
    "페이지 머리 한 줄 · 조회 조건 펼침",
    "같은 화면에서 ‘조회 조건’을 누르면 기간·공정 조건 입력이 머리 아래에 펼쳐지고, 설비 조건은 그 아래로 이어집니다.",
    "shell",
    async () => {
      await cycleWorkspace(900);
      await page.getByRole("button", { name: "조회 조건 펼치기" }).click();
      await expect(page.getByRole("button", { name: "조회 조건 접기" })).toBeVisible();
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    },
    async () => {
      // 아래 경계는 `기간과 Scope` 묶음의 끝이다. 설비 조건 줄이 가운데서 잘리지 않게 그 줄은 통째로 뺀다.
      const group = page.locator("fieldset").filter({ hasText: "기간과 Scope" }).first();
      await expect(group).toBeVisible();
      const clip = await mainClip();
      const box = await group.boundingBox();
      return { ...clip, clip: { ...clip.clip, height: box.y + box.height - clip.clip.y + 4 } };
    },
  );
  await capture(
    "cycle-workspace-stack",
    "작업 영역 · 아래로 쌓기",
    "높이 방식을 ‘아래로 쌓기’로 두면 줄마다 자기 높이를 갖고 위에서 아래로 이어지며, 넘치는 만큼 페이지가 스크롤됩니다.",
    "shell",
    async () => {
      await cycleWorkspace(1400);
      await page.getByRole("radio", { name: "세로", exact: true }).click();
      await page.getByRole("radiogroup", { name: "높이 방식" }).getByRole("radio", { name: "아래로 쌓기" }).click();
      await expect(page.locator("[data-panel-workspace]")).toHaveAttribute("data-workspace-mode", "stack");
      await expect(page.locator("[data-dock-row-separator]").first()).toBeVisible();
      // 줄마다 자기 px 높이를 가져 세 줄이 위에서 아래로 이어진다. 맨 위에서 찍어 고정 머리가 패널을 가리지 않게 한다.
      await page.locator("#platform-main").evaluate((el) => el.scrollTo(0, 0));
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    },
    () => mainClip(),
  );
  await capture(
    "error-trace",
    "오류 처리 · 추적 번호와 화면 격리",
    "한 보드 칸의 렌더 오류와 Correlation ID를 표시하고 나머지 칸은 유지합니다.",
    "states",
    async () => {
      viewportHeight = 1100;
      await seedBoard();
      await go("/board?sheet=sheet-compare");
      await readyBoard();
      await failBoardPane(0);
      await expect(page.locator('[data-pane-index="0"]').getByText("이 화면에서 오류가 발생했습니다", { exact: true })).toBeVisible();
      await expect(page.locator('[data-pane-index="0"]')).toContainText(/client-/);
      for (let index = 1; index < 4; index += 1) await expect(boardPaneChart(index).locator("canvas")).toBeVisible();
    },
    async () => {
      // 칸 머리 띠는 칸 본문 밖(탭 줄)에 있으므로, 두 칸의 시스템 칩이 있는 띠까지 위로 넓힌다.
      const bodies = await unionClip([page.locator('[data-pane-index="0"]'), page.locator('[data-pane-index="1"]')], 8);
      const chips = await unionClip([page.locator("[data-pane-system]").nth(0), page.locator("[data-pane-system]").nth(1)], 0);
      const top = Math.min(bodies.y, chips.y - 14);
      return { clip: { ...bodies, y: top, height: bodies.y + bodies.height - top }, cover: true, hideSticky: false };
    },
  );
  viewportHeight = 900;
  await page.setViewportSize({ width: 1440, height: 900 });
  await capture(
    "management",
    "ManagementLayout · 설비 관리",
    "필터 열과 목록을 나란히 봅니다.",
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
  // 상태 메시지는 좁은 화면(700px)에서 찍어 글이 상자 안에서 줄바꿈되고 가장자리에서 잘리지 않게 한다.
  viewportWidth = 700;
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
      // 목록 패널 전체 대신 상태 메시지 상자만 찍어, 화면에서 글자가 읽히게 한다.
      () => messageClip(page.getByRole("main").getByText(title, { exact: true }).first()).then((clip) => ({ clip, cover: true })),
      id === "error" ? ["C11"] : [],
    );
  }
  viewportWidth = 1440;
  // 히어로 합성 그림의 MARS 자리: 1440폭 전체 화면(셸 포함). 번호 표식은 두지 않는다(번호는 02의 장면 카드에만 있다).
  await capture(
    "cycle-time-full",
    "견본 화면 전체",
    "조건 패널·추세 차트·요약·분포와 사이드바의 FeedbackOps(VOC·Task·설문) 링크가 한 화면에 있는 견본 화면입니다.",
    "tables",
    async () => {
      // 앞 캡처(아래로 쌓기 등)의 저장 상태 없이 기본 배치로 찍는다.
      viewportHeight = 1640;
      await resetStorage();
      await cycle();
    },
    () => {
      const viewport = page.viewportSize();
      return { clip: { x: 0, y: 0, width: viewport.width, height: viewport.height }, hideSticky: false };
    },
    [],
    [],
  );
  // 02 핵심 장면 카드의 확대 조각: 조건 바(왼쪽 560px)와 데이터 신뢰 패널을 원본 크기로 잘라 낸다.
  // 사이클타임은 적용 방식 조회 바(#553)를 쓰므로, 전역 조건 바가 그대로 있는 생산성 개요에서 찍는다.
  await capture(
    "inset-context",
    "조건 바 확대",
    "기간·사이트·공정 조건이 모인 전역 조건 바의 왼쪽을 원본 크기로 봅니다.",
    "shell",
    async () => {
      await go(productivity);
    },
    async () => {
      // 조건 바 왼쪽(기간·빠른 범위·room_name 칩)까지를 칩 경계에서 끊는다. 경계에 걸리는 오른쪽 데이터 신뢰 배지는 찍는 동안만 숨긴다.
      const bar = page.getByRole("button", { name: "현재 조건 공유", exact: true }).locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' sticky ')][1]");
      const cutX = await bar.evaluate((el) => {
        const chip = [...el.querySelectorAll("button")].find((b) => /^room_name/.test(b.textContent.trim()));
        const right = chip.getBoundingClientRect().right + 4;
        for (const b of el.querySelectorAll("button")) {
          const r = b.getBoundingClientRect();
          if (r.left < right && r.right > right) b.style.visibility = "hidden";
        }
        return right;
      });
      // 생산성 개요의 sticky 묶음에는 페이지 머리도 들어 있어, 높이는 조건 칩 줄로만 자른다.
      const row = await bar.evaluate((el) => {
        const chip = [...el.querySelectorAll("button")].find((b) => /^room_name/.test(b.textContent.trim()));
        let line = chip.parentElement;
        while (line && line !== el && line.getBoundingClientRect().height < 40) line = line.parentElement;
        const r = line.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      });
      const clip = await unionClip([bar], 0);
      return { clip: { ...clip, y: row.top, height: row.bottom - row.top, width: cutX - clip.x }, hideSticky: false };
    },
  );
  await page.keyboard.press("Escape");
  viewportHeight = 900;
  await page.setViewportSize({ width: 1440, height: 900 });
  await capture(
    "voc-drawer",
    "VOC 등록 드로어 · 화면 정보 칩",
    "‘VOC 등록’을 누르면 본문 오른쪽에 드로어가 열리고, 지금 화면의 업무 시스템·메뉴·기간·room_name·Scope가 칩으로 붙습니다. 데모에는 FeedbackOps 서버가 없어 작성 화면 자리에 ‘실서버 필요’가 보입니다.",
    "shell",
    async () => {
      await resetStorage();
      await go(productivity);
      await page.getByRole("button", { name: "VOC 등록", exact: true }).click();
      const drawer = page.locator('aside[aria-label="VOC 등록"]');
      await expect(drawer.getByText("첨부할 화면 정보")).toBeVisible();
      await expect(drawer.getByText("MARS · 생산성 개요")).toBeVisible();
      await expect(drawer.getByText("실서버 필요")).toBeVisible();
      await page.mouse.move(0, 0);
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    },
    () => {
      const viewport = page.viewportSize();
      return { clip: { x: 0, y: 0, width: viewport.width, height: 420 }, hideSticky: false };
    },
  );
  await capture(
    "system-switcher",
    "업무 시스템 전환기",
    "위쪽 플랫폼 메뉴 줄(홈·알림·내 VOC·설문·권한 요청·공지)과 아래 업무 시스템 MARS(현재)·BRAVO·CLAS·표준 로그 개발·개선 실행 카드를 바꾸는 전환기입니다. 공지는 메뉴 자리만 있고 화면은 아직 없습니다.",
    "shell",
    async () => {
      await go(productivity);
      await button("시스템 및 플랫폼 메뉴 · 현재: MARS").click();
      const dialog = page.getByRole("dialog", { name: "시스템 및 플랫폼 메뉴", exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("BRAVO");
      await expect(dialog.getByRole("button", { name: /^CLAS/ })).toBeVisible();
      // 대화상자 뒤의 화면 내용이 가장자리에 비치지 않게 앱 루트를 숨기고, 테두리까지 온전히 찍는다.
      await page.evaluate(() => {
        const root = document.getElementById("root");
        if (root) root.style.visibility = "hidden";
      });
    },
    () => unionClip([page.getByRole("dialog", { name: "시스템 및 플랫폼 메뉴", exact: true })], 14).then((clip) => ({ clip, cover: true, hideSticky: false })),
  );
  // CLAS 공간의 견본 화면(#590): 설비별 동작시간 TopN 막대와 모듈별 동작 흐름(LaneTimeline).
  await capture(
    "clas-operation-time",
    "CLAS · 설비 동작시간",
    "CLAS에서 설비별 동작시간 순위와 모듈별 동작 흐름을 봅니다.",
    "charts",
    async () => {
      viewportHeight = 1560;
      await go(`/clas/operation-time?${period}`);
      await page.getByRole("region", { name: "설비별 동작시간", exact: true }).locator("canvas").waitFor();
      await page.getByRole("img", { name: /모듈별 동작 흐름$/ }).first().waitFor();
    },
    () => {
      // 셸 머리(CLAS > 설비 동작시간)부터 흐름 칸까지 한 화면에 담는다.
      const viewport = page.viewportSize();
      return { clip: { x: 0, y: 0, width: viewport.width, height: viewport.height }, hideSticky: false };
    },
  );
  viewportHeight = 900;
  // Console screens need the demo's platform-admin role (the same switch D8 tells readers to use).
  await page.evaluate(() => localStorage.setItem("platform:role", JSON.stringify("admin")));
  await capture(
    "usage",
    "운영 콘솔 · 메뉴 활용률",
    "메뉴별 방문·사용자·마지막 사용 시각을 활용률 화면에서 봅니다.",
    "tables",
    async () => {
      // 방문 기록은 이 탭의 mock 어댑터 메모리에 쌓이므로, 새로고침 없이 앱 안에서 여러 메뉴를 거친 뒤 활용률 화면으로 간다(#725).
      viewportHeight = 1400;
      await page.setViewportSize({ width: viewportWidth, height: viewportHeight });
      await page.goto(origin + base.slice(0, -1) + productivity);
      await page.getByRole("main").getByRole("heading", { level: 1 }).waitFor();
      for (const path of [equipment, "/metrics?v=1&scopeId=MEM", "/analytics/cycle-time?" + period, productivity, equipment, productivity, "/admin/usage?v=1"]) {
        await page.evaluate((url) => {
          history.pushState({}, "", url);
          window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
        }, base.slice(0, -1) + path);
        await page.waitForTimeout(700);
      }
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
      await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "메뉴 활용률", exact: true })).toBeVisible();
      await expect(page.getByRole("table", { name: "메뉴 활용률 목록", exact: true })).toBeVisible();
    },
    mainContentClip,
  );
  viewportHeight = 900;
  await capture(
    "change-audit",
    "운영 콘솔 · 변경 감사",
    "운영 콘솔에서 변경 내역을 확인합니다.",
    "tables",
    async () => {
      await go("/admin/audit?v=1");
      await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "변경 감사", exact: true })).toBeVisible();
    },
    tableCropClip,
  );
  await capture(
    "menu-registry",
    "운영 콘솔 · 메뉴 레지스트리",
    "플랫폼 메뉴와 업무 시스템 메뉴를 포함해 등록된 화면과 정의를 목록으로 확인합니다.",
    "tables",
    async () => {
      await go("/admin/registry?v=1");
      await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "메뉴 레지스트리", exact: true })).toBeVisible();
    },
    tableCropClip,
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
