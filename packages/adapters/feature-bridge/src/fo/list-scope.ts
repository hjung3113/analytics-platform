import { usePlatform } from '@ap/kernel';
import { scopeSwitchClears } from '@ap/feature-screens/global-screens/core';
import { isUuid } from './uuid';

const SCOPE_KEY = 'managedSystem';

/**
 * The `managedSystem` list scope of the current menu as the one `목록 범위` picker reads and writes it (ADR-0081 decision 4): the page key in, the choice out.
 * The sidebar picker and a page-owned picker (내 Task) both use it, so there is one scope state — the URL — and one switch rule.
 * A value that is not a uuid is rejected on the page and never reaches the picker as a selection; a choice is a replace, so a scope change is not a history step.
 */
export function useListScope(): { value: string | undefined; change: (id: string | undefined) => void } {
  const { pageParam, setPage, route } = usePlatform();
  const raw = pageParam(SCOPE_KEY);
  const value = raw !== null && isUuid(raw) ? raw : undefined;
  // The rule is FO's own (`scopeSwitchClears`, one for both hosts): a specific system drops the Analytics Area filter (unless `unset`), and a cursor the menu declares is bound to scope.
  const change = (id: string | undefined) => {
    const declares = (key: string) => route?.menu.pageKeys.includes(key) === true;
    const clears = scopeSwitchClears({
      nextSystem: id,
      area: pageParam('area') ?? undefined,
      declaresArea: declares('area'),
      declaresCursor: declares('cursor'),
    });
    const patch: Record<string, string | null> = { [SCOPE_KEY]: id ?? null };
    if (clears.area) patch['area'] = null;
    if (clears.cursor) patch['cursor'] = null;
    setPage(patch, { replace: true });
  };
  return { value, change };
}
