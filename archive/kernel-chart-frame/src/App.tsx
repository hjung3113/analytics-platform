import { useId, useMemo, useState } from 'react';
import { AnalysisChartFrame } from './AnalysisChartFrame';
import { Alert } from './components/shadcn/alert';
import { Badge } from './components/shadcn/badge';
import { Button } from './components/shadcn/button';
import { Card } from './components/shadcn/card';
import { Checkbox } from './components/shadcn/checkbox';
import { Input } from './components/shadcn/input';
import { Label } from './components/shadcn/label';
import { AnnotationRepository } from './annotations';
import { fixture, initialChart, pan, rangeText, validRange, zoom, type GlobalContext, type PageFilter, type Range } from './model';
import { plotOption, renderPlot } from './plot';
export const defaultRepository = new AnnotationRepository();
// Independent toolbar toggles (not mutually exclusive), so pressed/expanded state is styled on Button rather than ToggleGroup.
const toolbarButton = { variant: 'secondary', size: 'sm', className: 'aria-pressed:border-border-selected aria-pressed:bg-surface-row-selected aria-expanded:border-border-selected aria-expanded:bg-surface-row-selected' } as const;
const panel = 'my-4 rounded-lg border border-border-subtle bg-surface-card p-4';
export function App({ repository = defaultRepository }: { repository?: AnnotationRepository }) {
  const [global, setGlobal] = useState<GlobalContext>({ scope: 'synthetic-scope', indexRange: null });
  const [filter, setFilter] = useState<PageFilter>({ threshold: 0 });
  return <main className="mx-auto my-6 max-w-[1180px] px-5 max-sm:px-2"><h1 className="text-2xl font-semibold">Analysis Chart Contract</h1><p className="mt-1 text-text-secondary">합성 fixture, 실제 메뉴 아님 · 권한/URL 연동 없는 Unit B</p>
    <aside aria-label="Global Context" className="my-4 rounded-lg border border-l-4 border-border-subtle border-l-accent-primary bg-accent-primary/5 p-4">Global Context (읽기 전용): {global.scope} · 적용 구간: {rangeText(global.indexRange)}</aside>
    <fieldset className={panel}><legend className="px-1 text-sm font-medium">Page Filter — 현재 fixture에만 적용</legend><div className="flex items-center gap-3"><Label className="inline-flex items-center gap-2">Threshold <input type="range" min="0" max="100" value={filter.threshold} className="accent-accent-primary" onChange={e => setFilter({ threshold: Number(e.target.value) })}/></Label><output className="text-sm tabular-nums">{filter.threshold}</output></div></fieldset>
    <ChartFixture filter={filter} repository={repository} onApply={range => { if (validRange(range)) setGlobal(old => ({ ...old, indexRange: [...range] })); }}/>
  </main>;
}
export function ChartFixture({ filter, repository, onApply }: { filter: PageFilter; repository: AnnotationRepository; onApply: (range: Range) => void }) {
  const [local, setLocal] = useState(initialChart);
  const [brushing, setBrushing] = useState(false);
  const [draft, setDraft] = useState<[string, string]>(['4', '12']);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [annotations, setAnnotations] = useState(() => repository.list());
  const [more, setMore] = useState(false);
  const [notice, setNotice] = useState('');
  const legendId = useId();
  const draftRange: Range = [Number(draft[0]), Number(draft[1])];
  const validDraft = draft.every(v => v.trim() !== '') && validRange(draftRange);
  const svg = useMemo(() => renderPlot(plotOption(local, filter, annotations)), [local, filter, annotations]);
  const changeDraft = (index: number, value: string) => {
    const next: [string, string] = [...draft]; next[index] = value; setDraft(next);
    const range: Range = [Number(next[0]), Number(next[1])];
    setLocal(old => ({ ...old, brush: next.every(v => v.trim() !== '') && validRange(range) ? range : null }));
  };
  const activeNames = [...(local.visibleA ? ['A' as const] : []), ...(local.compare && local.visibleB ? ['B' as const] : [])];
  const availableNames: ('A' | 'B')[] = local.compare ? ['A', 'B'] : ['A'];
  const displayRows = fixture.filter(row => row.x >= local.viewport[0] && row.x <= local.viewport[1]);
  const count = (name: 'A' | 'B') => displayRows.filter(row => row[name] >= filter.threshold && (!local.brush || (row.x >= local.brush[0] && row.x <= local.brush[1]))).length;
  // Empty is a data result, independent of visibility and Brush selection.
  const empty = !displayRows.some(row => availableNames.some(name => row[name] >= filter.threshold));
  const selectionStatus = activeNames.length === 0 ? '선택된 series 없음'
    : local.brush && activeNames.every(name => count(name) === 0) ? 'Brush 범위 안에 데이터 없음' : null;
  return <>
    <AnalysisChartFrame title="Synthetic series" description="숫자 인덱스 / 단위 없는 합성 값" version="fixture-v1 (업무 지표 아님)"
      actions={<>
        <Button {...toolbarButton} onClick={() => setLocal(old => ({ ...old, viewport: zoom(old.viewport) }))}>Zoom</Button>
        <Button {...toolbarButton} aria-pressed={brushing} onClick={() => { setBrushing(!brushing); if (brushing) { setLocal(old => ({ ...old, brush: null })); setDraft(['4', '12']); } else if (validDraft) setLocal(old => ({ ...old, brush: draftRange })); }}>Brush</Button>
        <Button {...toolbarButton} onClick={() => { setLocal(initialChart()); setBrushing(false); setDraft(['4', '12']); }}>Reset</Button>
        <Button {...toolbarButton} aria-pressed={local.compare} onClick={() => setLocal(old => ({ ...old, compare: !old.compare }))}>Compare</Button>
        <Button {...toolbarButton} aria-expanded={editing} onClick={() => setEditing(!editing)}>Annotate</Button>
        <Button {...toolbarButton} onClick={() => setNotice('Export fixture: 실제 파일 형식과 다운로드는 사용자 확인 필요.')}>Export</Button>
        <Button {...toolbarButton} aria-expanded={more} onClick={() => setMore(!more)}>More</Button>
      </>}
      legend={<>{(['A', ...(local.compare ? ['B'] : [])] as ('A' | 'B')[]).map(name => <div key={name} className="flex items-center gap-2"><Checkbox id={`${legendId}-${name}`} checked={name === 'A' ? local.visibleA : local.visibleB} onCheckedChange={checked => setLocal(old => ({ ...old, [name === 'A' ? 'visibleA' : 'visibleB']: checked === true }))}/><Label htmlFor={`${legendId}-${name}`}>Synthetic {name} {name === 'A' ? '— solid' : '┄ dashed'}</Label></div>)}</>}
      plot={<><div role="img" aria-label={`ECharts plot: ${activeNames.join(', ') || '표시 시리즈 없음'}`} dangerouslySetInnerHTML={{ __html: svg }}/>{empty && <Alert role="status" className="py-2 text-sm">Empty: 조건에 맞는 표시 데이터 없음</Alert>}{!empty && selectionStatus && <Badge role="status" variant="outline" className="border-accent-warn/40 bg-accent-warn/10 text-text-warning">{selectionStatus}</Badge>}</>}
      selectionSummary={<><p className="text-sm">Chart Local State · Viewport: <output aria-label="Viewport" className="tabular-nums">{rangeText(local.viewport)}</output> · Brush: <output aria-label="Brush range" className="tabular-nums">{rangeText(local.brush)}</output></p>
        <div className="flex gap-1.5"><Button variant="outline" size="sm" onClick={() => setLocal(old => ({ ...old, viewport: pan(old.viewport, -2) }))}>Pan left</Button><Button variant="outline" size="sm" onClick={() => setLocal(old => ({ ...old, viewport: pan(old.viewport, 2) }))}>Pan right</Button></div>
        {brushing && <fieldset className="space-y-3 rounded-md border border-border-subtle p-3"><legend className="px-1 text-sm font-medium">Brush — 합성 좌표, 양끝 포함</legend><div className="flex flex-wrap gap-4">{['시작', '끝'].map((label, index) => <Label key={label} className="inline-flex items-center gap-2">{label}<Input type="number" min="0" max="20" step="any" className="h-8 w-24" value={draft[index]} onChange={e => changeDraft(index, e.target.value)}/></Label>)}</div>
          {!validDraft && <Alert variant="destructive" className="py-2 text-sm">0 ≤ 시작 &lt; 끝 ≤ 20인 숫자 구간을 입력하세요.</Alert>}
          <Button size="sm" disabled={!validDraft || !local.brush} onClick={() => { if (local.brush) onApply(local.brush); }}>적용</Button></fieldset>}
        <p className="text-sm text-text-secondary">{activeNames.map(name => `Synthetic ${name}: ${count(name)} points`).join(' · ') || '표시 시리즈 없음'} (Viewport, Brush 범위 및 Page Filter 기준)</p>
      </>}
      source="synthetic fixture v1" updated="fixture revision 1 (고정, 데이터 시각 아님)" coverage="21/21 coordinates per series (100% fixture)"/>
    {more && <p className="text-sm text-text-muted">ECharts SVG · 인덱스 0–20 · Zoom/Pan/visibility는 URL로 전달되지 않습니다.</p>}
    <p role="status" className="text-sm text-text-secondary">{notice}</p>
    <Card role="region" aria-label="Persistent Annotation" className="my-4 space-y-3 p-4"><h2 className="text-lg font-semibold">Persistent Annotation — in-memory 서버 대역</h2>
      {editing && <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); try { repository.add(local.brush ?? local.viewport, text); setAnnotations(repository.list()); setText(''); setNotice('주석 저장됨 (서버 대역)'); } catch (error) { setNotice((error as Error).message); } }}><Label className="flex flex-col gap-1.5">주석 내용<Input className="h-9 w-72" value={text} onChange={e => setText(e.target.value)}/></Label><p className="pb-2 text-sm text-text-muted">저장 좌표: {rangeText(local.brush ?? local.viewport)}</p><Button type="submit" size="sm">주석 저장</Button></form>}
      <ul className="list-disc pl-5 text-sm">{annotations.map(a => <li key={a.id}>{rangeText(a.range)}: {a.text}</li>)}</ul><p className="text-sm text-text-muted">Reset/컴포넌트 재마운트 후 보존; 전체 새로고침 시 소멸.</p>
    </Card>
    {/* No table component among the 22 ported shadcn sources: token utilities only. */}
    <details className={panel}><summary className="cursor-pointer font-medium">합성 원자료 (동일 데이터)</summary><table className="mt-3 border-collapse text-sm tabular-nums [&_td]:border-b [&_td]:border-border-subtle [&_td]:px-4 [&_td]:py-1.5 [&_td]:text-right [&_th]:border-b [&_th]:border-border-strong [&_th]:px-4 [&_th]:py-1.5 [&_th]:text-right [&_th]:font-medium [&_th]:text-text-secondary"><thead><tr><th>index</th><th>Synthetic A</th><th>Synthetic B</th></tr></thead><tbody>{fixture.map(row => <tr key={row.x}><td>{row.x}</td><td>{row.A}</td><td>{row.B}</td></tr>)}</tbody></table></details>
  </>;
}
