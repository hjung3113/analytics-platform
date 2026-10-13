#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile, access, readdir, realpath, lstat, unlink, rmdir } from "node:fs/promises";
import { resolve, dirname, join, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const site = join(root, "site");
const args = process.argv.slice(2);
const options = { "site-base": "/analytics-platform/", ref: "main", commit: "", assumption: false };
const values = new Set(["out", "demo", "site-base", "ref", "commit"]);
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
  [join(root, "products/feedbackops/packages/ui/src/styles/tokens.css"), "fops-tokens.css"],
  [join(root, "packages/ui/src/styles/tokens.css"), "ap-tokens.css"],
];
for (const [source] of tokens) await access(source); // Missing submodule is a hard failure.
if (demo) await access(join(demo, "index.html"));
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
for (const name of ["index.html", "assets"]) await cp(join(site, name), join(out, name), { recursive: true });
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
let html = await readFile(join(out, "index.html"), "utf8");
html = html
  .replaceAll("/blob/main/", `/blob/${encodeURIComponent(options.ref).replaceAll("%2F", "/")}/`)
  .replace("<!-- LOCAL_FONTS -->", fontLinks.join(""));
// D1–D10 지시문은 demo-step-copy 템플릿 한 곳에서만 관리하고, 조립 때 모든 사본에
// 같은 문장을 심는다. 빌드 타임 채우기이므로 JS가 꺼진 페이지에도 문장이 보인다.
const stepTemplate = html.match(/<template id="demo-step-copy">([\s\S]*?)<\/template>/);
if (!stepTemplate) throw new Error('index.html에 <template id="demo-step-copy">가 없습니다.');
const stepCopy = new Map();
for (const [, id, text] of stepTemplate[1].matchAll(/<p data-demo-step="(D\d+)">([\s\S]*?)<\/p>/g))
  stepCopy.set(id, text.replace(/\s+/g, " ").trim());
if (stepCopy.size !== 10)
  throw new Error(`demo-step-copy 템플릿에 D 문장이 ${stepCopy.size}개 있습니다(10개 필요).`);
let filled = 0;
html = html.replace(/<p data-demo-step="(D\d+)"><\/p>/g, (m, id) => {
  const sentence = stepCopy.get(id);
  if (!sentence) throw new Error(`demo-step-copy에 ${id} 문장이 없습니다.`);
  filled += 1;
  return `<p>${sentence}</p>`;
});
if (filled === 0) throw new Error("index.html에 채울 <p data-demo-step> 자리가 없습니다.");
html = html.replace(stepTemplate[0], "");
await writeFile(join(out, "index.html"), html);
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
