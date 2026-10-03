// PROTOTYPE (#52) — 버리는 코드, main 병합 금지. 하단 가운데 고정 바: ←/→로 디자인 3안 전환(prototype 스킬 UI.md).
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect } from 'react';
import { PROTO_VARIANTS, setProtoVariant, useProtoVariant } from '@ap/ui';

export function PrototypeSwitcher() {
  const variant = useProtoVariant();
  const index = PROTO_VARIANTS.findIndex(v => v.key === variant);
  const go = (delta: number) => setProtoVariant(PROTO_VARIANTS[(index + delta + PROTO_VARIANTS.length) % PROTO_VARIANTS.length].key);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Plain inline styles so the bar looks the same under every variant stylesheet.
  const btn: React.CSSProperties = { display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 999, background: 'transparent', border: 0, color: '#fff', cursor: 'pointer' };
  return <div role="toolbar" aria-label="프로토타입 안 전환" style={{
    position: 'fixed', left: '50%', bottom: 16, transform: 'translateX(-50%)', zIndex: 2147483000,
    display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 999,
    background: '#111', color: '#fff', boxShadow: '0 6px 24px rgba(0,0,0,.35)', font: '600 12px/1 system-ui, sans-serif',
  }}>
    <button type="button" aria-label="이전 안" onClick={() => go(-1)} style={btn}><ChevronLeft size={16} /></button>
    <span style={{ minWidth: 250, textAlign: 'center', letterSpacing: 0.2 }}>
      PROTOTYPE #52 · {variant} — {PROTO_VARIANTS[index].name}
    </span>
    <button type="button" aria-label="다음 안" onClick={() => go(1)} style={btn}><ChevronRight size={16} /></button>
  </div>;
}
