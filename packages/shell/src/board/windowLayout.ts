/**
 * The toast stack's offsets, shared by the shell (which positions the stack) and the board window (which keeps its title bar clear of it, 893d2).
 * The stack sits `bottom` above the strip under main; one toast row needs `TOAST_ROW_PX` on top of that. Plain numbers: the start-up chunk imports this.
 */
export type ToastBottom = 'bottom-4' | 'bottom-14' | 'bottom-16';
const TOAST_BOTTOM_PX: Record<ToastBottom, number> = { 'bottom-4': 16, 'bottom-14': 56, 'bottom-16': 64 };
const TOAST_ROW_PX = 56;
/** The strip at the bottom of the window area that a toast can cover; the window's area is reduced by it. */
export const toastBand = (bottom: ToastBottom): number => TOAST_BOTTOM_PX[bottom] + TOAST_ROW_PX;
/** A window shows only where main is at least this wide; narrower, the board opens in the maximized display instead (ADR-0091). */
export const WINDOW_NARROW_BELOW = 900;
