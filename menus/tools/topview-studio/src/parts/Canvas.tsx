import { useEffect, useRef, useState } from 'react';
import type { LayoutDocument } from '@eqv/core';
import { TopViewer, type ComponentDrag } from '@eqv/renderer';
import { ViewerZoomControls } from '@eqv/ui';
import { cn } from '@ap/ui';

export const PANEL = 'flex h-full min-h-0 min-w-0 flex-col';

/** The drawing, filling its pane, with the always-visible disclosure that it is a schematic. */
export function Canvas({ layout, selectedId, onSelect, onDrag }: { layout: LayoutDocument; selectedId: string | null; onSelect(id: string | null): void; onDrag?: (drag: ComponentDrag) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = host.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div className={cn(PANEL, 'flex-1 overflow-hidden bg-surface-card')}>
    <div ref={host} data-testid="layout-canvas" className="min-h-0 min-w-0 flex-1 overflow-hidden">
      {size.width > 0 && size.height > 0 && <TopViewer layout={layout} width={size.width} height={size.height} selectedId={selectedId} onSelectedChange={onSelect}
        {...(onDrag ? { onComponentDrag: onDrag } : {})}
        renderControls={controls => <ViewerZoomControls controls={controls} labels={{ zoomIn: '확대', zoomOut: '축소', fit: '맞춤' }} />} />}
    </div>
    <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border-subtle px-3 py-2 text-xs text-text-secondary">
      <span className="font-medium">개략도 · 실측 아님 · 제조사 도면 아님</span>
    </div>
  </div>;
}
