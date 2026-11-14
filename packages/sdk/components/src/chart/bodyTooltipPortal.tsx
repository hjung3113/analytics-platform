import type { ReactNode, Ref } from 'react';
import { createPortal } from 'react-dom';

/**
 * A fixed-position tooltip rendered through a portal to `document.body`, so it escapes `contain: paint`
 * on the shell main area (which would otherwise clip it and offset `fixed` coordinates). Shared by the
 * canvas charts whose tooltips use viewport coordinates (SHE-5, #2023).
 */
export function BodyTooltipPortal({ domRef, hidden, className, children }: {
  domRef?: Ref<HTMLDivElement>; hidden?: boolean; className: string; children: ReactNode;
}) {
  return createPortal(
    <div ref={domRef} role="tooltip" hidden={hidden} className={className}>{children}</div>,
    document.body,
  );
}
