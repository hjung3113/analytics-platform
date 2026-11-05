import type * as React from 'react';
import { cn } from '../utils/cn.js';
import { ListTabs } from './ListTabs.js';
import type { ListToolbarTab } from './ListTabs.js';

export type { ListToolbarTab } from './ListTabs.js';

export interface ListToolbarProps {
  title?: string;
  tabs?: ListToolbarTab[];
  activeTab?: string;
  onTabChange?: (next: string) => void;
  tabsAriaLabel?: string;
  /** Pass-through to `ListTabs.maxVisible`; undefined keeps every tab in the strip. */
  tabsMaxVisible?: number;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Tabs and actions share one 50px row while the toolbar is wide enough; the tab block keeps `basis-[22rem]`, so when
 * the toolbar itself (not the viewport) cannot hold that plus the actions, the actions wrap to a second 50px row,
 * right-aligned. The bottom rule is a 1px overlay (`after:`), not a border, so rows add up exactly: 50px for one row, 100px for two.
 * The wrap depends only on the toolbar's own width, so dragging a panel crosses one threshold.
 * The main block renders only when `tabs` or `title` is given; with `action` only, the actions sit on the single row,
 * and a fully empty bar keeps its 50px frame (`min-h-toolbar`, #1364).
 */
export function ListToolbar({
  title,
  tabs,
  activeTab,
  onTabChange,
  tabsAriaLabel,
  tabsMaxVisible,
  action,
  className,
}: ListToolbarProps) {
  const hasMain = tabs !== undefined || title !== undefined;
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 px-4 bg-surface-canvas sticky top-0 z-10',
        'after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border-subtle',
        // Without the main block or an action nothing would give the bar its 50px row (#1364).
        !hasMain && action === undefined && 'min-h-toolbar',
        className,
      )}
      data-list-toolbar
    >
      {hasMain && (
        <div
          className="flex h-toolbar min-w-0 flex-1 basis-[22rem] items-center"
          data-list-toolbar-main
        >
          {tabs !== undefined ? (
            <ListTabs
              tabs={tabs}
              {...(activeTab !== undefined ? { activeTab } : {})}
              {...(onTabChange !== undefined ? { onTabChange } : {})}
              {...(tabsAriaLabel !== undefined ? { ariaLabel: tabsAriaLabel } : {})}
              {...(tabsMaxVisible !== undefined ? { maxVisible: tabsMaxVisible } : {})}
            />
          ) : (
            <h2 className="text-sm font-semibold text-text-primary truncate">{title}</h2>
          )}
        </div>
      )}

      {action !== undefined && (
        <div
          className="ml-auto flex min-h-toolbar min-w-0 max-w-full items-center py-1"
          data-list-toolbar-actions
        >
          {action}
        </div>
      )}
    </div>
  );
}

ListToolbar.displayName = 'ListToolbar';
