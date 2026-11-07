import { beforeAfterPeriods, isAppRelativePath, type BeforeAfterPeriods } from '@ap/contracts';
import type { MenuPlatform } from '@ap/kernel';
import type { Origin } from './endpoints';
import { originLinkOptions } from './origin';
export const COMPARISON_DAYS = [1, 7, 14, 30] as const;
export const safeComparisonHref = (href: string): boolean => href.length <= 2000 && isAppRelativePath(href);
type Comparison = { periods: BeforeAfterPeriods | null; href: string | null; reason: 'noDate' | 'noOrigin' | 'unavailable' | null };
/** Equal windows let the analysis menu query the before window through its existing Compare interaction.
 * A calendar action day starts at midnight KST; no timezone conversion and no new URL keys. */
export function comparisonFor(actionDate: string | null, origin: Origin | null, days: number, resolveLink: MenuPlatform['resolveLink']): Comparison {
  if (!actionDate) return { periods: null, href: null, reason: 'noDate' };
  if (!origin) return { periods: null, href: null, reason: 'noOrigin' };
  let periods: BeforeAfterPeriods | null = null;
  try {
    periods = beforeAfterPeriods(`${actionDate}T00:00:00`, { before: { days }, after: { days } });
    if (!periods.after) return { periods, href: null, reason: 'unavailable' };
    // Clear ambient Context before restoring the saved snapshot, including absent metric/equipment fields.
    const options = originLinkOptions(origin);
    const result = resolveLink(origin.menuId, { ...options, global: { ...options.global, ...periods.after } });
    if (result.allowed && safeComparisonHref(result.href)) return { periods, href: result.href, reason: null };
  } catch { /* Retired menus and invalid saved Context are unavailable prerequisites, not query errors. */ }
  return { periods, href: null, reason: 'unavailable' };
}
