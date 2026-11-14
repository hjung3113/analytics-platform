import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * #2243: in Safari the Enter that confirms a Korean composition arrives after `compositionend` with `isComposing` already
 * false, so a form with a text field submits on it. Every `<form>` in a screen source that also draws a text field
 * (`Input`, `input`) carries the form-level guard of `useImeEnterGuard()` from `@ap/ui`: its `onKeyDown`,
 * `onCompositionStart` and `onCompositionEnd`. The `ap/ime-enter-guard` lint checks field handlers only, not forms.
 * A form whose fields are only Selects or textareas needs no guard (a textarea Enter never submits); such a file has no
 * text field and is skipped.
 */
const SRC = path.resolve(__dirname, "..");
const TEXT_FIELD = /<(Input|input)\b(?![^>]*type=["'](?:date|datetime-local|time|number|checkbox|radio|file|hidden)["'])/;

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sources(full);
    return entry.name.endsWith(".tsx") && !entry.name.includes(".test.") ? [full] : [];
  });
}

/** The opening `<form …>` tag text: up to the first `>` that is not inside a `{…}` expression. */
function formTags(text: string): string[] {
  const tags: string[] = [];
  for (let at = text.indexOf("<form"); at !== -1; at = text.indexOf("<form", at + 1)) {
    if (/\w/.test(text[at + 5] ?? "")) continue;
    let depth = 0;
    let end = at;
    for (; end < text.length; end++) {
      const c = text[end];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    tags.push(text.slice(at, end + 1));
  }
  return tags;
}

const files = sources(SRC)
  .map((file) => ({ file: path.relative(SRC, file), text: fs.readFileSync(file, "utf8") }))
  .filter(({ text }) => text.includes("<form") && TEXT_FIELD.test(text));

describe("form-level IME Enter guard (#2243)", () => {
  it("finds the screens it guards", () => {
    expect(files.length).toBeGreaterThanOrEqual(17);
  });
  it.each(files.map(({ file, text }) => [file, text] as const))("%s: every form carries the three guard handlers", (_file, text) => {
    for (const tag of formTags(text)) {
      expect(tag).toMatch(/onKeyDown=\{ime\.onKeyDown\}/);
      expect(tag).toMatch(/onCompositionStart=\{ime\.onCompositionStart\}/);
      expect(tag).toMatch(/onCompositionEnd=\{ime\.onCompositionEnd\}/);
    }
  });
});
