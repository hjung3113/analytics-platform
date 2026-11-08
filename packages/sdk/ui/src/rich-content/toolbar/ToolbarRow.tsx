import * as React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '../../components/Button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuTrigger } from '../../components/shadcn/dropdown-menu';
import { cn } from '../../utils/cn';
import { IconHelp } from './IconHelp';

export type ToolbarAfterClose = (action: (anchor: HTMLButtonElement) => void) => void;

export interface ToolbarControl {
  id: string;
  group: number;
  control: React.ReactNode;
  overflow: React.ReactNode | ((afterClose: ToolbarAfterClose) => React.ReactNode);
}

/** Keep the original controls mounted (uploads/popovers retain state), measuring their natural widths even while folded. */
export function ToolbarRow({ controls, row }: { controls: ToolbarControl[]; row: number }) {
  const root = React.useRef<HTMLDivElement>(null);
  const more = React.useRef<HTMLSpanElement>(null);
  const moreButton = React.useRef<HTMLButtonElement>(null);
  const pendingPopup = React.useRef<((anchor: HTMLButtonElement) => void) | null>(null);
  const handoffTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => { clearTimeout(handoffTimer.current); }, []);
  const afterClose: ToolbarAfterClose = action => { pendingPopup.current = action; };
  const [count, setCount] = React.useState(controls.length);
  const ids = controls.map(control => control.id).join(',');
  React.useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const available = element.getBoundingClientRect().width;
      if (!available) return; // SSR/jsdom/hidden host: wait for the first real measurement.
      const style = getComputedStyle(element);
      const gap = parseFloat(style.columnGap) || 4;
      const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const widths = [...element.querySelectorAll<HTMLElement>('[data-toolbar-control]')].map(item => {
        const itemStyle = getComputedStyle(item);
        return item.getBoundingClientRect().width + (parseFloat(itemStyle.marginLeft) || 0) + (parseFloat(itemStyle.marginRight) || 0);
      });
      const full = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * gap;
      if (full <= available - padding) { setCount(widths.length); return; }
      let used = (more.current?.getBoundingClientRect().width ?? 28);
      let fits = 0;
      for (const width of widths) {
        if (used + gap + width > available - padding) break;
        used += gap + width; fits++;
      }
      setCount(fits);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.querySelectorAll('[data-toolbar-control]').forEach(item => observer.observe(item));
    return () => observer.disconnect();
  }, [ids]);
  const shown = Math.min(count, controls.length);
  return <div ref={root} data-toolbar-row={row} className="relative flex min-h-9 min-w-0 flex-nowrap items-center gap-1 px-2 py-1">
    {controls.map((item, index) => <span key={item.id} data-toolbar-control={item.id} data-toolbar-visible={index < shown} aria-hidden={index >= shown || undefined} inert={index >= shown || undefined} className={cn('inline-flex shrink-0 items-center', index > 0 && controls[index - 1]?.group !== item.group && 'relative ml-1 pl-2 before:absolute before:left-0 before:top-1/2 before:h-4 before:-translate-y-1/2 before:border-l before:border-border-subtle', index >= shown && 'invisible absolute pointer-events-none')}>{item.control}</span>)}
    <span ref={more} data-toolbar-visible={shown < controls.length} aria-hidden={shown === controls.length || undefined} inert={shown === controls.length || undefined} className={cn('inline-flex shrink-0', shown === controls.length && 'invisible absolute pointer-events-none')}>
      <DropdownMenu><IconHelp label="더보기"><DropdownMenuTrigger asChild><Button ref={moreButton} type="button" variant="ghost" size="icon-xs" aria-label="더보기"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger></IconHelp><DropdownMenuContent align="end" onCloseAutoFocus={() => {
        const open = pendingPopup.current;
        pendingPopup.current = null;
        // Let Radix finish unmounting the menu and restoring focus before the next popup opens.
        if (open) handoffTimer.current = setTimeout(() => {
          if (moreButton.current) open(moreButton.current);
        }, 0);
      }}><DropdownMenuGroup>{controls.slice(shown).map(control => <React.Fragment key={control.id}>{typeof control.overflow === 'function' ? control.overflow(afterClose) : control.overflow}</React.Fragment>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
    </span>
  </div>;
}
