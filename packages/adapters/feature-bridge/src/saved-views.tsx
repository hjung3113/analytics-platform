import { lazy, Suspense, type ComponentType } from 'react';
import { useI18n, type SpaceNavSectionSlot } from '@ap/kernel';
import { featureApi } from './feature-api';
import { useFeatureSession } from './fo/session';
import { usesSavedViews } from './operator-menus';

// The list, its form and its reads load only once the FeedbackOps session is ready, so none of it is in the main chunk.
const SavedViews = lazy(() => import('./pages/SavedViews'));

function Muted({ text }: { text: string }) {
  return <p className="px-3 py-1 text-xs leading-4 text-text-muted">{text}</p>;
}

/**
 * The body of the FeedbackOps `저장된 보기` section (the shell owns the landmark and heading and draws them on every FeedbackOps menu, so this never renders
 * empty). Outside a ready session it is one muted line (mock: live server required; pending: loading; retired: session lost) and nothing is requested.
 */
function Body() {
  const { lang } = useI18n();
  const session = useFeatureSession();
  const ko = lang === 'ko';
  const loading = <Muted text={ko ? '불러오는 중…' : 'Loading…'} />;
  if (featureApi() === null) return <Muted text={ko ? '실서버 필요' : 'Live server required'} />;
  // The same wording `FeatureBridge` shows when the session is lost.
  if (session.status === 'retired') return <Muted text={ko ? '세션이 만료되었습니다' : 'Your session has expired'} />;
  if (session.status !== 'ready') return loading;
  return <Suspense fallback={loading}><SavedViews /></Suspense>;
}

/** One component for the page's lifetime: a new one per `For` call would remount the section body on every render. */
const BODY: ComponentType = Body;

const SECTION = { label: { ko: '저장된 보기', en: 'Saved views' }, Body: BODY };

/** The FeedbackOps saved VOC views section (06 §8 `spaceNavSection`, #761 p3, #595 4c). Only `apps/platform-web/src/main.tsx` imports this. */
export const savedViewsSlot: SpaceNavSectionSlot = {
  For: (id, menu) => usesSavedViews(id, menu) ? SECTION : null,
};
