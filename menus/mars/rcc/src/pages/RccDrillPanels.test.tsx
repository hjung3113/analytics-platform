import { heatmapMinCanvasHeight, rowPitchChartHeight, type AnalysisChartFrameProps, type AnalysisChartProps, type PanelWorkspaceProps, type PlatformDataTableProps } from '@ap/components';
import { I18nProvider } from '@ap/kernel';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { comparisonUnits } from '../prototype/comparisonUnits';
import { DAYS, EQUIPMENT, STRUCTURES, type Run } from '../prototype/timeCompareFixture';
import { RccDrillPanels } from './RccDrillPanels';

vi.mock('@ap/kernel', async importOriginal => ({
  ...await importOriginal<typeof import('@ap/kernel')>(),
  usePlatform: () => ({ setPage: vi.fn() }),
}));

// Exercise the menu render path in Node, with layout and browser chart drawing left to the SDK.
vi.mock('@ap/components', async importOriginal => ({
  ...await importOriginal<typeof import('@ap/components')>(),
  AnalysisChart: ({ spec }: AnalysisChartProps) => <div>{spec.kind === 'heatmap' && spec.scale?.type === 'diverging' && spec.scale.pivotLabel}</div>,
  AnalysisChartFrame: ({ chartId, emptyCategoryLabel, series, startAlign, valueLabels }: AnalysisChartFrameProps) =>
    <div data-chart={chartId} data-empty-label={emptyCategoryLabel} data-series={series.map(item => item.id).join(',')}
      data-start-align={String(!!startAlign)} data-value-labels={valueLabels} />,
  PageFilterBar: () => null,
  PanelWorkspace: ({ panels }: PanelWorkspaceProps) => <>{panels.map(({ id, render, preferredHeight, minHeight }) => <div key={id} data-panel={id} data-preferred={preferredHeight} data-min={minHeight}>{render()}</div>)}</>,
  PlatformDataTable: ({ columns, rows, height }: PlatformDataTableProps<Run>) => rows && rows[0] && <div data-height={height}>
    {columns.map(column => <div key={column.id} data-column={column.id}>{column.cell?.(rows[0]!)}</div>)}
  </div>,
}));

const units = comparisonUnits('combined', {});
const unit = units[0]!;
const step = STRUCTURES.A.find(item => item.id === '20:3')!;

function renderDrill(current: typeof step | undefined, drillUnit = unit, atLayer = false) {
  return renderToStaticMarkup(<I18nProvider>
    <RccDrillPanels units={units} unit={drillUnit} usage={atLayer ? undefined : drillUnit.usages[0]} step={current} targets={EQUIPMENT}
      days={DAYS.slice(-1)} structure="A" counts={{ A: 9, B: 3 }} baseline={null} equipment="EQ-001"
      depth={current ? 3 : 2} resetDrill={{ unit: null, layer: null, step: null, equipment: null }} targetCount={EQUIPMENT.length} />
  </I18nProvider>);
}

describe('RCC drill presentation', () => {
  it('labels zero on the heatmap as the baseline', () => {
    expect(renderDrill(undefined)).toContain('기준과 같음');
  });

  it('marks only the current Step in the Lot/Wafer list', () => {
    const html = renderDrill(step);
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(/role="treeitem" data-id="20:3"[^>]*aria-current="true"/);
    expect(renderDrill(undefined)).not.toContain('aria-current="true"');
  });

  it('declares single-line cells for every wafer run column', () => {
    const html = renderDrill(step);
    for (const column of ['equipment', 'lot', 'wafer', 'startedAt', 'seconds', 'id']) {
      expect(html).toMatch(new RegExp(`data-column="${column}"><span[^>]*class="truncate"[^>]*>[^<]+</span>`));
    }
  });

  it('gives a full page of run rows room to flow with the page', () => {
    expect(renderDrill(step)).toContain('data-height="640"');
  });

  it('labels held equipment rows in the Layer and Step bars without a legend-only series', () => {
    const html = renderDrill(undefined);
    expect(html).toMatch(/data-chart="rcc-layers" data-empty-label="비교 보류" data-series="(?![^"]*held-layer)[^"]*"/);
    expect(html).toMatch(/data-chart="rcc-steps" data-empty-label="비교 보류"/);
  });

  it('start-aligns Layer lanes only with two or more layers; one layer shows its row totals', () => {
    const single = units.find(item => item.usages.length === 1)!;
    const multi = comparisonUnits('ppid', {}).find(item => item.usages.length > 1)!;
    expect(renderDrill(undefined, single, true)).toMatch(/data-chart="rcc-layers"[^>]*data-start-align="false" data-value-labels="total"/);
    expect(renderDrill(undefined, multi, true)).toMatch(/data-chart="rcc-layers"[^>]*data-start-align="true" data-value-labels="segment"/);
  });

  it('sizes the equipment bar panels so every row and the value axis fit', () => {
    const html = renderDrill(undefined, unit, true);
    const fit = String(80 + rowPitchChartHeight(EQUIPMENT.length, 24));
    expect(html).toContain(`data-panel="layers" data-preferred="${Math.max(400, Number(fit))}"`);
    expect(html).toContain(`data-panel="totals" data-preferred="${Math.max(400, Number(fit))}"`);
  });

  it('keeps the Step × equipment heatmap tall enough for every Step row and its x-axis, also over a stored row height (#2755)', () => {
    const html = renderDrill(undefined);
    // Panel chrome (header, toolbar, legend, selection line) + the SDK heatmap's least canvas for 18 rows at 17px.
    const least = 96 + heatmapMinCanvasHeight(STRUCTURES.A.length, 17);
    expect(least).toBeGreaterThan(440);
    expect(html).toContain(`data-panel="matrix" data-preferred="${least}" data-min="${least}"`);
    // The Step bars draw one row per equipment and keep their own height; the shared row still takes the tallest panel.
    expect(html).toContain('data-panel="steps" data-preferred="440">');
  });
});
