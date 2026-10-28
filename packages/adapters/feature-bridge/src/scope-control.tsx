import { lazy, Suspense, type ComponentType } from 'react';
import { ChevronDown } from 'lucide-react';
import { spaceId } from '@ap/contracts';
import { usePlatform, type ScopeControlSlot } from '@ap/kernel';
import { Button } from '@ap/ui';
import { featureApi } from './feature-api';
import { useFeatureSession } from './fo/session';

const FEEDBACKOPS = spaceId('feedbackops');
const SCOPE_KEY = 'managedSystem';

// The picker and its reads load only once the FeedbackOps session is ready, so none of it is in the main chunk.
const ScopeControl = lazy(() => import('./pages/ScopeControl'));

/** Mock preview (no FeedbackOps API): the label and an inert `전체` so the sidebar keeps its place; nothing from FeedbackOps mounts or is requested. */
function MockScope() {
  return <div className="border-b border-border-subtle p-2">
    <div className="px-1 pb-1 text-caption text-text-muted">목록 범위</div>
    <Button type="button" variant="outline" size="sm" disabled title="실서버 필요" aria-description="실서버 필요" className="w-full justify-between">
      <span>전체</span><ChevronDown className="size-3.5" aria-hidden />
    </Button>
  </div>;
}

/**
 * The FeedbackOps sidebar `목록 범위` (ADR-0081 decision 4). It shows only on a menu that registers the `managedSystem` page key (on a global
 * route the sidebar may still draw the remembered space; nothing is drawn there), and renders nothing while the session is pending or retired.
 */
function Control({ collapsed }: { collapsed: boolean }) {
  const { route } = usePlatform();
  const session = useFeatureSession();
  if (!route?.menu.pageKeys.includes(SCOPE_KEY)) return null;
  if (featureApi() === null) return collapsed ? null : <MockScope />;
  if (session.status !== 'ready') return null;
  return <Suspense fallback={null}><ScopeControl collapsed={collapsed} /></Suspense>;
}

/** One component for the page's lifetime: a new one per `For` call would remount the sidebar picker on every render. */
const CONTROL: ComponentType<{ collapsed: boolean }> = Control;

/** The sidebar list-scope slot for the FeedbackOps space (ADR-0081 decision 4, #759). Only `apps/platform-web/src/main.tsx` imports this. */
export const scopeControlSlot: ScopeControlSlot = { For: id => id === FEEDBACKOPS ? CONTROL : null };
