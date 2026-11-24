import { usePlatform } from '@ap/kernel';
import { FeatureScreenPage, findingsRoute, useFindingsHere, useFindingsSearch, useMenuCapability } from '@ap/feature-bridge';
import { FindingsScreen } from '@ap/feature-screens/operator-screens/findings';
import { isFindingsSearchValueValid } from '@ap/feature-screens/operator-screens/findings-search';
import { FindingDetailDrawer } from './FindingDrawer';

/**
 * 전체 Finding (ADR-0081, #762): the feature Findings list; `focus` opens the Finding detail in the shell detail slot (URL-only selection, nothing auto-selects).
 * A value the feature screens' Findings search schema refuses is rejected (`focus` is its `selected`, a UUID; `managedSystem` a UUID or `all`).
 */
export default function FeatureFindings() {
  const { setPage } = usePlatform();
  const capability = useMenuCapability();
  return <FeatureScreenPage route={findingsRoute} isValid={isFindingsSearchValueValid} useSearch={useFindingsSearch} useHere={useFindingsHere}>
    <FindingsScreen {...(capability === undefined ? {} : { capability })} renderDetailInPlace renderDetail={(id, { isInList, listFocusRef }) => {
      if (id === null) return undefined;
      const closeOptions = isInList === false ? { replace: true } : undefined;
      return <FindingDetailDrawer key={id} findingId={id} isInList={isInList} listFocusRef={listFocusRef} onClose={() => setPage({ focus: null }, closeOptions)} />;
    }} />
  </FeatureScreenPage>;
}
