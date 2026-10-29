/** Fixtures shared by the Surveys page tests. */
import { ClipboardCheck } from 'lucide-react';
import { createFeatureMenuHarness } from '@ap/feature-bridge/testing';
import { manifests } from './index';

export const { registry, mountAt } = createFeatureMenuHarness({ manifests, homeMenuId: 'survey-management', group: { id: 'surveys', label: { ko: 'Surveys', en: 'Surveys' }, icon: ClipboardCheck } });

/**
 * Loads the lazy page modules (and the feature screens behind them) before a file's first mount: a cold import can take
 * seconds on CI, which would otherwise count against the first test's `findBy` wait.
 */
export const warmPages = () => Promise.all([import('./pages/FeatureSurveys'), import('./pages/FeatureSurveyBuilder'), import('./pages/FeatureSurveyResults'), import('./pages/FeatureSurveyFollowUp')]);
