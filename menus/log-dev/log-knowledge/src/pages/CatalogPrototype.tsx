/**
 * PROTOTYPE (#1194, never merged): three variants of 카탈로그 관리, switchable via `?variant=A|B|C` on one route.
 * `?state=list|edit|inactive|error|deactivate` forces a state for captures. Data is a synthetic in-component fixture.
 */
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePlatform } from '@ap/kernel';
import { cn, isProductionEnv } from '@ap/ui';
import { buildCatalog, FORCED_STATES, type Catalog, type ForcedState } from './fixture';
import { VariantA } from './VariantA';
import { VariantB } from './VariantB';
import { VariantC } from './VariantC';

const VARIANTS = [
  { id: 'A', name: '탭 + 오른쪽 서랍' },
  { id: 'B', name: '모델 중심 표' },
  { id: 'C', name: '3열 드릴' },
] as const;
type VariantId = typeof VARIANTS[number]['id'];

export type VariantProps = { catalog: Catalog; setCatalog: (fn: (c: Catalog) => Catalog) => void; forced: ForcedState };

export default function CatalogPrototype() {
  const { pageParam, setPage } = usePlatform();
  const raw = pageParam('variant');
  const variant: VariantId = raw === 'B' || raw === 'C' ? raw : 'A';
  const rawState = pageParam('state');
  const forced: ForcedState = FORCED_STATES.some(s => s.id === rawState) ? rawState as ForcedState : 'list';
  const [catalog, setCatalogState] = useState(buildCatalog);
  const setCatalog = (fn: (c: Catalog) => Catalog) => setCatalogState(fn);
  const props = { catalog, setCatalog, forced };
  return <>
    {variant === 'A' && <VariantA key={`A-${forced}`} {...props} />}
    {variant === 'B' && <VariantB key={`B-${forced}`} {...props} />}
    {variant === 'C' && <VariantC key={`C-${forced}`} {...props} />}
    {!isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } }) && <PrototypeSwitcher current={variant} forced={forced}
      onVariant={v => setPage({ variant: v === 'A' ? null : v })} onState={s => setPage({ state: s === 'list' ? null : s })} />}
  </>;
}

function PrototypeSwitcher({ current, forced, onVariant, onState }: { current: VariantId; forced: ForcedState; onVariant: (v: VariantId) => void; onState: (s: ForcedState) => void }) {
  const index = VARIANTS.findIndex(v => v.id === current);
  const step = (d: number) => onVariant(VARIANTS[(index + d + VARIANTS.length) % VARIANTS.length]!.id);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="dialog"], [role="alertdialog"]'))) return;
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const name = VARIANTS[index]!.name;
  return <div role="toolbar" aria-label="프로토타입 안 전환" className="fixed bottom-4 left-1/2 z-50 flex w-max -translate-x-1/2 items-center gap-1 rounded-pill border border-border-strong bg-surface-popover p-1 shadow-lg">
    <button type="button" aria-label="이전 안" className="grid size-7 place-items-center rounded-pill text-text-secondary hover:bg-surface-row-hover" onClick={() => step(-1)}><ChevronLeft className="size-4" aria-hidden /></button>
    <span className="min-w-36 px-1 text-center text-xs font-semibold text-text-primary">{current} · {name}</span>
    <button type="button" aria-label="다음 안" className="grid size-7 place-items-center rounded-pill text-text-secondary hover:bg-surface-row-hover" onClick={() => step(1)}><ChevronRight className="size-4" aria-hidden /></button>
    <span aria-hidden className="mx-1 h-5 w-px bg-border-subtle" />
    {FORCED_STATES.map(s => <button key={s.id} type="button" aria-pressed={forced === s.id} onClick={() => onState(s.id)}
      className={cn('h-7 whitespace-nowrap rounded-pill px-2.5 text-xs', forced === s.id ? 'bg-accent-primary-soft font-semibold text-text-info-label' : 'text-text-secondary hover:bg-surface-row-hover')}>{s.label}</button>)}
  </div>;
}
