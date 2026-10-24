// THROWAWAY #595 — never merge.
// Variant bar (A | B | 지금 UI) and persona toggle. Both reload the page; `protoBar=0` hides it for captures.
import { cn } from '@ap/ui';
import { applyProto, PROTO } from './state';

function Seg<T extends string>({ value, options, onPick }: { value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return <div className="flex overflow-hidden rounded-md border border-border-control">
    {options.map(([v, label]) => <button key={v} type="button" onClick={() => onPick(v)} aria-pressed={v === value}
      className={cn('px-2.5 py-1 text-xs', v === value ? 'bg-accent-primary text-text-on-accent' : 'bg-surface-card text-text-secondary hover:bg-surface-row-hover')}>{label}</button>)}
  </div>;
}

export function ProtoBar() {
  if (PROTO.hideBar) return null;
  return <div className="fixed bottom-3 left-1/2 z-70 flex -translate-x-1/2 items-center gap-3 rounded-md border border-border-strong bg-surface-card px-3 py-2 shadow-lg">
    <span className="text-xs font-semibold text-text-muted">시안</span>
    <Seg value={PROTO.variant ?? 'none'} options={[['none', '지금 UI'], ['A', 'A 플랫폼 틀'], ['B', 'B FeedbackOps 틀']]} onPick={v => applyProto({ variant: v })} />
    <Seg value={PROTO.persona} options={[['staff', '담당자'], ['reporter', '신고자']]} onPick={v => applyProto({ persona: v, variant: PROTO.variant ?? 'A' })} />
  </div>;
}
