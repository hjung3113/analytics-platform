/** Fixtures for the 시스템 page tests. */
import { Server } from 'lucide-react';
import { createFeatureMenuHarness } from '@ap/feature-bridge/testing';
import { manifests } from './index';

/** The session holds `console:access` (an admin); the one menu is the space's home. */
export const { registry, mountAt } = createFeatureMenuHarness({
  manifests, homeMenuId: 'systems', group: { id: 'systems', label: { ko: '시스템', en: 'Systems' }, icon: Server },
  permissions: ['platform:view', 'console:access'], space: { id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' } },
});

/** Loads the lazy page module before a file's first mount, so a cold import does not count against the first `findBy` wait. */
export const warmPages = () => import('./pages/Systems');
