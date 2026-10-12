import type { LinkOptions } from '@ap/kernel';
import type { CatalogRow } from '../endpoints';

/** All catalog entry points carry the complete origin URL, including search and table state. */
export function metricDetailHref(
  linkTo: (menuId: string, options?: LinkOptions) => string,
  row: CatalogRow,
  version = row.publishedPointer ?? row.catalogVersion,
): string {
  return linkTo('metric-detail', { params: { metricId: row.metricId }, page: { version }, returnTo: true });
}
