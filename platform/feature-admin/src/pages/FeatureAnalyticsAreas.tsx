import { FeatureDetailDrawer, FeatureScreenPage, analyticsAreasRoute, useAnalyticsAreasHere, useAnalyticsAreasSearch } from '@ap/feature-bridge';
import { AnalyticsAreasAdminPage, type AnalyticsAreasScreenProps } from '@ap/feature-screens/operator-screens/analytics-areas';
import { isAnalyticsAreasSearchValueValid } from '@ap/feature-screens/operator-screens/admin-search';

/** The screen owns the selected Analytics Area and its close (`focus` is its `selected`), so the drawer's close is `requestClose`. */
const renderDetail: NonNullable<AnalyticsAreasScreenProps['renderDetail']> = parts => <FeatureDetailDrawer parts={parts} onClose={parts.requestClose} />;

/**
 * Analytics Area (ADR-0081, #764 p2): the Analytics Area tree through the bridge, the detail in the shell detail slot. `system` is the screen's own Managed System filter (a UUID), not the carried 목록 범위;
 * `focus` is the selected area (a UUID) and `includeArchived` is `true`.
 */
export default function FeatureAnalyticsAreas() {
  return <FeatureScreenPage route={analyticsAreasRoute} isValid={isAnalyticsAreasSearchValueValid} useSearch={useAnalyticsAreasSearch} useHere={useAnalyticsAreasHere}><AnalyticsAreasAdminPage renderDetail={renderDetail} titleInHeader /></FeatureScreenPage>;
}
