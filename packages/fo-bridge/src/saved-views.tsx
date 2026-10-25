import { lazy, Suspense, type ComponentType } from 'react';
import { spaceId } from '@ap/contracts';
import { useI18n, type SpaceNavSectionSlot } from '@ap/kernel';
import { foApi } from './fo-api';
import { useFoSession } from './fo/session';

const FEEDBACKOPS = spaceId('feedbackops');

// The list, its form and its reads load only once the FeedbackOps session is ready, so none of it is in the main chunk.
const SavedViews = lazy(() => import('./pages/SavedViews'));

function Muted({ text }: { text: string }) {
  return <p className="px-3 py-1 text-xs leading-4 text-text-muted">{text}</p>;
}

/**
 * The body of the FeedbackOps `저장된 보기` section (the shell owns the landmark and heading and draws them on every FeedbackOps menu, so this never renders
 * empty). Without a FeedbackOps API (mock preview) or before the session is ready it is one muted line and nothing is requested.
 */
function Body() {
  const { lang } = useI18n();
  const session = useFoSession();
  const placeholder = <Muted text={lang === 'ko' ? '실서버 필요' : 'Live server required'} />;
  if (foApi() === null || session.status !== 'ready') return placeholder;
  return <Suspense fallback={placeholder}><SavedViews /></Suspense>;
}

/** One component for the page's lifetime: a new one per `For` call would remount the section body on every render. */
const BODY: ComponentType = Body;

/** The FeedbackOps saved VOC views section (06 §8 `spaceNavSection`, #761 p3, #595 4c). Only `apps/platform-web/src/main.tsx` imports this. */
export const savedViewsSlot: SpaceNavSectionSlot = {
  For: id => id === FEEDBACKOPS ? { label: { ko: '저장된 보기', en: 'Saved views' }, Body: BODY } : null,
};
