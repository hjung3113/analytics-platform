import { FoScreenPage, coverageRoute, useCoverageHere, useCoverageSearch } from '@ap/fo-bridge';
import { CoverageScreen } from '@fops/frontend/operator-screens/coverage';
import { isIntegrationCoverageSearchValueValid } from '@fops/frontend/operator-screens/integration-search';

/** 커버리지 (ADR-0081, #762): FeedbackOps' coverage report through the bridge; `view` is its tab, there is no detail. Its `/admin/settings#coverage` hop opens the FeedbackOps 설정 menu (#764 p2). `managedSystem` is a UUID or `all`. */
export default function FoCoverage() {
  return <FoScreenPage route={coverageRoute} isValid={isIntegrationCoverageSearchValueValid} useSearch={useCoverageSearch} useHere={useCoverageHere}><CoverageScreen /></FoScreenPage>;
}
