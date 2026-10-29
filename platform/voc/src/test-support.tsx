/** Fixtures shared by the 수신함 and Triage page tests. */
import { Inbox } from 'lucide-react';
import { createFeatureMenuHarness } from '@ap/feature-bridge/testing';
import { manifests } from './index';

export const { registry, mountAt } = createFeatureMenuHarness({ manifests, homeMenuId: 'inbox', group: { id: 'voc', label: { ko: 'VOC', en: 'VOC' }, icon: Inbox } });

/**
 * Loads the lazy page modules (and the FeedbackOps screens behind them) before a file's first mount: a cold import can take
 * seconds on CI, which would otherwise count against the first test's `findBy` wait.
 */
export const warmPages = () => Promise.all([import('./pages/FoInbox'), import('./pages/FoTriage'), import('./pages/FoClusters')]);
