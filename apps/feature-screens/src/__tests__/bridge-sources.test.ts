import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `bridge-sources.css` is the public style entry of @ap/feature-screens. Tailwind reads class names only from
 * its `@source` folders, so a source folder missing there loses its classes from the built CSS without an error (#1677).
 * Every folder directly under `src/` (except test-only ones) and every folder under `src/features` must be covered
 * by an `@source` that is that folder or one of its ancestors.
 */
const PKG = path.resolve(__dirname, "../..");
const SRC = path.join(PKG, "src");
const NON_STYLE_DIRS = new Set(["__tests__", "test"]);

const sources = [
  ...fs
    .readFileSync(path.join(PKG, "bridge-sources.css"), "utf8")
    // A commented-out directive is not read by Tailwind, so it must not count as coverage.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .matchAll(/@source\s+"([^"]+)"/g),
].map((m) => path.resolve(PKG, m[1] ?? ""));

const covered = (dir: string) =>
  sources.some((s) => dir === s || dir.startsWith(s + path.sep));

const subdirs = (dir: string) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !NON_STYLE_DIRS.has(e.name))
    .map((e) => path.join(dir, e.name));

describe("bridge-sources.css", () => {
  it("lists at least one source", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it.each([...subdirs(SRC), ...subdirs(path.join(SRC, "features"))])(
    "covers %s",
    (dir) => {
      expect(
        covered(dir),
        `${path.relative(PKG, dir)} is not under any @source in bridge-sources.css`,
      ).toBe(true);
    },
  );
});
