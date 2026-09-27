import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { diffSelectors } from './compare.ts';
import { extractSelectors } from './extract.ts';

const USAGE = `css-selectors — compare the selector sets of two built CSS files (#58)

Usage:
  node tooling/css-selectors/src/cli.ts <base.css> <head.css> [--summary <file>] [--allow-removal]

Prints selector counts and the added/removed selectors (up to 50 each).
--summary writes the same diff as a markdown report (for $GITHUB_STEP_SUMMARY).
Exit codes: 0 equal or --allow-removal, 1 removed selectors without --allow-removal,
2 usage, IO error, or an input with no extracted selectors.
CI (.github/workflows/css-selectors.yml) passes --allow-removal when the PR
has the css-removal-ok label.`;

const SUMMARY_LIMIT = 50;

type Args = {
  help: boolean;
  summary?: string;
  'allow-removal': boolean;
};

function parse(argv: string[]): { values: Args; positionals: string[] } {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h', default: false },
      summary: { type: 'string' },
      'allow-removal': { type: 'boolean', default: false },
    },
  }) as { values: Args; positionals: string[] };
}

/** `css` fenced block with at most 50 selectors, plus an "…N more" line when truncated. */
function selectorBlock(selectors: string[]): string {
  const shown = selectors.slice(0, SUMMARY_LIMIT);
  const more = selectors.length - shown.length;
  const lines = ['', '```css', ...shown, '```'];
  if (more > 0) lines.push('', `…${more} more`);
  return lines.join('\n');
}

function renderSummary(base: string[], head: string[], diff: { added: string[]; removed: string[] }): string {
  const lines = [
    '## CSS selector diff (base → head)',
    '',
    '| | count |',
    '| --- | ---: |',
    `| base selectors | ${base.length} |`,
    `| head selectors | ${head.length} |`,
    `| added | ${diff.added.length} |`,
    `| removed | ${diff.removed.length} |`,
  ];
  if (diff.added.length > 0) lines.push('', `### Added (${diff.added.length})`, selectorBlock(diff.added));
  if (diff.removed.length > 0) lines.push('', `### Removed (${diff.removed.length})`, selectorBlock(diff.removed));
  if (diff.added.length === 0 && diff.removed.length === 0) lines.push('', 'No added or removed selectors.');
  return `${lines.join('\n')}\n`;
}

function printList(label: string, selectors: string[]): void {
  console.log(`${label}: ${selectors.length}`);
  for (const s of selectors.slice(0, SUMMARY_LIMIT)) console.log(`  ${s}`);
  const more = selectors.length - Math.min(selectors.length, SUMMARY_LIMIT);
  if (more > 0) console.log(`  …${more} more`);
}

function run(argv: string[]): void {
  const { values, positionals } = parse(argv);
  if (values.help) {
    console.log(USAGE);
    return;
  }
  if (positionals.length !== 2) {
    console.error(`css-selectors: exactly two positionals <base.css> <head.css> are required\n\n${USAGE}`);
    process.exit(2);
  }

  const base = extractSelectors(readFileSync(positionals[0], 'utf8'));
  const head = extractSelectors(readFileSync(positionals[1], 'utf8'));
  // 한쪽이라도 비어 있으면 diff는 전량 제거/추가로 왜곡된다 — 비교 전에 차단(#58 리뷰 P2-a).
  if (base.length === 0 || head.length === 0) {
    const emptySide = base.length === 0 ? (head.length === 0 ? 'both inputs' : positionals[0]) : positionals[1];
    console.error(`css-selectors: no selectors extracted from ${emptySide}; refusing to compare an empty selector set`);
    process.exit(2);
  }
  const diff = diffSelectors(base, head);

  console.log(`base selectors: ${base.length}`);
  console.log(`head selectors: ${head.length}`);
  printList('added', diff.added);
  printList('removed', diff.removed);

  if (values.summary) {
    mkdirSync(dirname(values.summary), { recursive: true });
    writeFileSync(values.summary, renderSummary(base, head, diff));
    console.log(`summary written: ${values.summary}`);
  }

  if (diff.removed.length > 0 && !values['allow-removal']) {
    console.error(`css-selectors: ${diff.removed.length} selector(s) removed; add the css-removal-ok label or pass --allow-removal if intended`);
    process.exit(1);
  }
}

try {
  run(process.argv.slice(2));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`css-selectors: ${message}`);
  process.exit(2);
}
