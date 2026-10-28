/** Fixtures shared by the Findings page tests. */
import { ListChecks } from 'lucide-react';
import { createFoMenuHarness } from '@ap/feature-bridge/testing';
import { manifests } from './index';

export const { registry, mountAt } = createFoMenuHarness({ manifests, homeMenuId: 'fo-findings', group: { id: 'foFindings', label: { ko: 'Findings', en: 'Findings' }, icon: ListChecks } });

/**
 * Loads the lazy page modules (and the FeedbackOps screens behind them) before a file's first mount: a cold import can take
 * seconds on CI, which would otherwise count against the first test's `findBy` wait.
 */
export const warmPages = () => Promise.all([import('./pages/FoFindings')]);
