/** Fixtures shared by the 연동 page tests. */
import { Boxes } from 'lucide-react';
import { createFoMenuHarness } from '@ap/feature-bridge/testing';
import { manifests } from './index';

export const { registry, mountAt } = createFoMenuHarness({ manifests, homeMenuId: 'fo-integration', group: { id: 'foIntegration', label: { ko: '연동', en: 'Integration' }, icon: Boxes } });

/**
 * Loads the lazy page modules (and the FeedbackOps screens behind them) before a file's first mount: a cold import can take
 * seconds on CI, which would otherwise count against the first test's `findBy` wait.
 */
export const warmPages = () => Promise.all([import('./pages/FoIntegration'), import('./pages/FoEvidence'), import('./pages/FoCoverage'), import('./pages/FoEntityLinks')]);
