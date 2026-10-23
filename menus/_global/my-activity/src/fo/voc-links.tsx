import { PlatformLink, usePlatform } from '@ap/kernel';
import type { HostLinkProps } from '@fops/frontend/global-screens';
import { UnlinkedLink } from './FoBridge';
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

export const canVocLink = (to: string) => vocTarget(to) !== null;

/** `returnTo` lands only where the destination declares it (`voc-detail` does). */
export function VocLink({ to, children, ...rest }: HostLinkProps) {
  const { linkTo } = usePlatform();
  const target = vocTarget(to);
  if (target === null) return <UnlinkedLink to={to} {...rest}>{children}</UnlinkedLink>;
  return <PlatformLink href={linkTo(target.menuId, { params: target.params, returnTo: true })} {...rest}>{children}</PlatformLink>;
}
