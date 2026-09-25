import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from '@tailwindcss/node';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { AnalysisWorkspaceArchetype, CatalogArchetype, ManagementArchetype, OverviewArchetype, WorkflowArchetype } from './PageArchetypes';
afterEach(cleanup);
type AnyArchetype = ((props: Record<string, unknown>) => React.ReactNode) & { regionNames: readonly string[] };
// §12 regions verbatim, minus Page Header / Global Context / Data Trust which the Shell owns (§8/§11).
const spec: [string, AnyArchetype, [name: string, label: string, role: 'region' | 'search'][]][] = [
  ['overview', OverviewArchetype as unknown as AnyArchetype, [['primarySummary', 'Primary KPI / Summary', 'region'], ['mainTrend', 'Main trend or status', 'region'], ['attentionList', 'Attention list', 'region']]],
  ['analysis', AnalysisWorkspaceArchetype as unknown as AnyArchetype, [['kpiSummary', 'KPI summary', 'region'], ['primaryChart', 'Primary chart', 'region'], ['selectionAnnotation', 'Selection / Annotation', 'region'], ['breakdownTable', 'Breakdown table', 'region']]],
  ['management', ManagementArchetype as unknown as AnyArchetype, [['searchFilter', 'Search and filter', 'search'], ['dataTable', 'Data table', 'region'], ['selectionActions', 'Selection actions', 'region'], ['detailDrawer', 'Detail drawer', 'region'], ['historyAudit', 'History / Audit', 'region']]],
  ['catalog', CatalogArchetype as unknown as AnyArchetype, [['catalogList', 'Catalog list', 'region'], ['definitionDetail', 'Definition detail', 'region'], ['version', 'Version', 'region'], ['ownership', 'Ownership', 'region'], ['coverage', 'Coverage', 'region'], ['usageDependency', 'Usage / Dependency', 'region'], ['history', 'History', 'region']]],
  ['workflow', WorkflowArchetype as unknown as AnyArchetype, [['queueList', 'Queue / List', 'region'], ['statusFilter', 'Status / Priority / Owner filter', 'search'], ['detail', 'Detail', 'region'], ['timeline', 'Timeline', 'region'], ['comments', 'Comments', 'region'], ['relatedContext', 'Related context', 'region']]],
];
describe.each(spec)('%s archetype (§12)', (archetype, Archetype, regions) => {
  const filled = () => Object.fromEntries(regions.map(([name]) => [name, <span>{`${name} content`}</span>]));
  it('declares exactly the §12 regions in §12 order', () => {
    expect(Archetype.regionNames).toEqual(regions.map(([name]) => name));
  });
  it('renders each region as a labelled landmark, in §12 order, holding its own slot content', () => {
    render(<Archetype {...filled()} />);
    const root = document.querySelector(`[data-archetype=${archetype}]`) as HTMLElement;
    const rendered = [...root.children] as HTMLElement[];
    expect(rendered.map(node => node.dataset.region)).toEqual(regions.map(([name]) => name));
    regions.forEach(([name, label, role], i) => {
      expect(within(root).getByRole(role, { name: label })).toBe(rendered[i]);
      expect(rendered[i].textContent).toBe(`${name} content`);
    });
  });
  it('never renders Shell slots (Page Header / Global Context / Data Trust)', () => {
    render(<Archetype {...filled()} />);
    expect(document.querySelector('h1, header, footer, aside, main, [data-slot]')).toBeNull();
    for (const name of [/page header/i, /global context/i, /data trust/i]) expect(screen.queryByRole('region', { name })).toBeNull();
  });
  it('rejects missing, extra, and children props at runtime', () => {
    const slots = filled();
    const [first, ...rest] = regions.map(([name]) => name);
    expect(() => Archetype(Object.fromEntries(rest.map(name => [name, null])))).toThrow(`requires exactly ${regions.length} named regions`);
    expect(() => Archetype({ ...slots, children: 'bad' })).toThrow('named regions');
    expect(() => Archetype({ ...slots, dataTrustSummary: 'bad' })).toThrow('named regions');
    expect(() => Archetype({ ...Object.fromEntries(rest.map(name => [name, null])), [`${first}X`]: null })).toThrow('named regions');
  });
  it('keeps unfilled regions as empty landmarks', () => {
    render(<Archetype {...Object.fromEntries(regions.map(([name]) => [name, null]))} />);
    expect(document.querySelector(`[data-archetype=${archetype}]`)?.textContent).toBe('');
    for (const [, label, role] of regions) expect(screen.getByRole(role, { name: label }).childElementCount).toBe(0);
  });
});
describe('archetype responsive grid (§25)', () => {
  const source = readFileSync('src/PageArchetypes.tsx', 'utf8');
  // Every class list in the module is a single-quoted literal (layouts, region classNames, shared constants).
  const candidates = [...new Set([...source.matchAll(/'([^'\n]*)'/g)].flatMap(match => match[1].split(/\s+/)).filter(Boolean))];
  it('uses only the §25 breakpoints: base <1024px, lg 1024–1439px, wide ≥1440px', async () => {
    const variants = new Set(candidates.flatMap(candidate => candidate.match(/^(?:[\w-]+:)+/)?.[0].split(':').filter(Boolean) ?? []));
    expect([...variants].filter(v => !['lg', 'wide', 'max-wide', 'empty', 'before'].includes(v))).toEqual([]);
    const css = await compile(readFileSync('src/style.css', 'utf8'), { base: resolve('src'), onDependency: () => {} }).then(compiler => compiler.build(candidates));
    const media = new Set(css.match(/@media \([^)]*\)/g));
    expect([...media].sort()).toEqual(['@media (width < 90rem)', '@media (width >= 64rem)', '@media (width >= 90rem)']);
    // The docked secondary panel turns into a fixed right drawer only inside 1024–1439px, and is hidden there while empty.
    const lg = css.slice(css.indexOf('@media (width >= 64rem)'), css.indexOf('@media (width >= 90rem)'));
    const laptopOnly = lg.slice(lg.indexOf('@media (width < 90rem)'));
    expect(laptopOnly).not.toBe(''); expect(css.split('.lg\\:max-wide\\:fixed')).toHaveLength(2);
    expect(laptopOnly).toMatch(/\.lg\\:max-wide\\:fixed \{\s+position: fixed;/);
    expect(laptopOnly).toMatch(/\.lg\\:max-wide\\:empty\\:hidden:empty \{\s+display: none;/);
    expect(css).toContain('.empty\\:before\\:content-\\[attr\\(aria-label\\)\\]:empty::before');
  });
  it('lets explicit placements win over span shorthands at the same breakpoint', async () => {
    const css = await compile(readFileSync('src/style.css', 'utf8'), { base: resolve('src'), onDependency: () => {} }).then(compiler => compiler.build(candidates));
    // grid-column/row shorthands (span) must precede *-start longhands, or the start would be reset to auto.
    expect(css.indexOf('.wide\\:col-span-1')).toBeLessThan(css.indexOf('.wide\\:col-start-3'));
    expect(css.indexOf('.wide\\:row-span-3')).toBeLessThan(css.indexOf('.wide\\:row-start-1'));
    expect(css.indexOf('.lg\\:row-span-2')).toBeLessThan(css.indexOf('.lg\\:row-start-2'));
  });
});
