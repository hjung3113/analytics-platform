import { describe, expect, it } from 'vitest';
import { extractSelectors } from './extract.ts';

describe('extractSelectors', () => {
  it('splits selector lists on top-level commas and normalizes whitespace', () => {
    expect(extractSelectors('a,\n  b { color: red }')).toEqual(['a', 'b']);
    expect(extractSelectors('h1   >\t p { margin: 0 }')).toEqual(['h1 > p']);
  });

  it('does not split commas inside :is(), attribute values or quoted strings', () => {
    expect(extractSelectors(':is(a, b) { color: red }')).toEqual([':is(a, b)']);
    expect(extractSelectors('[data-x="a,b"] { color: red }')).toEqual(['[data-x="a,b"]']);
    expect(extractSelectors('a[data-x="}"] { content: "}" }')).toEqual(['a[data-x="}"]']);
  });

  it('keeps selectors inside @media/@supports/@layer without the at-rule prefix', () => {
    const css = [
      '@media (min-width: 48rem) { .md\\:flex { display: flex } }',
      '@supports (display: grid) { @layer components { .grid { display: grid } } }',
      '@layer utilities { .px-2 { padding-inline: 0.5rem } }',
    ].join('\n');
    expect(extractSelectors(css)).toEqual(['.grid', '.md\\:flex', '.px-2']);
  });

  it('ignores @keyframes steps and @font-face/@property bodies', () => {
    const css = [
      '@keyframes spin { from { transform: none } 50% { opacity: 0.5 } to { transform: rotate(1turn) } }',
      '@-webkit-keyframes spin { from { transform: none } to { transform: rotate(1turn) } }',
      '@font-face { font-family: Inter; src: url(inter.woff2) }',
      '@property --x { syntax: "<length>"; inherits: false }',
      '.spin { animation: spin 1s }',
    ].join('\n');
    expect(extractSelectors(css)).toEqual(['.spin']);
  });

  it('ignores comments, including commas inside them', () => {
    const css = '/* header, with comma */\n.a /* , keep going */ { color: red } .b {}';
    expect(extractSelectors(css)).toEqual(['.a', '.b']);
  });

  it('ignores at-statements and handles an empty file', () => {
    expect(extractSelectors('@import url(base.css); @charset "utf-8"; @layer base, utils;\n.a {}')).toEqual(['.a']);
    expect(extractSelectors('')).toEqual([]);
  });

  it('deduplicates and sorts', () => {
    expect(extractSelectors('.b {} .a {} .b, .a {}')).toEqual(['.a', '.b']);
  });

  it('keeps escaped Tailwind selectors verbatim', () => {
    const css = '.md\\:flex { display: flex } .w-\\[22rem\\] { width: 22rem } .hover\\:bg-red-500:hover { --tw-bg-opacity: 1 }';
    expect(extractSelectors(css)).toEqual(['.hover\\:bg-red-500:hover', '.md\\:flex', '.w-\\[22rem\\]']);
  });
});
