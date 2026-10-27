import { usePlatform } from '@ap/kernel';
import { FoScreenPage, settingsRoute, useSettingsHere, useSettingsSearch } from '@ap/fo-bridge';
import { WorkspaceSettingsScreen } from '@fops/frontend/operator-screens/settings';

/** The route table accepts `section=coverage` only (the `#coverage` fragment), so the check has nothing more to refuse. */
const acceptsAll = () => true;

/** FeedbackOps 설정 (ADR-0081, #764 p2): the workspace settings through the bridge; `section=coverage` scrolls to the coverage thresholds (what FeedbackOps' `#coverage` link means). */
export default function FoSettings() {
  const { pageParam } = usePlatform();
  return <FoScreenPage route={settingsRoute} isValid={acceptsAll} useSearch={useSettingsSearch} useHere={useSettingsHere}><WorkspaceSettingsScreen section={pageParam('section')} /></FoScreenPage>;
}
