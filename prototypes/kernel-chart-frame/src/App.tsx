import { useMemo, useState } from 'react';
import { AnalysisChartFrame } from './AnalysisChartFrame';
import { AnnotationRepository } from './annotations';
import { fixture, initialChart, pan, rangeText, validRange, zoom, type GlobalContext, type PageFilter, type Range } from './model';
import { plotOption, renderPlot } from './plot';
export const defaultRepository = new AnnotationRepository();
export function App({ repository = defaultRepository }: { repository?: AnnotationRepository }) {
  const [global, setGlobal] = useState<GlobalContext>({ scope: 'synthetic-scope', indexRange: null });
  const [filter, setFilter] = useState<PageFilter>({ threshold: 0 });
  return <main><h1>Analysis Chart Contract</h1><p>합성 fixture, 실제 메뉴 아님 · 권한/URL 연동 없는 Unit B</p>
    <aside aria-label="Global Context">Global Context (읽기 전용): {global.scope} · 적용 구간: {rangeText(global.indexRange)}</aside>
    <fieldset><legend>Page Filter — 현재 fixture에만 적용</legend><label>Threshold <input type="range" min="0" max="100" value={filter.threshold} onChange={e => setFilter({ threshold: Number(e.target.value) })}/></label><output>{filter.threshold}</output></fieldset>
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
        <button onClick={() => setLocal(old => ({ ...old, viewport: zoom(old.viewport) }))}>Zoom</button>
        <button aria-pressed={brushing} onClick={() => { setBrushing(!brushing); if (brushing) { setLocal(old => ({ ...old, brush: null })); setDraft(['4', '12']); } else if (validDraft) setLocal(old => ({ ...old, brush: draftRange })); }}>Brush</button>
        <button onClick={() => { setLocal(initialChart()); setBrushing(false); setDraft(['4', '12']); }}>Reset</button>
        <button aria-pressed={local.compare} onClick={() => setLocal(old => ({ ...old, compare: !old.compare }))}>Compare</button>
        <button aria-expanded={editing} onClick={() => setEditing(!editing)}>Annotate</button>
        <button onClick={() => setNotice('Export fixture: 실제 파일 형식과 다운로드는 사용자 확인 필요.')}>Export</button>
        <button aria-expanded={more} onClick={() => setMore(!more)}>More</button>
      </>}
      legend={<>{(['A', ...(local.compare ? ['B'] : [])] as ('A' | 'B')[]).map(name => <label key={name}><input type="checkbox" checked={name === 'A' ? local.visibleA : local.visibleB} onChange={e => setLocal(old => ({ ...old, [name === 'A' ? 'visibleA' : 'visibleB']: e.target.checked }))}/>Synthetic {name} {name === 'A' ? '— solid' : '┄ dashed'}</label>)}</>}
      plot={<><div role="img" aria-label={`ECharts plot: ${activeNames.join(', ') || '표시 시리즈 없음'}`} dangerouslySetInnerHTML={{ __html: svg }}/>{empty && <p role="status">Empty: 조건에 맞는 표시 데이터 없음</p>}{!empty && selectionStatus && <p role="status">{selectionStatus}</p>}</>}
      selectionSummary={<><p>Chart Local State · Viewport: <output aria-label="Viewport">{rangeText(local.viewport)}</output> · Brush: <output aria-label="Brush range">{rangeText(local.brush)}</output></p>
        <button onClick={() => setLocal(old => ({ ...old, viewport: pan(old.viewport, -2) }))}>Pan left</button><button onClick={() => setLocal(old => ({ ...old, viewport: pan(old.viewport, 2) }))}>Pan right</button>
        {brushing && <fieldset><legend>Brush — 합성 좌표, 양끝 포함</legend>{['시작', '끝'].map((label, index) => <label key={label}>{label}<input type="number" min="0" max="20" step="any" value={draft[index]} onChange={e => changeDraft(index, e.target.value)}/></label>)}
          {!validDraft && <p role="alert">0 ≤ 시작 &lt; 끝 ≤ 20인 숫자 구간을 입력하세요.</p>}
          <button disabled={!validDraft || !local.brush} onClick={() => { if (local.brush) onApply(local.brush); }}>적용</button></fieldset>}
        <p>{activeNames.map(name => `Synthetic ${name}: ${count(name)} points`).join(' · ') || '표시 시리즈 없음'} (Viewport, Brush 범위 및 Page Filter 기준)</p>
      </>}
      source="synthetic fixture v1" updated="fixture revision 1 (고정, 데이터 시각 아님)" coverage="21/21 coordinates per series (100% fixture)"/>
    {more && <p>ECharts SVG · 인덱스 0–20 · Zoom/Pan/visibility는 URL로 전달되지 않습니다.</p>}
    <p role="status">{notice}</p>
    <section aria-label="Persistent Annotation"><h2>Persistent Annotation — in-memory 서버 대역</h2>
      {editing && <form onSubmit={e => { e.preventDefault(); try { repository.add(local.brush ?? local.viewport, text); setAnnotations(repository.list()); setText(''); setNotice('주석 저장됨 (서버 대역)'); } catch (error) { setNotice((error as Error).message); } }}><label>주석 내용<input value={text} onChange={e => setText(e.target.value)}/></label><p>저장 좌표: {rangeText(local.brush ?? local.viewport)}</p><button>주석 저장</button></form>}
      <ul>{annotations.map(a => <li key={a.id}>{rangeText(a.range)}: {a.text}</li>)}</ul><p>Reset/컴포넌트 재마운트 후 보존; 전체 새로고침 시 소멸.</p>
    </section>
    <details><summary>합성 원자료 (동일 데이터)</summary><table><thead><tr><th>index</th><th>Synthetic A</th><th>Synthetic B</th></tr></thead><tbody>{fixture.map(row => <tr key={row.x}><td>{row.x}</td><td>{row.A}</td><td>{row.B}</td></tr>)}</tbody></table></details>
  </>;
}
