import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatWallClock, type ApiResponse, type Trust } from '@ap/contracts';
import { formatSummaryTime, useMenuQuery } from '@ap/kernel';
import { operationTimeEndpoint } from '../endpoints';
import type { OperationRankRow, OperationTimeData } from '../endpoints';
import OperationTimeScreen, { PreviousEquipmentLine, acceptedEquipment } from './OperationTime';

let emptyResult = false;
let pageExtension: { historyPageSummary?: (global: unknown, page: [string, string][]) => { label: string; value: string }[] } | undefined;
let acceptedResponse: ApiResponse<OperationTimeData> | null = null;
const UPDATED_AT = '2026-11-08T09:00:00+09:00';
const QUERY_TO = '2026-09-26T09:00:00';

// This package has no DOM test environment, and the lifecycle itself (the kept result, the refreshing label, Context and period hiding) is the Kernel's,
// tested in packages/sdk/kernel/src/query/__tests__/menu-query.test.tsx. This pins that the screen asks for it: the screen has no other state to test.
vi.mock('@ap/kernel', async importOriginal => ({
  ...(await importOriginal<typeof import('@ap/kernel')>()),
  useMenuQuery: vi.fn(() => ({ status: acceptedResponse ? 'success' : 'loading', response: acceptedResponse })),
  useI18n: () => ({ lang: 'ko', tx: (text: { ko: string }) => text.ko }),
  usePlatform: () => ({ pageParam: (key: string) => (key === 'eqp' ? 'EQ-07' : null), global: { from: null, to: QUERY_TO }, setPage: vi.fn() }),
}));
vi.mock('@ap/components', () => ({
  PlatformPage: ({ children, queryBarExtension }: { children?: unknown; queryBarExtension?: typeof pageExtension }) => { pageExtension = queryBarExtension; return <>{children as never}</>; },
  QueryView: ({ children }: { children: (data: unknown) => unknown }) => acceptedResponse?.data ? children(acceptedResponse.data) as never : emptyResult ? children({ ranking: [], lanes: [], equipmentId: null, missingEquipment: null }) as never : null,
  DataTrustIndicator: () => null,
  AnalysisLayout: ({ kpi, charts, breakdown }: { kpi: { node: unknown }; charts: { node: unknown }[]; breakdown: { node: unknown } }) => <>{kpi.node as never}{charts.map((chart, index) => <section key={index}>{chart.node as never}</section>)}{breakdown.node as never}</>,
  AnalysisChart: ({ trust }: { trust: { source: string; updated: string; coverage: string } }) => <footer>{trust.source} · {trust.updated} · {trust.coverage}</footer>,
  LaneTimeline: () => null,
  StatCard: ({ label, value, unit, caption }: { label: unknown; value: unknown; unit?: unknown; caption?: unknown }) => <article><span>{label as never}</span><strong>{value as never}</strong><span>{unit as never}</span><p>{caption as never}</p></article>,
}));

function responseFor(ranking: OperationRankRow[], updatedAt: string | null = UPDATED_AT): ApiResponse<OperationTimeData> {
  const data: OperationTimeData = { ranking, equipmentId: ranking[0]?.equipmentId ?? null, missingEquipment: null, lanes: [] };
  const trust: Trust | null = updatedAt === null ? null : { updatedAt, dataThrough: null, coverage: 0.987, provisional: false, source: 'Synthetic' };
  return { outcome: 'ok', data, assessments: [{ kind: 'collection', state: 'confirmed' }, { kind: 'coverage', state: 'confirmed' }], trust, correlationId: 'clas-summary' };
}

beforeEach(() => { vi.mocked(useMenuQuery).mockClear(); emptyResult = false; acceptedResponse = null; });

describe('CLAS operation time keeps the previous equipment while another loads (#1365)', () => {
  it('reads the chosen equipment with keepPrevious on', () => {
    renderToStaticMarkup(<OperationTimeScreen />);
    expect(useMenuQuery).toHaveBeenCalledWith(operationTimeEndpoint, { eqp: 'EQ-07' }, { keepPrevious: true });
  });

  it('shows a local previous-equipment line only while a previous result shows, without a live-region role', () => {
    const shown = renderToStaticMarkup(<PreviousEquipmentLine equipment="EQ-03" />);
    expect(shown).toContain('이전 설비(EQ-03)의 결과 · 갱신 중');
    expect(shown).not.toContain('role=');
    expect(renderToStaticMarkup(<PreviousEquipmentLine equipment={null} />)).toBe('');
  });

  it('names the equipment the data shows: the response id wins over the accepted request (no `eqp` picks the default equipment)', () => {
    expect(acceptedEquipment('', 'MEM-CVD-0156')).toBe('MEM-CVD-0156');
    expect(acceptedEquipment(undefined, 'MEM-CVD-0156')).toBe('MEM-CVD-0156');
    expect(acceptedEquipment('OUT-OF-SCOPE', null)).toBe('OUT-OF-SCOPE');
    expect(acceptedEquipment('EQ-03', null)).toBe('EQ-03');
    expect(acceptedEquipment('', undefined)).toBe('');
  });
});

it('renders an ok response with an empty ranking without throwing (#2056)', () => {
  emptyResult = true;
  try { expect(() => renderToStaticMarkup(<OperationTimeScreen />)).not.toThrow(); }
  finally { emptyResult = false; }
});

describe('CLAS operation time summary and chart trust (#2532)', () => {
  it('names both tied leaders and shows both total and mean in minutes', () => {
    acceptedResponse = responseFor([
      { equipmentId: 'EQ-01', room: 'PHOTO', minutes: 1296 },
      { equipmentId: 'EQ-02', room: 'ETCH', minutes: 1296 },
      { equipmentId: 'EQ-03', room: 'CVD', minutes: 600 },
    ]);
    const html = renderToStaticMarkup(<OperationTimeScreen />);
    expect(html).toContain('공동 1위 2대 · EQ-01, EQ-02');
    expect(html).toContain('<span>총 동작시간</span><strong>3,192</strong><span>분</span>');
    expect(html).toContain('<span>설비당 평균</span><strong>1,064</strong><span>분</span>');
  });

  it('keeps the longest caption for one leader and formats the response update instant in the chart footer', () => {
    acceptedResponse = responseFor([
      { equipmentId: 'EQ-01', room: 'PHOTO', minutes: 1000 },
      { equipmentId: 'EQ-02', room: 'ETCH', minutes: 800 },
    ]);
    const html = renderToStaticMarkup(<OperationTimeScreen />);
    const footer = /<footer>(.*?)<\/footer>/.exec(html)?.[1] ?? '';
    expect(html).toContain('최장 EQ-01');
    expect(footer).toContain(formatSummaryTime(UPDATED_AT, 'ko'));
    expect(footer).not.toContain(formatWallClock(QUERY_TO));
  });

  it('uses an em dash in the chart footer when response trust is null', () => {
    acceptedResponse = responseFor([{ equipmentId: 'EQ-01', room: 'PHOTO', minutes: 1000 }], null);
    const html = renderToStaticMarkup(<OperationTimeScreen />);
    const footer = /<footer>(.*?)<\/footer>/.exec(html)?.[1] ?? '';
    expect(footer).toContain('—');
  });
});

describe('CLAS operation time query history (#2691)', () => {
  it('gives each history row its own equipment', () => {
    renderToStaticMarkup(<OperationTimeScreen />);
    const text = (page: [string, string][]) => pageExtension?.historyPageSummary?.(null, page).map(item => `${item.label} ${item.value}`).join(' · ');
    expect(text([['eqp', 'EQ-03']])).toBe('설비 EQ-03');
    expect(text([])).toBe('');
    expect(text([['returnTo', '/x']])).toBe('');
  });
});
