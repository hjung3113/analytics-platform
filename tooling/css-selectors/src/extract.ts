// Extracts the set of selectors from a built CSS file (#58).
//
// Contract (docs/ROADMAP.md 틈틈이 list, decision #39/05):
// - selector lists split on top-level commas only (commas inside :is(), [] or
//   quoted strings do not split; escaped commas like `.a\,b` do not split);
// - rules nested in block at-rules (@media, @supports, @layer, @container, …)
//   are kept, without the at-rule prelude — only the selector text is reported;
// - the bodies of @keyframes (from/to/N% steps), @font-face and @property
//   are not style rules and are ignored entirely;
// - whitespace runs outside strings/escapes collapse to a single space; quoted
//   strings (e.g. `[data-x="a  b"]`) and escape sequences are kept verbatim.
// The result is sorted and unique.
//
// Rule walking is delegated to postcss (#58 리뷰): the previous hand-rolled
// scanner treated quotes/braces/commas inside selectors as syntax, so minified
// Tailwind rules like `.content-\[\'hello\'\]{content:'hello'}` (and everything
// after them) vanished. postcss keeps the selector text verbatim; only list
// splitting and whitespace normalization stay local.

import postcss from 'postcss';
import type { AtRule, Rule } from 'postcss';

/** At-rule bodies that contain no style rules. `…keyframes` also matches vendor-prefixed variants. */
function isOpaqueAtRule(name: string): boolean {
  return name === 'font-face' || name === 'property' || name === 'counter-style' || name.endsWith('keyframes');
}

/** True when a rule sits inside @keyframes/@font-face/@property — its "selectors" are steps, not selectors. */
function insideOpaqueAtRule(rule: Rule): boolean {
  for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
    if (parent.type === 'atrule' && isOpaqueAtRule((parent as AtRule).name)) return true;
  }
  return false;
}

/** Splits a selector list on commas that sit outside (), [], {}, quotes and escapes. */
function splitSelectorList(list: string): string[] {
  const parts: string[] = [];
  let buf = '';
  let quote: string | null = null;
  let depth = 0;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (quote) {
      buf += ch;
      if (ch === '\\') {
        buf += list[i + 1] ?? '';
        i++;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    // An escape pair is literal text (`.a\,b` is one identifier, not a list separator).
    if (ch === '\\') {
      buf += ch + (list[i + 1] ?? '');
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  parts.push(buf);
  return parts;
}

/**
 * Collapses whitespace runs outside quotes/escapes to single spaces and trims.
 * Quoted attribute values (`[data-x="a  b"]`) and escape pairs (`\.a\ `) are kept verbatim (#58 P2-b).
 */
function normalizeSelector(selector: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (quote) {
      out += ch;
      if (ch === '\\') {
        out += selector[i + 1] ?? '';
        i++;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '\\') {
      out += ch + (selector[i + 1] ?? '');
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      continue;
    }
    if (/\s/.test(ch)) {
      out += ' ';
      while (i + 1 < selector.length && /\s/.test(selector[i + 1])) i++;
      continue;
    }
    out += ch;
  }
  return out.trim();
}

/** Sorted unique selectors of a built CSS file. */
export function extractSelectors(css: string): string[] {
  const found = new Set<string>();
  postcss.parse(css, { from: undefined }).walkRules((rule) => {
    if (insideOpaqueAtRule(rule)) return;
    for (const part of splitSelectorList(rule.selector)) {
      const selector = normalizeSelector(part);
      if (selector) found.add(selector);
    }
  });
  return [...found].sort();
}
