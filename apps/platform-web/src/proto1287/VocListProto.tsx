/** #1288 THROWAWAY PROTOTYPE ② — 직속 VOC 목록 variants (fixture data, no server). */
import { useState } from 'react';
import { MessageSquare, Plus, Search } from 'lucide-react';
import { PlatformPage } from '@ap/components';
import { PlatformLink, usePlatform } from '@ap/kernel';
import { Button, StatusBadge, cn } from '@ap/ui';
import { STATUS_TONE, SYSTEM_TONE, THREAD, VOCS, type ProtoVoc } from './fixtures';
import { PROTO_1287 } from './variant';

const SYSTEMS = ['전체 시스템', '플랫폼', 'MARS', 'BRAVO', 'CLAS'];

function Seg({ value, onChange, items }: { value: string; onChange: (v: string) => void; items: { id: string; label: string; count?: number }[] }) {
  return <div role="tablist" className="inline-flex rounded-md border border-border-subtle bg-surface-canvas p-0.5">
    {items.map(it => <button key={it.id} role="tab" aria-selected={value === it.id} onClick={() => onChange(it.id)}
      className={cn('flex h-7 items-center gap-1.5 rounded px-3 text-xs', value === it.id ? 'bg-surface-row-selected font-medium text-text-primary' : 'text-text-muted hover:text-text-primary')}>
      {it.label}{it.count !== undefined && <span className="text-text-muted">{it.count}</span>}</button>)}
  </div>;
}

function SystemTag({ name }: { name: string }) {
  return <StatusBadge tone={SYSTEM_TONE[name] ?? 'neutral'}>{name}</StatusBadge>;
}

function useFilter() {
  const [tab, setTab] = useState('all');
  const [system, setSystem] = useState('전체 시스템');
  const rows = VOCS.filter(v => (tab === 'all' || v.mine) && (system === '전체 시스템' || v.system === system));
  return { tab, setTab, system, setSystem, rows };
}

const compose = <Button size="sm"><Plus className="size-3.5" aria-hidden />VOC 등록</Button>;

/** A — 표 목록: 탭(전체/내가 등록한) + 시스템 필터, 행을 누르면 상세 주소로. */
function VariantA() {
  const { linkTo } = usePlatform();
  const f = useFilter();
  return <PlatformPage layout="fill" primaryAction={compose}>
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border-subtle">
        <Seg value={f.tab} onChange={f.setTab} items={[{ id: 'all', label: '전체', count: VOCS.length }, { id: 'mine', label: '내가 등록한', count: VOCS.filter(v => v.mine).length }]} />
        <select aria-label="시스템" value={f.system} onChange={e => f.setSystem(e.target.value)} className="h-8 rounded-md border border-border-subtle bg-surface-canvas px-2 text-xs">{SYSTEMS.map(s => <option key={s}>{s}</option>)}</select>
        <div className="ml-auto flex h-8 w-64 items-center gap-2 rounded-md border border-border-subtle bg-surface-canvas px-2 text-xs text-text-muted"><Search className="size-3.5" aria-hidden />제목 또는 번호</div>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="h-9 border-b border-border-subtle text-left text-xs text-text-muted">
          <th className="w-24 font-normal">번호</th><th className="w-24 font-normal">시스템</th><th className="font-normal">제목</th><th className="w-24 font-normal">상태</th><th className="w-16 font-normal">답변</th><th className="w-24 font-normal">등록</th></tr></thead>
        <tbody>{f.rows.map(v => <tr key={v.id} className="h-11 border-b border-border-subtle hover:bg-surface-row-hover">
          <td className="font-mono text-xs text-text-muted">{v.display}</td>
          <td><SystemTag name={v.system} /></td>
          <td><PlatformLink href={linkTo('voc-detail', { params: { vocId: v.id } } as never)} className="text-text-primary hover:underline">{v.title}</PlatformLink>{v.mine && <span className="ml-2 text-xs text-text-muted">내가 등록</span>}</td>
          <td><StatusBadge tone={STATUS_TONE[v.status]} dot>{v.status}</StatusBadge></td>
          <td className="text-xs text-text-muted">{v.replies > 0 ? `${v.replies}건` : '–'}</td>
          <td className="text-xs text-text-muted">{v.at}</td></tr>)}</tbody>
      </table>
      <p className="mt-3 text-xs text-text-muted">플랫폼 VOC는 모두에게, 시스템 VOC는 그 시스템 권한을 받은 사람에게 보입니다.</p>
    </div>
  </PlatformPage>;
}

/** B — 목록과 상세를 한 화면에(왼쪽 목록, 오른쪽 읽기 창). */
function VariantB() {
  const f = useFilter();
  const [sel, setSel] = useState<ProtoVoc>(VOCS[0]!);
  return <PlatformPage layout="fill" primaryAction={compose}>
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-border-subtle">
      <aside className="flex w-[420px] shrink-0 flex-col border-r border-border-subtle bg-surface-canvas">
        <div className="flex items-center gap-2 border-b border-border-subtle p-2">
          <Seg value={f.tab} onChange={f.setTab} items={[{ id: 'all', label: '전체' }, { id: 'mine', label: '내가 등록한' }]} />
          <select aria-label="시스템" value={f.system} onChange={e => f.setSystem(e.target.value)} className="ml-auto h-8 rounded-md border border-border-subtle px-2 text-xs">{SYSTEMS.map(s => <option key={s}>{s}</option>)}</select>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">{f.rows.map(v => <li key={v.id}>
          <button onClick={() => setSel(v)} className={cn('w-full border-b border-border-subtle px-3 py-2.5 text-left', sel.id === v.id ? 'bg-surface-row-selected' : 'hover:bg-surface-row-hover')}>
            <div className="flex items-center gap-2 text-xs text-text-muted"><span className="font-mono">{v.display}</span><SystemTag name={v.system} /><span className="ml-auto">{v.at}</span></div>
            <div className="mt-1 truncate text-sm text-text-primary">{v.title}</div>
            <div className="mt-1 flex items-center gap-2"><StatusBadge tone={STATUS_TONE[v.status]} dot>{v.status}</StatusBadge>{v.replies > 0 && <span className="flex items-center gap-1 text-xs text-text-muted"><MessageSquare className="size-3" aria-hidden />{v.replies}</span>}{v.mine && <span className="text-xs text-text-muted">내가 등록</span>}</div>
          </button></li>)}</ul>
      </aside>
      <section className="min-w-0 flex-1 overflow-y-auto p-5"><DetailBody voc={sel} compact /></section>
    </div>
  </PlatformPage>;
}

/** C — 게시판형 카드: 상태별 묶음 없이 최근 순, 담당자 마지막 답변을 카드에 미리 보임. */
function VariantC() {
  const { linkTo } = usePlatform();
  const f = useFilter();
  return <PlatformPage layout="flow" primaryAction={compose}>
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center gap-2">
        <Seg value={f.tab} onChange={f.setTab} items={[{ id: 'all', label: '전체' }, { id: 'mine', label: '내가 등록한' }]} />
        <div className="ml-2 flex gap-1">{SYSTEMS.slice(1).map(s => <button key={s} onClick={() => f.setSystem(f.system === s ? '전체 시스템' : s)} className={cn('h-7 rounded-pill border px-2.5 text-xs', f.system === s ? 'border-accent-primary text-accent-primary' : 'border-border-subtle text-text-muted')}>{s}</button>)}</div>
      </div>
      <ul className="space-y-2">{f.rows.map(v => <li key={v.id} className="rounded-md border border-border-subtle bg-surface-canvas p-4">
        <div className="flex items-center gap-2 text-xs text-text-muted"><SystemTag name={v.system} /><StatusBadge tone={STATUS_TONE[v.status]} dot>{v.status}</StatusBadge><span className="ml-auto">{v.display} · {v.at}</span></div>
        <PlatformLink href={linkTo('voc-detail', { params: { vocId: v.id } } as never)} className="mt-2 block text-[15px] font-medium text-text-primary hover:underline">{v.title}</PlatformLink>
        <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{v.body}</p>
        {v.replies > 0 && <p className="mt-2 border-l-2 border-accent-primary pl-2 text-xs text-text-muted">담당자 답변 {v.replies}건 · 최근: 재현했습니다. 이번 주 안에 고쳐서 알려 드리겠습니다.</p>}
      </li>)}</ul>
    </div>
  </PlatformPage>;
}

export function DetailBody({ voc, compact = false }: { voc: ProtoVoc; compact?: boolean }) {
  const { can } = usePlatform();
  const operator = can('features:access');
  return <div className={cn('flex gap-6', compact && 'flex-col gap-4')}>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2 text-xs text-text-muted"><span className="font-mono">{voc.display}</span><SystemTag name={voc.system} /><StatusBadge tone={STATUS_TONE[voc.status]} dot>{voc.status}</StatusBadge></div>
      <h2 className="mt-2 text-lg font-semibold text-text-primary">{voc.title}</h2>
      {operator && <div className="mt-3 flex items-center justify-between rounded-md border border-border-subtle bg-surface-list px-3 py-2 text-xs">
        <span className="text-text-secondary">처리 권한이 있습니다. 분류·내부 메모·담당 배정은 업무 흐름에서 합니다.</span>
        <Button size="sm" variant="outline">업무 흐름에서 처리 →</Button></div>}
      <ol className="mt-4 space-y-3">{THREAD.map((t, i) => <li key={i} className={cn('rounded-md border p-3', t.kind === '담당자 답변' ? 'border-accent-primary-soft bg-accent-primary-soft/40' : 'border-border-subtle bg-surface-canvas')}>
        <div className="flex items-center gap-2 text-xs"><span className="font-medium text-text-primary">{t.kind}</span><span className="text-text-muted">{t.who} · {t.at}</span></div>
        <p className="mt-1 text-sm text-text-secondary">{t.text}</p></li>)}</ol>
      {voc.mine && <div className="mt-3 rounded-md border border-border-subtle p-3 text-sm text-text-muted">신고자 답글 쓰기…</div>}
    </div>
    {!compact && <aside className="w-64 shrink-0 space-y-3 text-sm">
      <dl className="space-y-2 rounded-md border border-border-subtle p-3">
        <div className="flex justify-between"><dt className="text-text-muted">시스템</dt><dd>{voc.system}</dd></div>
        <div className="flex justify-between"><dt className="text-text-muted">상태</dt><dd>{voc.status}</dd></div>
        <div className="flex justify-between"><dt className="text-text-muted">등록</dt><dd>{voc.at}</dd></div>
        <div className="flex justify-between"><dt className="text-text-muted">신고자</dt><dd>{voc.reporter}</dd></div>
      </dl>
      <p className="text-xs text-text-muted">플랫폼 VOC는 로그인한 모든 사람이 봅니다. 내부 메모와 분류는 보이지 않습니다.</p>
    </aside>}
  </div>;
}

export default function VocListProto() {
  return PROTO_1287 === 'B' ? <VariantB /> : PROTO_1287 === 'C' ? <VariantC /> : <VariantA />;
}
