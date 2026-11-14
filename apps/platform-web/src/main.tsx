import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './style.css';
import { startAppHost } from '@ap/app-host';
import { accessRequestSlot } from '@ap/feature-bridge/access-request-slot';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { homeTodoSlot } from '@ap/feature-bridge/home-todo-slot';
import { navCountsSlot } from '@ap/feature-bridge/nav-counts';
import { notificationsSlot } from '@ap/feature-bridge/notifications-slot';
import { savedViewsSlot } from '@ap/feature-bridge/saved-views';
import { scopeControlSlot } from '@ap/feature-bridge/scope-control';
import { vocComposeSlot } from '@ap/feature-bridge/voc-compose-slot';
import { improvementAnalysisActions } from '@ap/menu-improvement-items/analysis-actions';
import { improvementHomeTodoSlot } from '@ap/menu-improvement-items/home-todo-slot';
import { RoundSourceView } from '@ap/menu-log-analysis/view';
import { setModelTopView } from '@ap/menu-log-knowledge/model-topview-slot';
import { setRoundSourceView } from '@ap/menu-log-models/round-source-slot';
import { ModelTopView } from '@ap/menu-topview/model-topview';
import { createAssembly } from '#platform-assembly';
import { EQUIPMENT_AXES } from './equipmentAxes';
import { managedSystemFor, useComposeDefaultStatus } from './feature-systems';
import { createLocalQueryHistoryStore } from './query-history-store';
import { makeAppSlots } from './slots';
import { declarations, SPACE_ID_MIGRATIONS } from './menus';
import { SpaceSystemsSession } from './space-systems-session';

// The build picks the assembly (#153, ADR-0009): mock + DevTools in dev/--mode mock, the real adapter in production.
// The Host owns the start: it builds the Registry from the app's declarations, asks the assembly for the outcome and
// mounts it — a `redirect` (login) or a replacement screen (server unavailable) instead of the app, or the app itself
// under PlatformProvider; a rejected start renders the fixed failure screen.
// Consumer contributions share the existing Kernel slot; the home menu knows neither package.
const homeTodo = { Todo: () => <><improvementHomeTodoSlot.Todo /><homeTodoSlot.Todo /></> };
// One slot object for the page's lifetime: its `Compose` component must keep its identity so a held draft does not remount.
const vocCompose = vocComposeSlot(managedSystemFor, useComposeDefaultStatus);
const useAppSlots = makeAppSlots({ notifications: notificationsSlot, vocCompose, homeTodo, scopeControl: scopeControlSlot, navCounts: navCountsSlot, spaceNavSection: savedViewsSlot, analysisActions: improvementAnalysisActions, accessRequest: accessRequestSlot });

void startAppHost({
  container: document.getElementById('root')!,
  declarations,
  createAssembly,
  basePath: import.meta.env.BASE_URL,
  spaceIdMigrations: SPACE_ID_MIGRATIONS,
  equipmentAxes: EQUIPMENT_AXES,
  productName: 'Analytics Platform',
  queryHistory: createLocalQueryHistoryStore(),
  slots: useAppSlots,
  onAssembly: (assembly) => {
    // The bridge screens' feature API comes from the assembly (ADR-0071); mock builds have none → "실서버 필요".
    setFeatureApi(assembly.featureApi ?? null);
    // The Round detail's «원본/시퀀스» tab: the app joins the two log menus here, they never import each other (#1475).
    setRoundSourceView(RoundSourceView);
    // The model profile's Top View: EV's read-only body joins the Hub's slot here, the menu never imports the viewer (#1656).
    setModelTopView(ModelTopView);
  },
  children: (assembly) => <SpaceSystemsSession source={assembly.spaceSystems ?? null} />,
});
