/**
 * The Context bar chip look (platform extension, DESIGN.md "Shell visual rules"). Context editors and the overflow
 * trigger that stands in for hidden ones share it, so the overflow reads as one more chip (UIUX-56-01, #240) and its
 * measurement copies render at the same width. Not a FeedbackOps primitive, so ADR-0023's no-restyle rule does not apply.
 */
export const CONTEXT_CHIP = 'inline-flex h-8 items-center gap-1.5 rounded-sm border px-2.5 whitespace-nowrap text-xs hover:border-border-control';
/** The applied/reference tone; unsupported chips use a dashed border instead. */
export const CONTEXT_CHIP_TONE = 'border-border-strong bg-surface-card text-text-primary';
