// Extracts the set of selectors from a built CSS file (#58).
//
// Contract (docs/ROADMAP.md 틈틈이 list, decision #39/05):
// - selector lists split on top-level commas only (commas inside :is(), [] or
//   quoted strings do not split);
// - rules nested in block at-rules (@media, @supports, @layer, …) are kept,
//   without the at-rule prelude — only the selector text is reported;
// - the bodies of @keyframes (from/to/N% steps), @font-face and @property
//   are not style rules and are ignored entirely;
// - whitespace runs collapse to a single space.
// The result is sorted and unique.

/** At-rule bodies that contain no style rules. `…keyframes` also matches vendor-prefixed variants. */
function isOpaqueAtRule(name: string): boolean {
  return name === 'font-face' || name === 'property' || name === 'counter-style' || name.endsWith('keyframes');
}

function isQuote(ch: string): boolean {
  return ch === '"' || ch === "'";
}

/** Removes /* … *&#47; comments. `/*` inside a quoted string is kept (Tailwind content values). */
function stripComments(css: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (quote) {
      out += ch;
      if (ch === '\\') {
        out += css[i + 1] ?? '';
        i++;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (isQuote(ch)) {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      // A comment separates tokens: `a/*x*/,b` must split like `a,b`.
      out += ' ';
      i = end === -1 ? css.length : end + 1;
      continue;
    }
    out += ch;
  }
  return out;
}

/** Index of the `}` matching the `{` at `open`, or end of input when unbalanced. Skips quoted strings. */
function matchingBrace(css: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < css.length; i++) {
    const ch = css[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (isQuote(ch)) quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return css.length;
}

function atRuleName(prelude: string): string {
  // At-rule names are case-insensitive; `@-webkit-keyframes` → `webkit-keyframes`.
  return /^@([-a-z\d]+)/i.exec(prelude)?.[1]?.toLowerCase() ?? '';
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
    if (isQuote(ch)) {
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

function collect(body: string, found: Set<string>): void {
  let prelude = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    // Inside quoted strings braces/semicolons are literal (`content: "{"`).
    if (isQuote(ch)) {
      const end = matchingQuote(body, i);
      prelude += body.slice(i, end + 1);
      i = end;
      continue;
    }
    if (ch === '{') {
      const close = matchingBrace(body, i);
      const inner = body.slice(i + 1, close);
      // The prelude can start with whitespace left over from the previous rule.
      const header = prelude.trimStart();
      if (header.startsWith('@')) {
        if (!isOpaqueAtRule(atRuleName(header))) collect(inner, found);
      } else {
        addSelectors(prelude, found);
      }
      prelude = '';
      i = close;
      continue;
    }
    if (ch === ';' || ch === '}') {
      // At-statements (`@import …;`) and stray closes carry no selectors.
      prelude = '';
      continue;
    }
    prelude += ch;
  }
}

function matchingQuote(body: string, open: number): number {
  for (let i = open + 1; i < body.length; i++) {
    if (body[i] === '\\') i++;
    else if (body[i] === body[open]) return i;
  }
  return body.length;
}

function addSelectors(prelude: string, found: Set<string>): void {
  for (const raw of splitSelectorList(prelude)) {
    const selector = raw.replace(/\s+/g, ' ').trim();
    if (selector) found.add(selector);
  }
}

/** Sorted unique selectors of a built CSS file. Runs with plain `node` (no dependencies). */
export function extractSelectors(css: string): string[] {
  const found = new Set<string>();
  collect(stripComments(css), found);
  return [...found].sort();
}
