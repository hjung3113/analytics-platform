import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SpawnSyncReturns } from 'node:child_process';

const CLI = fileURLToPath(new URL('./cli.ts', import.meta.url));

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'css-selectors-cli-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

function write(name: string, css: string): string {
  const path = join(dir, name);
  writeFileSync(path, css);
  return path;
}

describe('cli', () => {
  it('exits 0 with counts for identical selector sets', () => {
    const css = '.a { color: red } .b {}';
    const r = run([write('base1.css', css), write('head1.css', `${css}\n.b, .a {}`)]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('base selectors: 2');
    expect(r.stdout).toContain('added: 0');
    expect(r.stdout).toContain('removed: 0');
  });

  it('exits 1 and lists the selector when the head build removes one', () => {
    const base = write('base2.css', '.kept {} .dropped {}');
    const head = write('head2.css', '.kept {}');
    const r = run([base, head]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('removed: 1');
    expect(r.stdout).toContain('.dropped');
    expect(r.stderr).toContain('css-removal-ok');
  });

  it('exits 0 with --allow-removal', () => {
    const r = run([write('base3.css', '.dropped {} .kept {}'), write('head3.css', '.kept {}'), '--allow-removal']);
    expect(r.status).toBe(0);
  });

  it('writes a markdown summary with counts and selector code blocks', () => {
    const summary = join(dir, 'summary.md');
    const r = run([
      write('base4.css', '.dropped {} .kept {}'),
      write('head4.css', '.added {} .kept {}'),
      '--summary',
      summary,
    ]);
    expect(r.status).toBe(1);
    const md = readFileSync(summary, 'utf8');
    expect(md).toContain('| added | 1 |');
    expect(md).toContain('| removed | 1 |');
    expect(md).toContain('```css\n.added\n```');
    expect(md).toContain('```css\n.dropped\n```');
  });

  it('notes an empty diff in the summary', () => {
    const summary = join(dir, 'empty.md');
    const css = write('same.css', '.a {}');
    const r = run([css, css, '--summary', summary, '--allow-removal']);
    expect(r.status).toBe(0);
    expect(readFileSync(summary, 'utf8')).toContain('No added or removed selectors.');
  });

  it('truncates long lists in stdout and summary with an …N more line', () => {
    const selectors = Array.from({ length: 55 }, (_, i) => `.s${i} {}`).join(' ');
    const summary = join(dir, 'trunc.md');
    const r = run([
      write('base5.css', selectors),
      write('head5.css', '.kept {}'),
      '--summary',
      summary,
      '--allow-removal',
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('removed: 55');
    expect(r.stdout).toContain('…5 more');
    expect(readFileSync(summary, 'utf8')).toContain('…5 more');
  });

  it('exits 2 on IO and usage errors', () => {
    const head = write('head6.css', '.a {}');
    expect(run([join(dir, 'missing.css'), head]).status).toBe(2);
    expect(run([head]).status).toBe(2);
    expect(run([head, head, '--summary']).status).toBe(2);
  });

  // 리뷰 P2-a: 한쪽이라도 selector가 0개면 비교하지 않고 exit 2 (--allow-removal과 무관).
  it('exits 2 when either side extracts zero selectors, even with --allow-removal', () => {
    const kept = write('head7.css', '.a {}');
    const empty = write('empty7.css', '');
    const comments = write('comments7.css', '/* no rules here, only a comment */');
    expect(run(['/dev/null', kept]).status).toBe(2);
    expect(run([kept, empty]).status).toBe(2);
    expect(run([comments, comments, '--allow-removal']).status).toBe(2);
  });

  it('prints usage for --help and exits 0', () => {
    const r = run(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Usage:');
  });
});
