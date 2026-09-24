import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
export function DetailDrawer({ title, context, tabs, onClose }: { title: string; context: ReactNode; tabs: { id: string; label: string; content: ReactNode }[]; onClose: () => void }) {
  const [active, setActive] = useState(tabs[0].id);
  const close = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus({ preventScroll: true });
    return () => opener?.focus({ preventScroll: true });
  }, []);
  return <aside className="drawer" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
    <header><h2 id={`${id}-title`}>{title}</h2><button ref={close} onClick={onClose}>Close details</button></header>
    <div className="context">{context}</div>
    <div role="tablist" aria-label="Detail tabs">{tabs.map((tab, index) => <button key={tab.id} id={`${id}-${tab.id}`} role="tab" aria-selected={active === tab.id} aria-controls={`${id}-panel-${tab.id}`} tabIndex={active === tab.id ? 0 : -1} onClick={() => setActive(tab.id)} onKeyDown={e => {
      const next = e.key === 'ArrowRight' ? (index + 1) % tabs.length : e.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
      if (next >= 0) { e.preventDefault(); setActive(tabs[next].id); document.getElementById(`${id}-${tabs[next].id}`)?.focus(); }
    }}>{tab.label}</button>)}</div>
    {tabs.map(tab => <div key={tab.id} role="tabpanel" id={`${id}-panel-${tab.id}`} aria-labelledby={`${id}-${tab.id}`} hidden={active !== tab.id} tabIndex={0}>{tab.content}</div>)}
  </aside>;
}
