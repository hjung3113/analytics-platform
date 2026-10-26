import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from '../ui/components/Button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/components/shadcn/tabs';
// Non-modal on purpose: shadcn Sheet (Radix Dialog) traps focus when modal and dismisses on outside
// interaction when non-modal, either of which blocks using the table behind the drawer.
export function DetailDrawer({ title, context, tabs, onClose }: { title: string; context: ReactNode; tabs: { id: string; label: string; content: ReactNode }[]; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus({ preventScroll: true });
    return () => opener?.focus({ preventScroll: true });
  }, []);
  return <aside className="fixed inset-y-0 right-0 z-10 w-detail-panel max-w-[95vw] overflow-auto overscroll-contain border-l border-border-subtle bg-surface-detail p-6 shadow-xl" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
    <header className="flex items-center justify-between gap-3"><h2 id={`${id}-title`} className="text-lg font-semibold">{title}</h2><Button ref={close} variant="secondary" size="sm" onClick={onClose}>Close details</Button></header>
    <div className="py-3 text-text-muted">{context}</div>
    {/* Radix Tabs owns Arrow/Home/End roving focus with automatic activation. */}
    <Tabs defaultValue={tabs[0].id}>
      <TabsList aria-label="Detail tabs" className="bg-surface-popover">{tabs.map(tab => <TabsTrigger key={tab.id} value={tab.id}>{tab.label}</TabsTrigger>)}</TabsList>
      {tabs.map(tab => <TabsContent key={tab.id} value={tab.id}>{tab.content}</TabsContent>)}
    </Tabs>
  </aside>;
}
