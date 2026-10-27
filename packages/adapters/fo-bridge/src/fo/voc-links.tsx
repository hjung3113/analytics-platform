import { hostLinks } from './links';
import { UUID_PATTERN } from './uuid';

export const VOC_ID = UUID_PATTERN;

/**
 * The platform destination of the one FeedbackOps VOC path that is a reporter's own VOC: `/vocs?view=my&selected=<uuid>` and nothing else
 * (ADR-0071 decision 10, amended). The operator targets (`view=inbox`) have no destination here.
 */
export function vocTarget(to: string): { menuId: string; params: Record<string, string> } | null {
  if (to.includes('#')) return null;
  const [path, query = ''] = to.split('?') as [string, string?];
  if (path !== '/vocs') return null;
  const search = new URLSearchParams(query);
  const keys = [...search.keys()].sort();
  const vocId = search.get('selected');
  if (keys.length !== 2 || keys[0] !== 'selected' || keys[1] !== 'view' || search.get('view') !== 'my' || vocId === null || !VOC_ID.test(vocId)) return null;
  return { menuId: 'voc-detail', params: { vocId } };
}

/** The reporter's own VOC list, `/vocs?view=my` exactly (no `selected`, no other key): the platform `내 VOC` menu. */
export function vocListTarget(to: string): { menuId: string } | null {
  if (to.includes('#')) return null;
  const [path, query = ''] = to.split('?') as [string, string?];
  const search = new URLSearchParams(query);
  return path === '/vocs' && [...search.keys()].join() === 'view' && search.get('view') === 'my' ? { menuId: 'voc' } : null;
}

/** `returnTo` lands only where the destination declares it (`voc-detail`, `survey-respond`, `equipment-detail`, `execution-detail`, `metric-detail`), and never inside a space that carries it (the FO space only carries). */
export const { canLink: canVocLink, Link: VocLink } = hostLinks(vocTarget);
