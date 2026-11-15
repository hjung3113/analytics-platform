import {
  DetailPanelFullscreenContext,
  DetailPanelReadingColumn,
  DetailPanelSlotProvider,
  cn,
  useDetailPanelSlotHost,
} from '@ap/ui';
import * as React from 'react';
export function AppFrame({
  children,
}: { children: React.ReactNode; activeDomain?: string; sidebarEntries?: unknown[] }) {
  return (
    <DetailPanelSlotProvider>
      <SlotBody>{children}</SlotBody>
    </DetailPanelSlotProvider>
  );
}
function SlotBody({ children }: { children: React.ReactNode }) {
  const {
    ref: slotHostRef,
    open: slotOpen,
    expanded: isExpanded,
    toggle: toggleSlot,
  } = useDetailPanelSlotHost();
  const columnContextValue = React.useMemo(
    () => ({ expanded: isExpanded, toggle: toggleSlot }),
    [isExpanded, toggleSlot],
  );
  return (
    <div className="flex h-screen" data-app-frame>
        <main
          className={cn('flex-1 min-w-0 flex flex-col', isExpanded && 'hidden')}
          data-testid="app-main"
          hidden={isExpanded}
        >
          {children}
        </main>
        <aside
          className={cn(
            'bg-surface-detail overflow-y-auto',
            // #862: expanded, the aside sits flush after the sidebar's border-r;
            // keep the seam line only while collapsed to avoid a 2px double line.
            !isExpanded && 'border-l border-border-subtle',
            slotOpen
              ? isExpanded
                ? 'flex-1 min-w-0'
                : 'w-(--detail-panel-width) min-w-90 max-w-130'
              : 'w-0',
          )}
          aria-label="상세 패널"
          data-testid="app-detail-slot"
          data-open={slotOpen ? 'true' : 'false'}
          data-expanded={isExpanded ? 'true' : 'false'}
        >
          {slotOpen && (
            <DetailPanelFullscreenContext.Provider value={columnContextValue}>
              <DetailPanelReadingColumn data-testid="app-detail-slot-column">
                <div ref={slotHostRef} className="contents" />
              </DetailPanelReadingColumn>
            </DetailPanelFullscreenContext.Provider>
          )}
        </aside>
      </div>
  );
}
