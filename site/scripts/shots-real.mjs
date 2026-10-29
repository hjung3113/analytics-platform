#!/usr/bin/env node
// 손으로 돌리는 실서버 모드 캡처(#725). 플랫폼 메뉴(알림·설문·내 VOC·권한 요청·홈 내 할 일·VOC 등록 드로어)는 코어 서버가 있어야 내용이 보이는데
// Pages CI에는 서버가 없어 shots.mjs로는 만들 수 없다. 그래서 `dev:real`로 띄운 앱을 찍어 site/assets/real/에 커밋한다.
//
//   AP_BACKEND_ORIGIN=<코어 서버> pnpm --filter @ap/platform-web exec vite --mode real --host 127.0.0.1 --port <포트> --strictPort
//   node site/scripts/shots-real.mjs --url http://127.0.0.1:<포트> --out site/assets/real [--user mock-user-2]
//
// 시드 페르소나(mock 로그인 선택기)만 쓰고, 한국어 예시 데이터가 들어 있는 일회용 DB를 가정한다(아래 EXAMPLE 목록).
// 이미지에 실제 개인 정보·토큰·쿠키를 넣지 않는다. 배율 2로 찍어 주제 상자만 자르고, 시험용 표식([preview]·[seed])이 보이면 실패한다.
import { createRequire } from "node:module";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const options = { user: "mock-user-2" };
for (let i = 0; i < args.length; i += 2) {
  if (!["--url", "--out", "--user"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--"))
    throw new Error("사용법: node site/scripts/shots-real.mjs --url <dev:real 주소> --out <폴더> [--user <external_id>]");
  options[args[i].slice(2)] = args[i + 1];
}
if (!options.url || !options.out) throw new Error("--url과 --out이 필요합니다.");
const origin = new URL(options.url).origin;
const out = resolve(options.out);
const { chromium, expect } = createRequire(join(root, "apps/platform-e2e/package.json"))("@playwright/test");
// 주제 상자만 자르므로 배율 2에 JPEG 품질 78이면 한 장이 100 KB 안팎이다. 총량은 1.5 MB 상한.
const QUALITY = 78;
const LIMIT = 1.5 * 1024 * 1024;
// 예시 데이터: 이 VOC·설문이 있는 DB에서 찍는다. 없으면 기다리다 실패한다.
const EXAMPLE = {
  voc: "VOC-1000",
  vocTitle: "사이클타임 추세 차트에서 기간을 바꾸면 범례가 사라집니다",
  notification: "VOC 진행 상태가 변경되었습니다.",
  survey: "분석 화면 사용 경험 설문",
  answered: "사이클타임 화면 개선 의견",
  permissionReason: "분석 화면 사용 경험 설문의 응답 현황을 팀 회의에서 확인하려고 합니다.",
};
// 드로어는 분석 화면에서 열어야 기간·room_name·Scope 칩이 붙는다.
const ANALYSIS_PATH = "/analytics/cycle-time?v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&roomNames=PHOTO";
await mkdir(out, { recursive: true });
const written = [];
let browser;
let current = "browser-launch";
try {
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
    locale: "ko-KR",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(origin + "/");
  await page.locator(`input[value="${options.user}"] + button`).click();
  await page.getByRole("link", { name: "내 VOC", exact: true }).waitFor();
  async function open(path, heading) {
    await page.goto(origin + path);
    await expect(page.getByRole("main").getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole("main").locator('[aria-busy="true"]')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
  }
  // 시험용 표식이 들어 있는 줄을 숨긴다. 한국어 예시만 남기려는 것이고 다른 글자는 바꾸지 않는다.
  // 숨기는 것은 표식을 가진 글에서 표식 글의 요소에서 3단계 위(글 요소 → 링크 → 칸 → 목록 항목)까지 올라가 찾은 줄 요소(li·tr·행·목록 항목) 하나뿐이다.
  // 줄 요소를 못 찾으면 큰 조상을 통째로 숨기는 대신 실패시키고, 숨긴 뒤에도 같은 목록에 보이는 줄이 1개 이상 남아야 한다.
  async function hideMarkedRows() {
    const result = await page.evaluate(() => {
      const marker = /\[(preview|seed)\]/;
      const rowSelector = 'li, tr, [role="row"], [role="listitem"], [data-row-id]';
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const hits = [];
      while (walker.nextNode()) if (marker.test(walker.currentNode.nodeValue)) hits.push(walker.currentNode.parentElement);
      const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
      const rows = new Set();
      for (const element of hits) {
        if (!visible(element)) continue;
        let row = null;
        let node = element;
        for (let depth = 0; depth <= 3 && node && !row; depth += 1, node = node.parentElement) if (node.matches(rowSelector)) row = node;
        if (!row) return { error: `표식 글을 가진 줄 요소를 3단계 위까지 찾지 못했습니다: ${element.textContent.trim().slice(0, 60)}` };
        rows.add(row);
      }
      for (const row of rows) row.style.display = "none";
      for (const row of rows) {
        const siblings = [...row.parentElement.children].filter((c) => c.matches(rowSelector) && c.style.display !== "none" && visible(c));
        if (siblings.length < 1) return { error: "표식 줄을 숨기고 나니 같은 목록에 보이는 줄이 없습니다" };
      }
      return { hidden: rows.size };
    });
    if (result.error) throw new Error(result.error);
    return result.hidden;
  }
  async function noTestStrings() {
    const visible = await page.evaluate(() => {
      const found = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode.nodeValue;
        if (!/\[(preview|seed)\]|Open the Task Request|throwaway/.test(text)) continue;
        const element = walker.currentNode.parentElement;
        if (element.getClientRects().length && getComputedStyle(element).visibility !== "hidden") found.push(text.trim());
      }
      return found;
    });
    if (visible.length) throw new Error(`시험용 글이 화면에 보입니다: ${visible.join(" | ")}`);
  }
  // 실서버 필요·오류·빈 화면이 찍히지 않게 이 글이 없는지 확인한 뒤, 상자 하나만 잘라 찍는다.
  // scope: 홈 공지 칸은 실서버 모드에서 오류를 보이므로(사내 서버 연결 전), 그 오류가 찍을 상자 밖에 있을 때만 scope로 검사 범위를 좁힌다.
  async function shoot(id, ready, clipOf, scope = null) {
    current = id;
    await ready();
    await hideMarkedRows();
    await expect(page.getByText("실서버 필요")).toHaveCount(0);
    await expect((scope ? scope() : page).getByText("데이터를 불러오지 못했습니다")).toHaveCount(0);
    await noTestStrings();
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const clip = await clipOf();
    const viewport = page.viewportSize();
    const x = Math.max(0, Math.round(clip.x));
    const y = Math.max(0, Math.round(clip.y));
    const area = { x, y, width: Math.min(Math.round(clip.width), viewport.width - x), height: Math.min(Math.round(clip.height), viewport.height - y) };
    const jpeg = await page.screenshot({ type: "jpeg", quality: QUALITY, animations: "disabled", caret: "hide", clip: area, scale: "device" });
    await writeFile(join(out, `${id}.jpg`), jpeg);
    written.push(id);
    console.log(`${id}.jpg: ${area.width}×${area.height} CSS px (×2), ${(jpeg.length / 1024).toFixed(1)} KB`);
  }
  const box = async (locator) => {
    const b = await locator.boundingBox();
    if (!b) throw new Error("대상 상자를 찾지 못했습니다");
    return b;
  };
  const mainBox = () => box(page.getByRole("main"));
  const union = (a, b, pad = 0) => {
    const x0 = Math.min(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    return { x: x0 - pad, y: y0 - pad, width: Math.max(a.x + a.width, b.x + b.width) - x0 + pad * 2, height: Math.max(a.y + a.height, b.y + b.height) - y0 + pad * 2 };
  };

  await shoot(
    "real-bell-popover",
    async () => {
      await open("/surveys?v=1", "설문");
      await page.getByRole("button", { name: /^알림/ }).click();
      const popover = page.getByRole("dialog", { name: /알림/ }).first();
      await expect(popover).toBeVisible();
      await expect(popover.getByText("모두 보기")).toBeVisible();
      await expect(popover.getByText(EXAMPLE.notification).first()).toBeVisible();
      await page.waitForTimeout(400);
    },
    async () => {
      const popover = await box(page.getByRole("dialog", { name: /알림/ }).first());
      const bell = await box(page.getByRole("button", { name: /^알림/ }));
      return union(popover, bell, 8);
    },
  );
  await page.keyboard.press("Escape");
  await shoot(
    "real-notifications",
    async () => {
      await open("/notifications?v=1", "알림");
      await expect(page.getByText(EXAMPLE.notification).first()).toBeVisible();
    },
    async () => {
      const main = await mainBox();
      const list = await box(page.getByText(EXAMPLE.notification).first().locator("xpath=ancestor::*[self::ul or self::ol or @role='list'][1]"));
      return { x: main.x, y: 56, width: main.width, height: list.y + list.height - 56 + 24 };
    },
  );
  await shoot(
    "real-surveys",
    async () => {
      await open("/surveys?v=1", "설문");
      await expect(page.getByText(EXAMPLE.survey).first()).toBeVisible();
      await expect(page.getByText(EXAMPLE.answered).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "응답하기" }).or(page.getByRole("link", { name: "응답하기" })).first()).toBeVisible();
    },
    async () => {
      const main = await mainBox();
      const last = await box(page.getByText(EXAMPLE.answered).first().locator("xpath=ancestor::*[1]"));
      return { x: main.x, y: 56, width: main.width, height: last.y + last.height - 56 + 40 };
    },
  );
  await shoot(
    "real-permission-requests",
    async () => {
      await open("/permission-requests?v=1", "권한 요청");
      await expect(page.getByText(EXAMPLE.permissionReason).first()).toBeVisible();
    },
    async () => {
      const main = await mainBox();
      const list = await box(page.getByText(EXAMPLE.permissionReason).first().locator("xpath=ancestor::ul[1]"));
      return { x: main.x, y: 56, width: main.width, height: list.y + list.height - 56 + 24 };
    },
  );
  await shoot(
    "real-home-todo",
    async () => {
      await open("/?v=1", "플랫폼 홈");
      const todo = page.getByRole("region", { name: "내 할 일" });
      await expect(todo).toBeVisible();
      await expect(todo.getByText(EXAMPLE.survey).first()).toBeVisible();
    },
    async () => {
      const todo = await box(page.getByRole("region", { name: "내 할 일" }));
      const main = await mainBox();
      return { x: main.x, y: todo.y - 16, width: main.width, height: todo.height + 32 };
    },
    () => page.getByRole("region", { name: "내 할 일" }),
  );
  await shoot(
    "real-voc-detail",
    async () => {
      await open("/voc?v=1", "내 VOC");
      await page.getByText(EXAMPLE.voc).first().click();
      await expect(page).toHaveURL(/focus=/);
      const panel = page.getByRole("complementary", { name: "상세 패널" });
      await expect(panel.getByText("화면 정보").first()).toBeVisible();
      await expect(panel.getByText("담당자를 배정했습니다.")).toBeVisible();
      await page.waitForTimeout(1200);
    },
    async () => {
      const main = await mainBox();
      // 목록과 오른쪽 상세 패널(본문·화면 정보·공개 업데이트 두 건)을 함께 담는다.
      return { x: main.x, y: 0, width: 1440 - main.x, height: 830 };
    },
  );
  await shoot(
    "real-switcher",
    async () => {
      await open("/voc?v=1", "내 VOC");
      await page.getByRole("button", { name: /^시스템 및 플랫폼 메뉴/ }).click();
      const dialog = page.getByRole("dialog", { name: "시스템 및 플랫폼 메뉴", exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("내 VOC");
      await page.waitForTimeout(400);
    },
    async () => {
      // 팝오버 테두리 안쪽만 찍는다. 둥근 모서리 바깥의 뒤 화면이 모서리에 비치지 않도록 반지름의 0.3배 + 1px 들어간다.
      const dialog = page.getByRole("dialog", { name: "시스템 및 플랫폼 메뉴", exact: true });
      const b = await box(dialog);
      const radius = await dialog.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0);
      const inset = Math.ceil(radius * 0.3) + 1 + 1;
      return { x: b.x + inset, y: b.y + inset, width: b.width - inset * 2, height: b.height - inset * 2 };
    },
  );
  await page.keyboard.press("Escape");
  await shoot(
    "real-voc-drawer",
    async () => {
      await page.goto(origin + ANALYSIS_PATH);
      await page.getByRole("button", { name: "VOC 등록", exact: true }).waitFor();
      await page.getByRole("button", { name: "VOC 등록", exact: true }).click();
      const drawer = page.locator('aside[aria-label="VOC 등록"]');
      await expect(drawer.getByText("첨부할 화면 정보")).toBeVisible();
      await drawer.getByRole("textbox", { name: /제목/ }).first().fill("사이클타임 분포 차트의 눈금이 겹쳐 보입니다");
      const editor = drawer.locator('.ProseMirror, [contenteditable="true"]').first();
      await editor.click();
      await page.keyboard.type("기간을 하루로 줄이면 분포 차트 아래쪽 눈금이 서로 겹칩니다.");
      await drawer.getByText(/Power BI/).first().click();
      await expect(drawer.getByText("MARS · 사이클타임 상세")).toBeVisible();
      await page.waitForTimeout(500);
    },
    async () => {
      const drawer = await box(page.locator('aside[aria-label="VOC 등록"]'));
      return { x: drawer.x, y: 0, width: drawer.width, height: 900 };
    },
  );
  // 작성 중인 드로어는 닫을 때 확인을 물으므로 이 시험은 여기서 끝낸다(제출하지 않고 브라우저를 닫는다).
  const total = (await Promise.all(written.map((id) => stat(join(out, `${id}.jpg`))))).reduce((sum, s) => sum + s.size, 0);
  console.log(`캡처 완료: ${written.length}장, ${(total / 1024).toFixed(0)} KB, ${out}`);
  if (total > LIMIT) throw new Error(`이미지 총량 ${(total / 1024 / 1024).toFixed(2)} MB: 1.5 MB 상한 초과`);
} catch (error) {
  console.error(`캡처 실패 [${current}]: ${error.stack || error}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
