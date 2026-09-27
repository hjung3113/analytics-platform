import { describe, expect, it } from 'vitest';
import { diffSelectors } from './compare.ts';
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
      '@container (min-width: 40rem) { .cq { color: red } }',
    ].join('\n');
    expect(extractSelectors(css)).toEqual(['.cq', '.grid', '.md\\:flex', '.px-2']);
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

  // 리뷰 P1-a: minified Tailwind v4 산출물 — selector 안의 따옴표를 문법으로 취급하면
  // 해당 규칙과 그 뒤 규칙이 사라진다.
  it('parses minified rules whose selector contains quotes', () => {
    const css = [
      ':root{--tw-x:1}',
      ".content-\\[\\'hello\\'\\]:before{content:'hello'}",
      '.after{color:red}',
    ].join('');
    expect(extractSelectors(css)).toEqual(['.after', ".content-\\[\\'hello\\'\\]:before", ':root']);
  });

  it('does not split at escaped commas or quotes in minified arbitrary values', () => {
    expect(extractSelectors('.a\\,b { color: red }')).toEqual(['.a\\,b']);
    expect(extractSelectors(".content-\\[\\'a\\,b\\'\\]:after{content:'a,b'}")).toEqual([
      ".content-\\[\\'a\\,b\\'\\]:after",
    ]);
  });

  it('keeps :is() lists and escaped width selectors intact', () => {
    const css = '.w-\\[22rem\\]{width:22rem}:is(.x,.y){color:red}';
    expect(extractSelectors(css)).toEqual(['.w-\\[22rem\\]', ':is(.x,.y)']);
  });

  // 리뷰 P2-b: 따옴표 안 공백은 문자열 값이다 — 문법 공백만 정규화한다.
  it('treats different whitespace inside quoted attribute values as different selectors', () => {
    const base = extractSelectors('[data-x="a  b"] { color: red }');
    const head = extractSelectors('[data-x="a b"] { color: red }');
    expect(diffSelectors(base, head).removed).toEqual(['[data-x="a  b"]']);
  });
});
