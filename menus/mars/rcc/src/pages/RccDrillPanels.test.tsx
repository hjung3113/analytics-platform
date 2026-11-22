import type { AnalysisChartFrameProps, AnalysisChartProps, PanelWorkspaceProps, PlatformDataTableProps } from '@ap/components';
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
  AnalysisChartFrame: ({ chartId, emptyCategoryLabel, series }: AnalysisChartFrameProps) =>
    <div data-chart={chartId} data-empty-label={emptyCategoryLabel} data-series={series.map(item => item.id).join(',')} />,
  PageFilterBar: () => null,
  PanelWorkspace: ({ panels }: PanelWorkspaceProps) => <>{panels.map(({ id, render }) => <div key={id}>{render()}</div>)}</>,
  PlatformDataTable: ({ columns, rows, height }: PlatformDataTableProps<Run>) => rows && rows[0] && <div data-height={height}>
    {columns.map(column => <div key={column.id} data-column={column.id}>{column.cell?.(rows[0]!)}</div>)}
  </div>,
}));

const units = comparisonUnits('combined', {});
const unit = units[0]!;
const step = STRUCTURES.A.find(item => item.id === '20:3')!;

function renderDrill(current: typeof step | undefined) {
  return renderToStaticMarkup(<I18nProvider>
    <RccDrillPanels units={units} unit={unit} usage={unit.usages[0]} step={current} targets={EQUIPMENT}
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
});
