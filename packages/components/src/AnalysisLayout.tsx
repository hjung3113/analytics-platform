import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useI18n, usePlatform } from '@ap/kernel';
import { Button } from '@ap/ui';
import { AnalysisCollapseButton, AnalysisSectionContext } from './AnalysisSectionContext';

export type AnalysisSection = { id: string; title: string; node: ReactNode };
export type AnalysisLayoutProps = {
  /** KPI summary strip, collapsed as one section. */
  kpi?: AnalysisSection;
  /** Each chart is independently collapsible. */
  charts: AnalysisSection[];
  /** Full-width breakdown, collapsed as one section. */
  breakdown?: AnalysisSection;
};

function readCollapsed(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
}

export function AnalysisLayout(props: AnalysisLayoutProps) {
  const { route } = usePlatform();
  // Remount preference state when the route changes without remounting the consumer.
  const key = `platform:analysis-collapsed:${route?.menu.id ?? ''}`;
  return <AnalysisLayoutBody key={key} {...props} storageKey={key} />;
}

function AnalysisLayoutBody({ kpi, charts, breakdown, storageKey }: AnalysisLayoutProps & { storageKey: string }) {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const sections = [kpi, ...charts, breakdown].filter((section): section is AnalysisSection => section !== undefined);
  const [collapsed, setCollapsed] = useState(() => readCollapsed(storageKey));
  const [wide, setWide] = useState(false);
  const pendingFocus = useRef<{ id: string; collapsed: boolean } | null>(null);
  const sectionElements = useRef(new Map<string, HTMLDivElement>());
  const chips = useRef(new Map<string, HTMLButtonElement>());
  const hidden = sections.filter(section => collapsed.includes(section.id));
  const visibleCharts = charts.filter(section => !collapsed.includes(section.id));
  const twoColumns = wide && visibleCharts.length >= 2;

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => setWide(element.getBoundingClientRect().width >= 960);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    const button = target.collapsed ? chips.current.get(target.id)
      : sectionElements.current.get(target.id)?.querySelector<HTMLButtonElement>('[data-analysis-collapse]');
    button?.focus();
    pendingFocus.current = null;
  });

  function toggle(id: string, nextCollapsed: boolean) {
    const next = sections.filter(section => section.id === id ? nextCollapsed : collapsed.includes(section.id)).map(section => section.id);
    pendingFocus.current = { id, collapsed: nextCollapsed };
    setCollapsed(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* preference stays in memory */ }
  }

  function renderSection(section: AnalysisSection, kind: 'kpi' | 'chart' | 'breakdown', index = 0) {
    if (collapsed.includes(section.id)) return null;
    const span = kind === 'chart' && twoColumns && visibleCharts.length % 2 === 1 && index === visibleCharts.length - 1;
    return <AnalysisSectionContext.Provider key={section.id} value={{ title: section.title, kind, collapse: () => toggle(section.id, true) }}>
      <div ref={element => { if (element) sectionElements.current.set(section.id, element); else sectionElements.current.delete(section.id); }}
        data-analysis-section={section.id} data-analysis-kind={kind}
        className={kind === 'chart' ? `relative min-w-0${span ? ' col-span-2' : ''}` : 'relative min-w-0 space-y-2'}>
        {kind === 'kpi' && <div className="flex items-center justify-between gap-2 text-[12px] text-text-secondary">
          <h2 className="font-medium">{section.title}</h2><AnalysisCollapseButton />
        </div>}
        {kind !== 'kpi' && <AnalysisCollapseButton className="absolute right-3 top-3 z-[1]" />}
        {section.node}
      </div>
    </AnalysisSectionContext.Provider>;
  }

  return <div ref={root} className="@container/analysis min-w-0 space-y-4">
    {hidden.length > 0 && <div role="group" aria-label={t('collapsedSections')} className="flex flex-wrap items-center gap-2 text-[12px] text-text-secondary">
      <span>{t('collapsedSections')}</span>
      {hidden.map(section => <Button key={section.id} ref={element => { if (element) chips.current.set(section.id, element); else chips.current.delete(section.id); }}
        type="button" variant="secondary" size="sm" className="h-7 gap-1 rounded-full px-2 text-[12px]"
        aria-expanded="false" aria-label={t('expandSection', { title: section.title })} title={t('expandSection', { title: section.title })} onClick={() => toggle(section.id, false)}>
        {section.title}<ChevronDown className="size-3.5" aria-hidden />
      </Button>)}
    </div>}
    {kpi && renderSection(kpi, 'kpi')}
    {visibleCharts.length > 0 && <div data-analysis-chart-grid data-two-columns={twoColumns}
      className={`grid min-w-0 items-stretch gap-4 ${twoColumns ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {visibleCharts.map((section, index) => renderSection(section, 'chart', index))}
    </div>}
    {breakdown && renderSection(breakdown, 'breakdown')}
  </div>;
}
