/** Fixtures shared by the Surveys page tests. */
import { ClipboardCheck } from 'lucide-react';
import { createFoMenuHarness } from '@ap/fo-bridge/testing';
import { manifests } from './index';

export const { registry, mountAt } = createFoMenuHarness({ manifests, homeMenuId: 'fo-surveys', group: { id: 'foSurveys', label: { ko: 'Surveys', en: 'Surveys' }, icon: ClipboardCheck } });

/**
 * Loads the lazy page modules (and the FeedbackOps screens behind them) before a file's first mount: a cold import can take
 * seconds on CI, which would otherwise count against the first test's `findBy` wait.
 */
export const warmPages = () => Promise.all([import('./pages/FoSurveys'), import('./pages/FoSurveyBuilder'), import('./pages/FoSurveyResults'), import('./pages/FoSurveyFollowUp')]);
