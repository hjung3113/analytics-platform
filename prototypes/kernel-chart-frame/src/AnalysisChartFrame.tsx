import { useId, type ReactNode } from 'react';
export function AnalysisChartFrame(p: { title: string; description: string; version: string; actions: ReactNode; legend: ReactNode; plot: ReactNode; selectionSummary: ReactNode; source: string; updated: string; coverage: string }) {
  const titleId = useId();
  return <section className="frame" aria-labelledby={titleId}>
    <header><h2 id={titleId}>{p.title}</h2><div role="toolbar" aria-label="Chart actions">{p.actions}</div></header>
    <p>{p.description} / Metric Version: {p.version}</p>
    <div aria-label="Legend">{p.legend}</div>
    <div aria-label="Plot">{p.plot}</div>
    <section aria-label="Selection Summary">{p.selectionSummary}</section>
    <footer>Source: {p.source} · Updated: {p.updated} · Coverage: {p.coverage}</footer>
  </section>;
}
