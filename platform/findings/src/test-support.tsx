/** Fixtures shared by the Findings page tests. */
import { ListChecks } from 'lucide-react';
import { createFeatureMenuHarness } from '@ap/feature-bridge/testing';
import { manifests } from './index';

export const { registry, mountAt } = createFeatureMenuHarness({ manifests, homeMenuId: 'findings', group: { id: 'findings', label: { ko: 'Finding', en: 'Finding' }, icon: ListChecks } });

/**
 * Loads the lazy page modules (and the feature screens behind them) before a file's first mount: a cold import can take
 * seconds on CI, which would otherwise count against the first test's `findBy` wait.
 */
export const warmPages = () => Promise.all([import('./pages/FeatureFindings'), import('./pages/FeatureEvidence')]);
