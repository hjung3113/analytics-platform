import { useId, type ReactNode } from 'react';
import { Card } from './components/shadcn/card';
export function AnalysisChartFrame(p: { title: string; description: string; version: string; actions: ReactNode; legend: ReactNode; plot: ReactNode; selectionSummary: ReactNode; source: string; updated: string; coverage: string }) {
  const titleId = useId();
  return <Card role="region" aria-labelledby={titleId} className="my-4 space-y-3 p-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><h2 id={titleId} className="text-lg font-semibold">{p.title}</h2><div role="toolbar" aria-label="Chart actions" className="flex flex-wrap gap-1.5">{p.actions}</div></header>
    <p className="text-sm text-text-muted">{p.description} / Metric Version: {p.version}</p>
    <div aria-label="Legend" className="flex flex-wrap items-center gap-x-5 gap-y-2">{p.legend}</div>
    <div aria-label="Plot" className="space-y-2">{p.plot}</div>
    <section aria-label="Selection Summary" className="space-y-2">{p.selectionSummary}</section>
    <footer className="border-t border-border-subtle pt-3 text-sm text-text-secondary">Source: {p.source} · Updated: {p.updated} · Coverage: {p.coverage}</footer>
  </Card>;
}
