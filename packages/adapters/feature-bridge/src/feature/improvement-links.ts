import { UUID_PATTERN } from './uuid';

/**
 * The platform destination of the notification deep link `/improvement-items/<uuid>`: the 개선 아이템 상세 menu
 * (`improvement-item`, #1328 e1). A hash or a query key stays unlinked, like every other target table
 * (ADR-0071 decision 10).
 */
export function improvementItemTarget(to: string): { menuId: string; params: Record<string, string> } | null {
  if (to.includes('#') || to.includes('?')) return null;
  const itemId = to.slice('/improvement-items/'.length);
  return to.startsWith('/improvement-items/') && UUID_PATTERN.test(itemId)
    ? { menuId: 'improvement-item', params: { itemId } }
    : null;
}
