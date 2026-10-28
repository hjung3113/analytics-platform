#!/usr/bin/env node
// 조립한 사이트의 구조 검사(#725). 손으로 돌리는 점검이며 CI에는 연결하지 않는다.
//   node site/scripts/check-assembled.mjs --site <조립 폴더> [--captures <shots.mjs 출력 폴더>] [--shots <화면 캡처를 남길 폴더>] [--browser]
// 검사: 중복 id · 안 닫힌 본문 앵커/용어 앵커/로컬 파일 참조 · 빈 캡처 자리 · GLOSSARY.md의 `_Avoid_` 용어가 보이는 글에 남았는지 ·
// 보이는 글·alt에 남은 마크다운 백틱(개발자 부록의 <pre> 코드 발췌는 제외).
// 본문(site/index.html)이 요구하는 캡처(`data-shot-fig`·`<!--shot:x-->`)가 모두 있는지도 본다: --captures를 주면 그 폴더의 shots.json·PNG와 대조하고,
// 조립본에 assets/shots/shots.json이 있으면 조립본의 그림과도 대조한다. 빠진 캡처는 실패다.
// --browser를 주면 1440·390 폭에서 가로 스크롤(접힌 상태와 모두 펼친 상태)을 재고, --shots 폴더에 전체 화면 PNG를 남긴다
// (Playwright는 e2e 패키지에서 빌린다).
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, mkdir, stat } from "node:fs/promises";
import { resolve, dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const options = { browser: false };
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--browser") options.browser = true;
  else if (["--site", "--shots", "--captures"].includes(args[i]) && args[i + 1]) options[args[i].slice(2)] = resolve(args[++i]);
  else throw new Error(`알 수 없는 인수: ${args[i]}`);
}
if (!options.site) throw new Error("--site <조립 폴더>가 필요합니다.");
let failed = 0;
const fail = (message) => {
  failed += 1;
  console.log(`  ✗ ${message}`);
};
const pass = (message) => console.log(`  ✓ ${message}`);

const pages = ["index.html", "glossary.html"];
const html = {};
for (const page of pages) html[page] = await readFile(join(options.site, page), "utf8");
const lineOf = (text, index) => text.slice(0, index).split("\n").length;

// 1) 중복 id
console.log("중복 id");
for (const page of pages) {
  const seen = new Map();
  const dup = [];
  for (const m of html[page].matchAll(/\sid="([^"]+)"/g)) {
    if (seen.has(m[1])) dup.push(`${m[1]} (줄 ${seen.get(m[1])}, ${lineOf(html[page], m.index)})`);
    else seen.set(m[1], lineOf(html[page], m.index));
  }
  dup.length ? fail(`${page}: ${dup.join(", ")}`) : pass(`${page}: 0건 (id ${seen.size}개)`);
}
const ids = Object.fromEntries(pages.map((p) => [p, new Set([...html[p].matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))]));

// 2) 앵커와 로컬 파일 참조
console.log("앵커·로컬 참조");
for (const page of pages) {
  const missing = [];
  for (const m of html[page].matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const url = m[1];
    if (/^(?:https?:|mailto:|data:|javascript:)/.test(url) || url === "") continue;
    const [path, hash] = url.split("#");
    const target = path === "" ? page : path;
    if (path.startsWith("demo/")) {
      // 데모의 화면 주소는 파일이 아니라 앱 경로다. 데모 폴더가 있는지만 본다.
      try {
        await stat(join(options.site, "demo/index.html"));
      } catch {
        const around = html[page].slice(Math.max(0, m.index - 160), m.index + 20);
        if (!/data-demo/.test(around)) missing.push(`${url} (줄 ${lineOf(html[page], m.index)})`);
      }
      continue;
    }
    if (path && !/^(?:index|glossary)\.html$/.test(path)) {
      // 폴더(demo/)와 파일 참조는 조립 폴더에 있어야 한다.
      try {
        await stat(join(options.site, path));
      } catch {
        // demo/는 --demo 없이 조립하면 없다. 링크가 숨김(data-demo hidden)이면 허용한다.
        const around = html[page].slice(Math.max(0, m.index - 160), m.index + 20);
        if (!/data-demo/.test(around)) missing.push(`${url} (줄 ${lineOf(html[page], m.index)})`);
      }
      continue;
    }
    if (hash && !ids[target]?.has(hash)) missing.push(`${url} (줄 ${lineOf(html[page], m.index)})`);
  }
  missing.length ? fail(`${page}: 없는 대상 ${missing.length}건 — ${missing.slice(0, 12).join(", ")}`) : pass(`${page}: 0건`);
}

// 3) 빈 캡처 자리
console.log("빈 캡처 자리");
{
  const text = html["index.html"];
  const leftovers = [...text.matchAll(/<!--shot:[a-z0-9-]+-->/g)].map((m) => `${m[0]} (줄 ${lineOf(text, m.index)})`);
  const empty = [];
  for (const m of text.matchAll(/<figure class="[^"]*" data-shot-fig="([a-z0-9-]+)">([\s\S]*?)<\/figure>/g))
    if (!/<img\b/.test(m[2])) empty.push(`${m[1]} (줄 ${lineOf(text, m.index)})`);
  const brokenImg = [];
  for (const m of text.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/g)) {
    if (/^(?:https?:|data:)/.test(m[1])) continue;
    try {
      await stat(join(options.site, m[1]));
    } catch {
      brokenImg.push(`${m[1]} (줄 ${lineOf(text, m.index)})`);
    }
  }
  // 본문이 요구하는 캡처가 빠지지 않았는지: 원본 index.html의 자리 목록을 캡처 폴더와 조립본에 대조한다.
  const source = await readFile(join(root, "site/index.html"), "utf8");
  const wanted = [...new Set([...source.matchAll(/data-shot-fig="([a-z][a-z0-9-]*)"/g)].map((m) => m[1]))];
  const absent = [];
  if (options.captures) {
    let manifest = [];
    try {
      manifest = JSON.parse(await readFile(join(options.captures, "shots.json"), "utf8")).map((shot) => shot.id);
    } catch {
      absent.push("캡처 폴더의 shots.json을 읽지 못함");
    }
    for (const id of wanted) {
      if (!manifest.includes(id)) absent.push(`${id}: shots.json에 없음`);
      try {
        await stat(join(options.captures, `${id}.png`));
      } catch {
        absent.push(`${id}: ${id}.png 없음`);
      }
    }
  }
  let assembledHasShots = true;
  try {
    await stat(join(options.site, "assets/shots/shots.json"));
  } catch {
    assembledHasShots = false;
  }
  if (assembledHasShots)
    for (const id of wanted) {
      const figure = new RegExp(`<figure class="[^"]*" data-shot-fig="${id}">[\\s\\S]*?<img\\b`);
      if (!figure.test(text)) absent.push(`${id}: 조립본에 그림이 없음`);
    }
  if (absent.length) leftovers.push(...absent.map((a) => `요구한 캡처 없음 ${a}`));
  leftovers.length || empty.length || brokenImg.length
    ? fail(`남은 표식 ${leftovers.length} · 이미지 없는 자리 ${empty.length} · 없는 이미지 ${brokenImg.length} — ${[...leftovers, ...empty, ...brokenImg].slice(0, 10).join(", ")}`)
    : pass("0건");
}

// 3b) 이미지 크기 속성: 로드 전에도 자리를 잡도록 모든 <img src>가 파일의 픽셀 크기를 width·height로 가져야 한다(목차 점프가 어긋나지 않게).
console.log("이미지 width·height 속성");
{
  const text = html["index.html"];
  const sizeOf = (buffer) => {
    if (buffer.toString("ascii", 1, 4) === "PNG") return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    for (let at = 2; at + 9 < buffer.length; at += 2 + buffer.readUInt16BE(at + 2)) {
      const marker = buffer[at + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buffer.readUInt16BE(at + 5), width: buffer.readUInt16BE(at + 7) };
    }
    return null;
  };
  const bad = [];
  let count = 0;
  for (const m of text.matchAll(/<img\b[^>]*>/g)) {
    const src = /\ssrc="([^"]+)"/.exec(m[0])?.[1];
    if (!src || /^(?:https?:|data:)/.test(src)) continue; // 확대 대화상자의 빈 <img>는 src가 없다
    count += 1;
    const w = /\swidth="(\d+)"/.exec(m[0])?.[1];
    const h = /\sheight="(\d+)"/.exec(m[0])?.[1];
    if (!w || !h) {
      bad.push(`${src}: width/height 없음 (줄 ${lineOf(text, m.index)})`);
      continue;
    }
    try {
      const real = sizeOf(await readFile(join(options.site, src)));
      if (real && (real.width !== Number(w) || real.height !== Number(h))) bad.push(`${src}: 속성 ${w}×${h} ≠ 파일 ${real.width}×${real.height}`);
    } catch {
      // 없는 파일은 위 '없는 이미지' 검사가 잡는다.
    }
  }
  bad.length ? fail(`${bad.length}건 — ${bad.slice(0, 8).join(", ")}`) : pass(`이미지 ${count}개 모두 파일 픽셀 크기와 같음`);
}

// 4) 용어집 _Avoid_ 용어(작업 지시가 이름 붙인 것)
console.log("용어: 보이는 글에 남은 금지 용어");
{
  const glossary = await readFile(join(root, "GLOSSARY.md"), "utf8");
  const norm = (t) => t.replace(/<[^>]*>/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*]/g, "").replace(/\s+/g, " ").trim();
  const glossaryText = norm(glossary);
  const terms = [
    ["공간", /공간/],
    ["워크스페이스", /워크스페이스/],
    ["조회 범위", /조회 범위/],
    ["실어댑터", /실어댑터/],
    ["레일(시스템 레일 아님)", /(?<!시스템 )(?<!가드)레일/],
    ["전역 유틸리티 메뉴", /전역 유틸리티 메뉴/],
    ["접수", /접수/],
    ["게시", /게시/],
    ["서브모듈", /서브모듈/],
  ];
  // 코드 글자도 보이는 글이므로 검사한다. 금지 용어와 겹치는 코드 글자는 용어 정리 원장 행(L137: 옛 표기 → 새 표기)에서만 건너뛰고,
  // 건너뛴 것은 아래에 출력한다. 다른 곳의 같은 코드 글자는 금지 용어로 센다.
  const CODE_ALLOW = new Set(["공간", "워크스페이스", "조회 범위", "실어댑터", "레일", "서브모듈"]);
  const CODE_ALLOW_LINE = /id="source-L137"/;
  let hits = 0;
  const allowed = [];
  const allowedCode = new Map();

  for (const page of pages) {
    const src = html[page];
    // 스크립트·스타일·템플릿은 보이는 글이 아니다. 태그 안의 alt·aria-label·title 값은 보이는 글로 센다.
    const lines = src.split("\n");
    for (let n = 0; n < lines.length; n++) {
      const line = lines[n];
      const visible = line
        .replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
        .replace(/<code>([\s\S]*?)<\/code>/g, (m, inner) => {
          const name = inner.replace(/<[^>]*>/g, "").trim();
          if (!CODE_ALLOW.has(name) || !CODE_ALLOW_LINE.test(line)) return inner;
          allowedCode.set(name, (allowedCode.get(name) || 0) + 1);
          return " ";
        })
        .replace(/(?:alt|aria-label|title)="([^"]*)"/g, " >$1< ")
        .replace(/<[^>]*>/g, " ");
      for (const [name, re] of terms) {
        const m = re.exec(visible);
        if (!m) continue;
        const context = visible.slice(Math.max(0, m.index - 24), m.index + 24).replace(/\s+/g, " ");
        // 허용: ① GLOSSARY.md에 같은 문장이 있는 정의(용어 페이지) ② 옛 표기를 인용한 원장 문구
        // ③ 데이터 자산 허브의 표 게시(지표 버전 `발행`과 다른 동작이라 용어집이 정한 `게시` 금지 대상이 아니다)
        const plain = norm(line.replace(/<dt[^>]*>.*?<\/dt>/, " ").replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")).replace(/근거 L\d+/g, "").replace(/\s+/g, "");
        const inGlossary = page === "glossary.html" && plain.length > 12 && glossaryText.replace(/\s+/g, "").includes(plain);
        const quoted = /조회 범위 초과|서브모듈 아님|서브모듈이 아닌|서브모듈 문구|서브모듈 포인터/.test(visible) || (name === "게시" && /권한[에별]?\S* ?게시|게시한 표|게시하면|권한별 게시/.test(visible));
        if (inGlossary || quoted) allowed.push(`${page}:${n + 1} ${name} … ${context}`);
        else {
          hits += 1;
          console.log(`    ${page}:${n + 1} [${name}] …${context}…`);
        }
      }
    }
  }
  hits ? fail(`금지 용어 ${hits}건`) : pass("남은 금지 용어 0건");
  if (allowedCode.size) console.log(`  허용한 코드 이름(개발자 부록): ${[...allowedCode].map(([n, c]) => `${n}×${c}`).join(", ")}`);
  if (allowed.length) {
    console.log(`  허용(인용·정의) ${allowed.length}건:`);
    for (const a of allowed) console.log(`    ${a}`);
  }
}

// 4c) 마크다운 백틱이 보이는 글·alt에 남았는지(W-725 UX3). 개발자 부록의 코드 발췌(<pre>)는 백틱이 내용의 일부라 제외한다.
console.log("백틱: 보이는 글·alt");
{
  const spots = [];
  for (const page of pages) {
    // 지우는 구간도 줄바꿈 수를 유지해 줄 번호가 원본과 같게 한다. alt·aria-label·title 값은 보이는 글로 센다.
    const text = html[page]
      .replace(/<(script|style|template)\b[\s\S]*?<\/\1>/g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/<pre\b[\s\S]*?<\/pre>/g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/(?:alt|aria-label|title)="([^"]*)"/g, (m, v) => " >" + v + "< ")
      .replace(/<[^>]*>/g, " ");
    for (const m of text.matchAll(/`/g))
      spots.push(`${page} 줄 ${lineOf(text, m.index)}: …${text.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, " ").trim()}…`);
  }
  spots.length ? fail(`보이는 글·alt의 백틱 ${spots.length}건 — ${spots.slice(0, 8).join(" · ")}`) : pass("0건");
}

// 5) 브라우저: 가로 스크롤과 화면 캡처
if (options.browser) {
  console.log("브라우저(1440·390)");
  const { chromium } = createRequire(join(root, "apps/platform-e2e/package.json"))("@playwright/test");
  const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json" };
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = resolve(options.site, "." + (path.endsWith("/") ? path + "index.html" : path));
    if (!file.startsWith(options.site)) return res.writeHead(403).end();
    try {
      res.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" }).end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    if (options.shots) await mkdir(options.shots, { recursive: true });
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce", locale: "ko-KR" });
      for (const page of ["index.html", "glossary.html"]) {
        const tab = await context.newPage();
        await tab.goto(`${origin}/${page}`);
        await tab.evaluate(() => document.fonts.ready);
        await tab.waitForTimeout(500);
        const measure = () => tab.evaluate(() => ({ scroll: document.scrollingElement.scrollWidth, inner: window.innerWidth }));
        const closed = await measure();
        closed.scroll <= closed.inner ? pass(`${page} ${width}px 접힌 상태: scrollWidth ${closed.scroll} ≤ ${closed.inner}`) : fail(`${page} ${width}px 접힌 상태: scrollWidth ${closed.scroll} > ${closed.inner}`);
        if (options.shots && page === "index.html") await tab.screenshot({ path: join(options.shots, `site-${width}.png`), fullPage: true });
        if (options.shots && page === "index.html" && width === 1440) {
          for (const id of ["intro", "features", "board", "context", "deeplink", "components", "permission", "errors", "platform-menu", "usage", "next", "status", "ask", "extend"]) {
            const section = tab.locator(`#${id}`);
            if (!(await section.isVisible())) continue; // 부록의 접힌 절은 건너뛴다
            await section.scrollIntoViewIfNeeded();
            await section.screenshot({ path: join(options.shots, `section-${id}.png`) });
          }
        }
        // 모두 펼친 상태(접힌 도식·부록까지)
        await tab.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
        await tab.waitForTimeout(500);
        const open = await measure();
        open.scroll <= open.inner ? pass(`${page} ${width}px 모두 펼침: scrollWidth ${open.scroll} ≤ ${open.inner}`) : fail(`${page} ${width}px 모두 펼침: scrollWidth ${open.scroll} > ${open.inner}`);
        await tab.close();
      }
      await context.close();
    }
    // V1: 부록이 닫힌 채로 `크게 보기`가 동작해야 한다(대화상자가 닫힌 <details> 안에 있으면 0×0 모달이 되어 페이지가 멈춘다).
    console.log("확대 대화상자(모든 details 닫힘)");
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce", locale: "ko-KR" });
      const tab = await context.newPage();
      await tab.goto(`${origin}/index.html`);
      await tab.evaluate(() => document.fonts.ready);
      const inDetails = await tab.evaluate(() => Boolean(document.getElementById("shot-dialog")?.closest("details")));
      inDetails ? fail(`${width}px: #shot-dialog가 <details> 안에 있음`) : pass(`${width}px: #shot-dialog는 <details> 밖`);
      const sections = await tab.evaluate(() => [...document.querySelectorAll("section[id]")].filter((s) => [...s.querySelectorAll(".shot-zoom")].some((b) => b.offsetParent !== null && !b.closest("details:not([open])"))).map((s) => s.id));
      let tested = 0;
      for (const id of sections) {
        const button = tab.locator(`section#${id} .shot-zoom:visible`).first();
        await button.scrollIntoViewIfNeeded();
        await button.click();
        const box = await tab.locator("#shot-dialog").boundingBox();
        const image = await tab.locator("#shot-dialog-image").boundingBox();
        const open = await tab.evaluate(() => document.getElementById("shot-dialog").open);
        if (!open || !box || box.width < 100 || box.height < 100 || !image || image.width < 50 || image.height < 20) {
          fail(`${width}px #${id}: 대화상자가 보이지 않음 (open=${open}, 상자 ${box ? `${Math.round(box.width)}×${Math.round(box.height)}` : "없음"})`);
          await tab.keyboard.press("Escape");
          continue;
        }
        if (width === 1440) {
          // UX3: 1440×900에서 이전·다음 단추가 대화상자 안에(내부 스크롤 없이) 그대로 보여야 한다.
          const fit = await tab.evaluate(() => {
            const dialog = document.getElementById("shot-dialog");
            const area = dialog.getBoundingClientRect();
            const bars = ["[data-shot-prev]", "[data-shot-next]"].map((sel) => dialog.querySelector(sel).getBoundingClientRect());
            return {
              overflow: dialog.scrollHeight - dialog.clientHeight,
              dialogTop: area.top,
              dialogBottom: area.bottom,
              buttons: bars.map((r) => ({ top: r.top, bottom: r.bottom })),
            };
          });
          const inside =
            fit.overflow <= 0 &&
            fit.buttons.every((b) => b.top >= fit.dialogTop && b.bottom <= fit.dialogBottom && b.top >= 0 && b.bottom <= 900);
          inside
            ? pass(`1440px #${id}: 이전·다음이 대화상자 안 (내부 넘침 ${fit.overflow}px)`)
            : fail(`1440px #${id}: 이전·다음이 대화상자 밖 (내부 넘침 ${fit.overflow}px, 단추 아래끝 ${fit.buttons.map((b) => Math.round(b.bottom)).join("·")}px, 대화상자 아래끝 ${Math.round(fit.dialogBottom)}px)`);
        }
        await tab.keyboard.press("Escape");
        const closed = await tab.evaluate(() => !document.getElementById("shot-dialog").open);
        // 닫은 뒤 다음 단추가 클릭을 받는지(모달이 남아 페이지를 막지 않는지) 본다.
        const next = tab.locator(".shot-zoom:visible").last();
        await next.scrollIntoViewIfNeeded();
        const clickable = await next.click({ trial: true, timeout: 3000 }).then(() => true, () => false);
        if (!closed || !clickable) fail(`${width}px #${id}: 닫은 뒤 페이지가 클릭을 받지 않음 (closed=${closed})`);
        else tested += 1;
      }
      tested >= 3 ? pass(`${width}px: 절 ${tested}곳에서 열림·닫힘·클릭 가능`) : fail(`${width}px: 확인한 절이 ${tested}곳(3곳 이상 필요)`);
      await context.close();
    }
    // V3: 처음 여는 페이지에서 목차 앵커로 가면 제목이 맨 위 근처에 멈춰야 한다(이미지가 로드된 뒤에도).
    console.log("목차 앵커 도착 위치(처음 로드)");
    for (const width of [1440, 390]) {
      for (const id of ["usage", "platform-menu", "components"]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce", locale: "ko-KR" });
        const tab = await context.newPage();
        await tab.goto(`${origin}/index.html#${id}`);
        await tab.evaluate(() => document.fonts.ready);
        await tab.waitForTimeout(800);
        // 지연 로드 이미지를 모두 불러온 뒤 다시 잰다.
        await tab.evaluate(() => document.querySelectorAll("img[loading=lazy]").forEach((img) => (img.loading = "eager")));
        await tab.waitForFunction(() => [...document.images].every((img) => img.complete), undefined, { timeout: 20000 });
        await tab.waitForTimeout(500);
        // 도착 대상은 절(#id)이다. 위쪽에는 고정 머리를 위한 scroll-padding(74px)이 있어 절 윗선은 그 근처에 선다.
        // 절 안의 제목(h2)은 절 안쪽 여백만큼 아래에 있으므로 맨 위에서 200px 이내여야 한다(이미지 로드 뒤에도).
        const { top, heading } = await tab.evaluate((target) => {
          const section = document.getElementById(target);
          const h2 = section.querySelector("h2") || section;
          return { top: Math.round(section.getBoundingClientRect().top), heading: Math.round(h2.getBoundingClientRect().top) };
        }, id);
        top >= 60 && top <= 110 && heading >= 0 && heading <= 200
          ? pass(`${width}px #${id}: 절 윗선 ${top}px · 제목 ${heading}px`)
          : fail(`${width}px #${id}: 절 윗선 ${top}px(60–110px여야 함) · 제목 ${heading}px(0–200px여야 함)`);
        await context.close();
      }
    }
    // 모바일 목차: Esc로 닫고 포커스가 토글로 돌아온다.
    console.log("모바일 목차 Esc");
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: "reduce", locale: "ko-KR" });
      const tab = await context.newPage();
      await tab.goto(`${origin}/index.html`);
      await tab.locator(".mobile-toc summary").click();
      const opened = await tab.evaluate(() => document.querySelector(".mobile-toc").open);
      await tab.keyboard.press("Escape");
      const state = await tab.evaluate(() => ({ open: document.querySelector(".mobile-toc").open, focus: document.activeElement === document.querySelector(".mobile-toc summary") }));
      opened && !state.open && state.focus ? pass("Esc로 닫히고 포커스가 토글로 돌아옴") : fail(`목차 Esc: 열림=${opened} 닫힌 뒤 open=${state.open} 포커스 복귀=${state.focus}`);
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
}
console.log(failed ? `\n실패 ${failed}건` : "\n모두 통과");
process.exitCode = failed ? 1 : 0;
