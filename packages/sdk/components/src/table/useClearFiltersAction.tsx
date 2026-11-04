import { useI18n, usePlatform } from '@ap/kernel';
import { Button } from '@ap/ui';

export type ClearFiltersActionOptions = {
  filterKey: string;
  /** The page decides whether conditions or extra page values exist. */
  hasFilters: boolean;
  extraKeys?: readonly string[];
};

/** Empty-state action: clear the declared filter, page and extra keys in one navigation. */
export function useClearFiltersAction({ filterKey, hasFilters, extraKeys = [] }: ClearFiltersActionOptions) {
  const { t } = useI18n();
  const { setPage } = usePlatform();
  return hasFilters ? <Button type="button" size="sm" variant="secondary" onClick={() => setPage(Object.fromEntries([filterKey, 'page', ...extraKeys].map(key => [key, null])))}>{t('clearFilters')}</Button> : null;
}
