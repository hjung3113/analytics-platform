import { FeatureScreenPage, coverageRoute, useCoverageHere, useCoverageSearch } from '@ap/feature-bridge';
import { CoverageScreen } from '@ap/feature-screens/operator-screens/coverage';
import { isIntegrationCoverageSearchValueValid } from '@ap/feature-screens/operator-screens/integration-search';

/** 커버리지 (ADR-0081, #762): the feature screens' coverage report through the bridge; `view` is its tab, there is no detail. Its `/admin/settings#coverage` hop opens the 기능 설정 menu (#764 p2). `managedSystem` is a UUID or `all`. */
export default function FeatureCoverage() {
  return <FeatureScreenPage route={coverageRoute} isValid={isIntegrationCoverageSearchValueValid} useSearch={useCoverageSearch} useHere={useCoverageHere}><CoverageScreen /></FeatureScreenPage>;
}
