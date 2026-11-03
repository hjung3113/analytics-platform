/** #1290 THROWAWAY PROTOTYPE ② — 공지 화면 variants (fixture). */
import { useState } from 'react';
import { Pin, Plus } from 'lucide-react';
import { PlatformPage } from '@ap/components';
import { usePlatform } from '@ap/kernel';
import { Button, StatusBadge, cn } from '@ap/ui';
import { NOTICES, SYSTEM_TONE, type ProtoNotice } from './fixtures';
import { PROTO_1287 } from './variant';

function useWrite() {
  const { can } = usePlatform();
  return can('console:access') ? <Button size="sm"><Plus className="size-3.5" aria-hidden />공지 작성</Button> : undefined;
}
const Sys = ({ n }: { n: ProtoNotice }) => <StatusBadge tone={SYSTEM_TONE[n.system] ?? 'neutral'}>{n.system}</StatusBadge>;

/** A — 목록: 고정 공지 위, 만료 공지는 기본 숨김 + 「지난 공지」 토글. 행을 펼쳐 읽음. */
function VariantA() {
  const [past, setPast] = useState(false);
  const [open, setOpen] = useState<string | null>('n1');
  const rows = NOTICES.filter(n => past || !n.expired).sort((a, b) => Number(b.pinned) - Number(a.pinned));
  return <PlatformPage layout="flow" primaryAction={useWrite()}>
    <div className="mb-2 flex items-center justify-between text-xs text-text-muted">
      <span>공지 {NOTICES.filter(n => !n.expired).length}건</span>
      <label className="flex items-center gap-1.5"><input type="checkbox" checked={past} onChange={e => setPast(e.target.checked)} />지난 공지 보기</label>
    </div>
    <ul className="divide-y divide-border-subtle border-y border-border-subtle">{rows.map(n => <li key={n.id}>
      <button onClick={() => setOpen(open === n.id ? null : n.id)} className={cn('flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-surface-row-hover', n.expired && 'opacity-60')}>
        {n.pinned ? <Pin className="size-3.5 text-accent-primary" aria-label="고정" /> : <span className="size-3.5" />}
        <Sys n={n} /><span className="flex-1 text-sm text-text-primary">{n.title}</span>
        {n.expired && <StatusBadge tone="neutral">종료</StatusBadge>}
        <span className="w-28 text-right text-xs text-text-muted">{n.at}{n.until ? ` ~ ${n.until}` : ''}</span></button>
      {open === n.id && <p className="pb-4 pl-10 pr-4 text-sm text-text-secondary">{n.body}</p>}</li>)}</ul>
  </PlatformPage>;
}

/** B — 읽기 창: 왼쪽 목록, 오른쪽 본문. 만료 공지는 아래 「종료됨」 묶음으로 흐리게 보임. */
function VariantB() {
  const [sel, setSel] = useState<ProtoNotice>(NOTICES[0]!);
  const live = NOTICES.filter(n => !n.expired);
  const ended = NOTICES.filter(n => n.expired);
  const Item = ({ n }: { n: ProtoNotice }) => <button onClick={() => setSel(n)} className={cn('w-full border-b border-border-subtle px-3 py-2.5 text-left', sel.id === n.id ? 'bg-surface-row-selected' : 'hover:bg-surface-row-hover', n.expired && 'opacity-60')}>
    <div className="flex items-center gap-2 text-xs text-text-muted">{n.pinned && <Pin className="size-3 text-accent-primary" aria-hidden />}<Sys n={n} /><span className="ml-auto">{n.at}</span></div>
    <div className="mt-1 truncate text-sm text-text-primary">{n.title}</div></button>;
  return <PlatformPage layout="fill" primaryAction={useWrite()}>
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-border-subtle">
      <aside className="w-[380px] shrink-0 overflow-y-auto border-r border-border-subtle">{live.map(n => <Item key={n.id} n={n} />)}
        <div className="bg-surface-list px-3 py-1.5 text-xs text-text-muted">종료됨</div>{ended.map(n => <Item key={n.id} n={n} />)}</aside>
      <article className="min-w-0 flex-1 p-6"><div className="flex items-center gap-2"><Sys n={sel} /><span className="text-xs text-text-muted">{sel.at}{sel.until ? ` ~ ${sel.until}` : ''}</span></div>
        <h2 className="mt-2 text-lg font-semibold">{sel.title}</h2><p className="mt-3 text-sm text-text-secondary">{sel.body}</p></article>
    </div>
  </PlatformPage>;
}

/** C — 월별 타임라인 카드, 만료 공지는 표시하지 않음(홈 배너와 같은 규칙). */
function VariantC() {
  const live = NOTICES.filter(n => !n.expired);
  return <PlatformPage layout="flow" primaryAction={useWrite()}>
    <div className="mx-auto max-w-3xl space-y-5">{['11월', '10월'].map(m => <section key={m}>
      <h3 className="mb-2 text-xs font-medium text-text-muted">{m}</h3>
      <ul className="space-y-2">{live.filter(n => n.at.startsWith(m === '11월' ? '11' : '10')).map(n => <li key={n.id} className={cn('rounded-md border bg-surface-canvas p-4', n.pinned ? 'border-accent-primary' : 'border-border-subtle')}>
        <div className="flex items-center gap-2 text-xs text-text-muted">{n.pinned && <><Pin className="size-3 text-accent-primary" aria-hidden />고정</>}<Sys n={n} /><span className="ml-auto">{n.at}{n.until ? ` ~ ${n.until}` : ''}</span></div>
        <h4 className="mt-1.5 text-[15px] font-medium">{n.title}</h4><p className="mt-1 text-sm text-text-secondary">{n.body}</p></li>)}</ul></section>)}</div>
  </PlatformPage>;
}

export default function NoticesProto() {
  return PROTO_1287 === 'B' ? <VariantB /> : PROTO_1287 === 'C' ? <VariantC /> : <VariantA />;
}
