import * as React from 'react';

const defaultSelector = 'button:not(:disabled)';
/** Shared keyboard model for fixed rows and floating block controls. Portals stay outside the root. */
export function useToolbarRovingFocus(root: React.RefObject<HTMLDivElement | null>, selector = defaultSelector) {
  const lastFocus = React.useRef<HTMLButtonElement | null>(null);
  const enabledButtons = React.useCallback(() => [...(root.current?.querySelectorAll<HTMLButtonElement>(selector) ?? [])], [root, selector]);
  const remember = (button: HTMLButtonElement) => {
    lastFocus.current = button;
    root.current?.querySelectorAll<HTMLButtonElement>('button').forEach(item => { item.tabIndex = item === button ? 0 : -1; });
  };
  React.useLayoutEffect(() => {
    const normalize = () => {
      const buttons = enabledButtons();
      const selected = lastFocus.current && buttons.includes(lastFocus.current) ? lastFocus.current : buttons[0];
      root.current?.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.tabIndex = button === selected ? 0 : -1; });
      if (lastFocus.current && !buttons.includes(lastFocus.current) && document.activeElement === lastFocus.current) selected?.focus();
    };
    normalize();
    const observer = new MutationObserver(normalize);
    if (root.current) observer.observe(root.current, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-toolbar-visible', 'disabled'] });
    return () => observer.disconnect();
  });
  return {
    onFocusCapture: (event: React.FocusEvent<HTMLDivElement>) => {
      if (event.target instanceof HTMLButtonElement && root.current?.contains(event.target)) remember(event.target);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !root.current?.contains(event.target as Node)) return;
      const buttons = enabledButtons(); const index = buttons.indexOf(event.target as HTMLButtonElement);
      if (index < 0) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    },
  };
}
