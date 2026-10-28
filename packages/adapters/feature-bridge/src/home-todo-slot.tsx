import { lazy, Suspense } from 'react';
import type { HomeTodoSlot } from '@ap/kernel';
import { useFoSession } from './fo/session';

// The page (and with it the FeedbackOps panel and its data hooks) loads only once the FeedbackOps session is ready, so none of it is in the main chunk.
const HomeTodo = lazy(() => import('./pages/HomeTodo'));

/**
 * Renders nothing unless the FeedbackOps session is `ready`: on mock, while pending and after a 401 the home shows no `내 할 일` and no `실서버 필요`,
 * and the page chunk is never requested (ADR-0070 decision 5, 8). The gate unmounts the page in the same commit the session leaves `ready`.
 */
function Todo() {
  const session = useFoSession();
  if (session.status !== 'ready') return null;
  return <Suspense fallback={null}><HomeTodo /></Suspense>;
}

/** The home `내 할 일` section (ADR-0070 decision 8, #657). Only `apps/platform-web/src/main.tsx` imports this. */
export const homeTodoSlot: HomeTodoSlot = { Todo };
