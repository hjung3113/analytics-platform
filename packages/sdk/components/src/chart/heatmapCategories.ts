import type { Tone } from '@ap/ui';
import type { ThemeColorToken } from '@ap/ui/theme';

/** Convert a typed semantic colour utility to the same token name used by the canvas renderer. */
const fromClass = (utility: `bg-${ThemeColorToken}` | `text-${ThemeColorToken}`) => utility.slice(utility.indexOf('-') + 1) as ThemeColorToken;

/** The existing StatusBadge fill/foreground pairs; categorical values never use a raw palette colour. */
export const HEATMAP_CATEGORY_TOKENS = {
  success: { fill: fromClass('bg-accent-success-soft'), text: fromClass('text-text-success-label') },
  warning: { fill: fromClass('bg-accent-warn-soft'), text: fromClass('text-text-warning-label') },
  danger: { fill: fromClass('bg-accent-danger-soft'), text: fromClass('text-text-danger-label') },
  neutral: { fill: fromClass('bg-accent-neutral-soft'), text: fromClass('text-text-secondary') },
  info: { fill: fromClass('bg-accent-primary-soft'), text: fromClass('text-text-info-label') },
} as const satisfies Record<Tone, { fill: ThemeColorToken; text: ThemeColorToken }>;
export const UNKNOWN_HEATMAP_CATEGORY_TOKENS = { fill: 'chart-no-data', text: fromClass('text-text-primary') } as const satisfies { fill: ThemeColorToken; text: ThemeColorToken };
