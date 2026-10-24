#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile, access, readdir, realpath, lstat, unlink, rmdir } from "node:fs/promises";
import { resolve, dirname, join, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const site = join(root, "site");
const args = process.argv.slice(2);
const options = { "site-base": "/analytics-platform/", ref: "main", commit: "", assumption: false };
const values = new Set(["out", "demo", "site-base", "ref", "commit", "shots"]);
for (let i = 0; i < args.length; i++) {
  const key = args[i].replace(/^--/, "");
  if (args[i] === "--assumption") options.assumption = true;
  else if (args[i].startsWith("--") && values.has(key) && args[i + 1] && !args[i + 1].startsWith("--"))
    options[key] = args[++i];
  else throw new Error(`알 수 없거나 값이 없는 인수: ${args[i]}`);
}
if (!options.out) throw new Error("--out <dir>가 필요합니다.");
if (!/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(options["site-base"]))
  throw new Error("--site-base는 /로 시작하고 끝나는 배포 경로여야 합니다.");
// Only empty a disposable output folder, never repository sources, an ancestor,
// or a symlink. Check before writes; the assembler also works in $TMPDIR.
const out = resolve(options.out);
const demo = options.demo ? resolve(options.demo) : null;
const within = (child, parent) => {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};
if (
  within(root, out) ||
  within(out, site) ||
  (within(out, root) && out !== join(root, "_site")) ||
  (demo && (within(demo, out) || within(out, demo)))
) {
  throw new Error("출력 경로가 소스 또는 데모 경로와 겹칩니다. 저장소 안에서는 _site/만 사용하세요.");
}
// PNG·JPEG 파일의 픽셀 크기(본문 <img>의 width·height 속성에 쓴다).
function imageSize(path) {
  const buffer = readFileSync(path);
  if (buffer.toString("ascii", 1, 4) === "PNG") return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  for (let at = 2; at + 9 < buffer.length; ) {
    if (buffer[at] !== 0xff) throw new Error(`JPEG 구조를 읽지 못했습니다: ${path}`);
    const marker = buffer[at + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return { height: buffer.readUInt16BE(at + 5), width: buffer.readUInt16BE(at + 7) };
    at += 2 + buffer.readUInt16BE(at + 2);
  }
  throw new Error(`이미지 크기를 읽지 못했습니다: ${path}`);
}
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
// Resolve the parent as well, so a symlinked ancestor cannot redirect deletion.
await mkdir(dirname(out), { recursive: true });
const physicalOut = join(await realpath(dirname(out)), out.split(/[\\/]/).at(-1));
if (physicalOut !== out && (within(root, physicalOut) || within(physicalOut, root)))
  throw new Error("출력 경로의 심링크 조상이 저장소와 겹칩니다.");
if (await exists(out)) {
  if ((await lstat(out)).isSymbolicLink()) throw new Error("출력 폴더는 심링크일 수 없습니다.");
  if (!(await lstat(out)).isDirectory()) throw new Error("출력은 폴더여야 합니다.");
  if ((await readdir(out)).length && !(await exists(join(out, "site-config.js"))))
    throw new Error("기존 출력에 site-config.js가 없습니다. 비어 있는 새 폴더를 지정하세요.");
}
const css = await readFile(join(site, "assets/site.css"), "utf8");
if (
  /#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})\b|rgba?\(\s*[\d.+-]|hsla?\(/i.test(
    css.replace(/\/\*[\s\S]*?\*\//g, ""),
  )
) {
  throw new Error("site.css에는 색 literal을 쓸 수 없습니다. semantic 토큰을 사용하세요.");
}
const tokens = [
  [join(root, "packages/ui/src/styles/tokens.css"), "fops-tokens.css"],
  [join(root, "packages/ui/src/styles/platform-tokens.css"), "ap-tokens.css"],
];
for (const [source] of tokens) await access(source); // Missing token source is a hard failure.
if (demo) await access(join(demo, "index.html"));
const shotsDir = options.shots ? resolve(options.shots) : null;
let shots = [];
if (shotsDir) {
  if (within(shotsDir, out) || within(out, shotsDir)) throw new Error("캡처와 출력 경로가 겹칩니다.");
  shots = JSON.parse(await readFile(join(shotsDir, "shots.json"), "utf8"));
  if (!Array.isArray(shots) || !shots.length) throw new Error("shots.json은 비어 있지 않은 배열이어야 합니다.");
  const ids = new Set(),
    cards = new Set();
  for (const shot of shots) {
    if (!/^[a-z][a-z0-9-]*$/.test(shot.id) || ids.has(shot.id)) throw new Error("잘못되거나 중복된 캡처 id");
    ids.add(shot.id);
    if (
      !["charts", "tables", "shell", "states"].includes(shot.group) ||
      typeof shot.title !== "string" ||
      typeof shot.description !== "string" ||
      typeof shot.path !== "string" ||
      !/^\/(?!\/)/.test(shot.path) ||
      /[\\<>]/.test(shot.path) ||
      !Number.isInteger(shot.width) ||
      !Number.isInteger(shot.height) ||
      shot.width < 1 ||
      shot.height < 1 ||
      !(shot.scale === undefined ? true : Number.isInteger(shot.scale) && shot.scale >= 1) ||
      !(shot.fit === undefined || shot.fit === "cover-top") ||
      !Array.isArray(shot.cards)
    )
      throw new Error(`잘못된 캡처 메타데이터: ${shot.id}`);
    if (
      shot.marks !== undefined &&
      !(
        Array.isArray(shot.marks) &&
        shot.marks.every(
          (m) => Number.isInteger(m.n) && m.n >= 1 && m.n <= 9 && m.x >= 0 && m.x <= 100 && m.y >= 0 && m.y <= 100,
        )
      )
    )
      throw new Error(`잘못된 캡처 번호 위치(marks): ${shot.id}`);
    for (const card of shot.cards) {
      if (!/^(C(?:[1-9]|1[0-4])|U[1-9]|K(?:[1-9]|10))$/.test(card) || cards.has(card))
        throw new Error(`잘못되거나 중복된 카드 대응: ${card}`);
      cards.add(card);
    }
    const png = await readFile(join(shotsDir, `${shot.id}.png`));
    const pixelScale = shot.scale || 1;
    if (
      png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
      png.readUInt32BE(16) !== shot.width * pixelScale ||
      png.readUInt32BE(20) !== shot.height * pixelScale
    )
      throw new Error(`PNG 크기가 원장과 다릅니다: ${shot.id}`);
  }
}
// Delete only the validated output contents. Do not follow nested symlinks.
async function empty(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await empty(path);
      await rmdir(path);
    } else await unlink(path);
  }
}
await mkdir(out, { recursive: true });
await empty(out);
for (const name of ["index.html", "glossary.html", "assets"]) await cp(join(site, name), join(out, name), { recursive: true });
await mkdir(join(out, "assets/tokens"), { recursive: true });
for (const [source, name] of tokens) await cp(source, join(out, "assets/tokens", name));
// SVG image documents cannot reliably import external token stylesheets. Resolve
// only the mark's three variables from the exact copied product files.
const tokenText = (await Promise.all(tokens.map(([source]) => readFile(source, "utf8"))))
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");
const tokenValues = new Map(
  Array.from(tokenText.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g), (match) => [match[1], match[2].trim()]),
);
function resolveToken(name, seen = new Set()) {
  if (seen.has(name) || !tokenValues.has(name)) throw new Error(`favicon token missing/cyclic: ${name}`);
  const next = new Set(seen).add(name);
  return tokenValues.get(name).replace(/var\((--[\w-]+)\)/g, (_, key) => resolveToken(key, next));
}
const markTokens = ["--accent-primary", "--text-on-accent", "--font-sans", "--radius-md"]
  .map((name) => `${name}:${resolveToken(name)};`)
  .join("");
const mark = await readFile(join(site, "assets/favicon.svg"), "utf8");
await writeFile(join(out, "assets/favicon.svg"), mark.replace("/* PRODUCT_FAVICON_TOKENS */", `:root{${markTokens}}`));

const modules = join(root, "apps/platform-web/node_modules");
const fonts = [
  { name: "inter", pkg: "@fontsource-variable/inter", css: "index.css", files: "files" },
  { name: "jetbrains-mono", pkg: "@fontsource-variable/jetbrains-mono", css: "index.css", files: "files" },
  {
    name: "pretendard",
    pkg: "pretendard",
    css: "dist/web/variable/pretendardvariable-dynamic-subset.css",
    files: "dist/web/variable/woff2-dynamic-subset",
  },
];
const fontLinks = [];
for (const font of fonts) {
  const source = join(modules, font.pkg);
  if (!(await exists(join(source, font.css))) || !(await exists(join(source, font.files)))) {
    console.warn(`경고: ${font.pkg} 폰트가 없습니다. 시스템 폰트로 계속합니다.`);
    continue;
  }
  const dest = join(out, "assets/fonts", font.name);
  await mkdir(dest, { recursive: true });
  const cssName = font.css.split("/").at(-1);
  await cp(join(source, font.css), join(dest, cssName));
  await cp(join(source, font.files), join(dest, font.files.split("/").at(-1)), { recursive: true });
  let copiedLicense = false;
  // pretendard keeps its license under dist/.
  for (const name of ["LICENSE", "LICENSE.txt", "LICENSE.md", "OFL.txt", "dist/LICENSE.txt"]) {
    if (await exists(join(source, name))) {
      await cp(join(source, name), join(dest, "LICENSE"));
      copiedLicense = true;
      break;
    }
  }
  if (!copiedLicense) throw new Error(`${font.pkg}: 폰트 LICENSE가 없습니다.`);
  fontLinks.push(`<link rel="stylesheet" href="assets/fonts/${font.name}/${cssName}">`);
}
const localizePage = (page) =>
  page
    .replaceAll("/blob/main/", `/blob/${encodeURIComponent(options.ref).replaceAll("%2F", "/")}/`)
    .replace("<!-- LOCAL_FONTS -->", fontLinks.join(""));
let html = localizePage(await readFile(join(out, "index.html"), "utf8"));
let glossaryHtml = localizePage(await readFile(join(out, "glossary.html"), "utf8"));
// D1–D10 지시문은 demo-step-copy 템플릿 한 곳에서만 관리하고, 조립 때 모든 사본에
// 같은 문장을 심는다. 빌드 타임 채우기이므로 JS가 꺼진 페이지에도 문장이 보인다.
const stepTemplate = html.match(/<template id="demo-step-copy">([\s\S]*?)<\/template>/);
if (!stepTemplate) throw new Error('index.html에 <template id="demo-step-copy">가 없습니다.');
const stepCopy = new Map();
for (const [, id, text] of stepTemplate[1].matchAll(/<p data-demo-step="(D\d+)">([\s\S]*?)<\/p>/g))
  stepCopy.set(id, text.replace(/\s+/g, " ").trim());
if (stepCopy.size !== 10) throw new Error(`demo-step-copy 템플릿에 D 문장이 ${stepCopy.size}개 있습니다(10개 필요).`);
let filled = 0;
html = html.replace(/<p data-demo-step="(D\d+)"><\/p>/g, (m, id) => {
  const sentence = stepCopy.get(id);
  if (!sentence) throw new Error(`demo-step-copy에 ${id} 문장이 없습니다.`);
  filled += 1;
  return `<p>${sentence}</p>`;
});
if (filled === 0) throw new Error("index.html에 채울 <p data-demo-step> 자리가 없습니다.");
html = html.replace(stepTemplate[0], "");
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
// 확대 대화상자는 캡처 갤러리와 별개로, 확대 단추가 있는 고정 JPG(assets/real)만 있어도 있어야 단추가 동작한다.
const shotDialog = `<dialog class="shot-dialog" id="shot-dialog" aria-modal="true" aria-labelledby="shot-dialog-title" aria-describedby="shot-dialog-description"><div class="shot-dialog-controls"><h3 id="shot-dialog-title"></h3><button type="button" data-shot-close autofocus>닫기</button></div><img id="shot-dialog-image" alt=""><p id="shot-dialog-description"></p><div class="shot-dialog-controls"><button type="button" data-shot-prev>이전</button><span id="shot-dialog-position" role="status"></span><button type="button" data-shot-next>다음</button><a class="button secondary" data-demo hidden id="shot-dialog-demo" target="_blank" rel="noopener">데모에서 열기</a></div></dialog>`;
if (shots.length) {
  await mkdir(join(out, "assets/shots"), { recursive: true });
  for (const shot of shots) await cp(join(shotsDir, `${shot.id}.png`), join(out, "assets/shots", `${shot.id}.png`));
  await cp(join(shotsDir, "shots.json"), join(out, "assets/shots/shots.json"));
  const image = (shot) =>
    `<img src="assets/shots/${shot.id}.png" loading="lazy" width="${shot.width * (shot.scale || 1)}" height="${shot.height * (shot.scale || 1)}"${shot.fit === "cover-top" ? ' data-fit="cover-top"' : ""} alt="${escapeHtml(shot.title + ". " + shot.description)}">`;
  const groups = [
    ["all", "전체"],
    ["charts", "차트"],
    ["tables", "표와 상세"],
    ["shell", "셸과 탐색"],
    ["states", "상태 화면"],
  ];
  const filters = groups
    .map(
      ([id, label]) =>
        `<button type="button" data-shot-filter="${id}" aria-pressed="${id === "all"}">${label}</button>`,
    )
    .join("");
  // inset-* 캡처는 히어로 확대용 조각이라 갤러리에 다시 싣지 않는다.
  const galleryShots = shots.filter((shot) => !shot.id.startsWith("inset-"));
  const tiles = galleryShots
    .map((shot) => {
      // 상태 화면은 응답 시나리오를 링크로 재현할 수 없으므로 데모 링크 대신
      // 재현 방법을 한 줄로 안내한다.
      const demoLink =
        shot.group === "states"
          ? `<p class="caption">데모의 개발 도구 응답 시나리오로 재현</p>`
          : `<a data-demo hidden href="demo${escapeHtml(shot.path)}" target="_blank" rel="noopener">데모에서 열기</a>`;
      return `<article class="shot-tile" data-shot-group="${shot.group}"><button type="button" class="shot-open" data-shot-open="${shot.id}" aria-haspopup="dialog" aria-label="${escapeHtml(shot.title)} 크게 보기">${image(shot)}</button><div class="shot-copy"><h4>${escapeHtml(shot.title)}</h4><p>${escapeHtml(shot.description)}</p>${demoLink}</div></article>`;
    })
    .join("");
  const gallery = `<details class="appendix-content gallery-details" id="actual-shots-details"><summary>실제 화면 ${galleryShots.length}장 펼치기</summary><div class="shot-gallery" id="actual-shots" aria-labelledby="actual-shots-heading"><h3 id="actual-shots-heading">실제 화면</h3><p class="lead">아래는 데모 앱을 배포 때마다 자동으로 찍은 실제 화면입니다(mock 합성 데이터).</p><p class="caption">등록 유형: 선·막대(메뉴 사용 중)·파이·산점도(등록됨, 메뉴 미사용). <a class="source-ref" href="#source-L62">L62</a> · <a class="source-ref" href="#source-L63">L63</a></p><div class="shot-filters" role="group" aria-label="실제 화면 분류">${filters}</div><p id="shot-count" class="caption" role="status" aria-live="polite">${galleryShots.length}개 화면</p><div class="shot-grid">${tiles}</div></div></details>`;
  html = html
    .replace(
      "<!-- ACTUAL_SHOTS -->",
      `<section class="appendix-section" id="appendix-g" aria-labelledby="appendix-g-heading"><p class="section-label">부록 G · 개발자 참고</p><h2 id="appendix-g-heading">실제 화면 갤러리</h2>${gallery}</section>`,
    )
    .replace(
      "<!-- CHART_BRANCH_SHOTS_LINK -->",
      '<a href="#actual-shots" data-chart-shots-link>갤러리에서 실제 차트 보기 →</a>',
    );
  html = html.replace(
    /(<p class="caption" id="component-preview-caption">)[\s\S]*?<\/p>/,
    "$1캡처가 있는 카드는 실제 화면을 보여 줍니다. 나머지는 제품 토큰으로 그린 모형이며 값은 예시입니다.</p>",
  );
  for (const shot of shots)
    for (const card of shot.cards) {
      const cardStart = html.indexOf(`data-card="${card}"`);
      const previewStart = html.indexOf('<span class="preview"', cardStart);
      const nameStart = html.indexOf('<span class="card-name">', previewStart);
      if (cardStart < 0 || previewStart < 0 || nameStart < 0) throw new Error(`카드 미리보기 없음: ${card}`);
      const thumbnail = image(shot).replace("<img ", '<img class="preview shot-thumb" ');
      html = html.slice(0, previewStart) + thumbnail + html.slice(nameStart);
    }
} else {
  html = html
    .replace("<!-- ACTUAL_SHOTS -->", "")
    .replace('<p class="caption"><!-- CHART_BRANCH_SHOTS_LINK --></p>', "");
}
// 본문 캡처 자리: 캡처가 있으면 이미지(와 번호 위치)를 심고, 없으면 자리 전체를 지운다.
// 캡처 없는 조립에서도 도식과 글만으로 페이지가 읽힌다.
const figureSlot = /<figure class="([^"]*)" data-shot-fig="([a-z][a-z0-9-]*)">([\s\S]*?)<\/figure>/g;
const shotById = new Map(shots.map((shot) => [shot.id, shot]));
// 캡처 폴더를 받았다면 본문이 요구하는 캡처가 모두 있어야 한다. 빠진 캡처는 조용히 지우지 않고 조립을 멈춘다.
if (shots.length) {
  const wanted = [...new Set([...html.matchAll(/data-shot-fig="([a-z][a-z0-9-]*)"/g)].map((m) => m[1]))];
  const missing = wanted.filter((id) => !shotById.has(id));
  if (missing.length) throw new Error(`본문이 요구하는 캡처가 캡처 폴더에 없습니다: ${missing.join(", ")}`);
}
html = html.replace(figureSlot, (whole, cls, id, inner) => {
  const shot = shotById.get(id);
  if (!shot) return "";
  // CSS의 width:auto는 width 속성을 무시하고 PNG 픽셀(DPR2)로 되돌아가므로 CSS px 폭을 인라인으로 고정한다(2배 확대 방지).
  const img = `<img src="assets/shots/${shot.id}.png" loading="lazy" width="${shot.width * (shot.scale || 1)}" height="${shot.height * (shot.scale || 1)}" style="width:${shot.width}px;aspect-ratio:${shot.width}/${shot.height}" alt="${escapeHtml(shot.title + ". " + shot.description)}">`;
  const marks = (shot.marks || []).length
    ? `<ol class="callouts" aria-hidden="true">${shot.marks.map((m) => `<li style="--x:${m.x}%;--y:${m.y}%"><span class="callout-no">${m.n}</span></li>`).join("")}</ol>`
    : "";
  // 본문 캡처는 부록 갤러리와 같은 확대 대화상자로 열어, 좁은 화면에서도 글자를 읽게 한다(히어로 견본 화면은 제외).
  const zoomable = !cls.split(" ").includes("stack-shot");
  const picture = zoomable
    ? `<button type="button" class="shot-zoom" data-shot-open="${id}" aria-haspopup="dialog" aria-label="${escapeHtml(shot.title)} 크게 보기">${img}</button>`
    : img;
  return `<figure class="${cls}" data-shot-fig="${id}"><span class="shot-frame">${picture}${marks}</span>${inner.replace("<!--shot:" + id + "-->", "")}</figure>`;
});
// 고정 JPG(assets/proto, 실서버 모드 assets/real)도 같은 확대 대화상자로 연다(캡처 유무와 무관).
html = html.replace(
  /<figure class="(shot-figure(?: shot-[a-z]+)?)"><img src="(assets\/(?:proto|real)\/[a-z0-9-]+\.jpg)" loading="lazy" alt="([^"]*)">/g,
  (whole, cls, src, alt) => {
    // 로드 전에도 자리를 잡도록 파일의 픽셀 크기를 width·height로 쓴다.
    const { width, height } = imageSize(join(site, src));
    return `<figure class="${cls}"><button type="button" class="shot-zoom" data-shot-open="${src}" aria-haspopup="dialog" aria-label="${alt} 크게 보기"><img src="${src}" loading="lazy" width="${width}" height="${height}" alt="${alt}"></button>`;
  },
);
// 확대 대화상자는 닫힌 <details> 안에 두면 0×0 모달이 되어 페이지가 멈추므로 <body>의 직계 자식으로 한 번만 둔다.
html = html.replace(/<\/body>/, `${shotDialog}</body>`);
// 캡처 자리가 모두 지워진 묶음과, 그래서 내용이 빈 캡처 전용 접기는 함께 지운다(빈 토글을 남기지 않는다).
html = html
  .replace(/<div class="(?:state-row|tools-grid|shots-row)"[^>]*>\s*<\/div>/g, "")
  .replace(/<details class="evidence-details flow-details">\s*<summary>[^<]*<\/summary>\s*<\/details>/g, "");
if (!shotById.has("change-audit")) html = html.replace("견본 캡처와 권한 판정 흐름 보기 — 변경 감사, ", "권한 판정 흐름 보기 — ");
// 히어로의 견본 화면 세 장(MARS·BRAVO·운영 콘솔)이 모두 있어야 합성 그림을 보인다. 하나라도 없으면 그 블록을 지우고
// 캡처 없는 조립에서는 도식 A를 히어로에도 보인다(id는 접미사로 구분).
const hasHeroStack = ["cycle-time-full", "catalog", "clas-operation-time"].every((id) => shotById.has(id));
if (!hasHeroStack) html = html.replace(/<!--HERO_STACK-->[\s\S]*?<!--\/HERO_STACK-->/, "");
const heroFallback = hasHeroStack
  ? ""
  : (html.match(/<figure class="diagram diagram-a">[\s\S]*?<\/figure>/)?.[0] || "")
      .replaceAll("fig-a-", "fig-a0-")
      .replaceAll("arrow-a", "arrow-a0")
      .replace("diagram diagram-a", "diagram diagram-a diagram-hero");
html = html.replace("<!--HERO_FALLBACK-->", heroFallback);
await writeFile(join(out, "index.html"), html);
await writeFile(join(out, "glossary.html"), glossaryHtml);
const noindex = (html) =>
  /<meta\b[^>]*name=["']robots["']/i.test(html)
    ? html
    : html.replace(/<head\b[^>]*>/i, '$&<meta name="robots" content="noindex,nofollow">');
if (demo) {
  await cp(demo, join(out, "demo"), { recursive: true });
  const demoHtml = noindex(await readFile(join(out, "demo/index.html"), "utf8"));
  await writeFile(join(out, "demo/index.html"), demoHtml);
  await writeFile(join(out, "demo/404.html"), demoHtml);
  const base = options["site-base"];
  const guard = `<script>if(!location.pathname.startsWith(${JSON.stringify(base + "demo/")}))location.replace(${JSON.stringify(base)});</script>`;
  await writeFile(join(out, "404.html"), demoHtml.replace(/<head\b[^>]*>/i, "$&" + guard));
}
const config = {
  demo: Boolean(demo),
  demoPath: "demo/",
  ref: options.ref,
  commit: options.commit,
  builtAt: new Date().toISOString().slice(0, 10),
  assumption: options.assumption,
};
await writeFile(join(out, "site-config.js"), `window.SITE = ${JSON.stringify(config).replaceAll("<", "\\u003c")};\n`);
await writeFile(join(out, ".nojekyll"), "");
console.log(`사이트 조립 완료: ${out} (demo=${config.demo}, assumption=${config.assumption})`);
