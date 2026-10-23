import { hostLinks } from './links';
import { VOC_ID } from './voc-query';

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

/** `returnTo` lands only where the destination declares it (`voc-detail` does). */
export const { canLink: canVocLink, Link: VocLink } = hostLinks(vocTarget);
