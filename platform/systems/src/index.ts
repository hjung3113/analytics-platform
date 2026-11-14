/**
 * @ap/menu-systems — systems group (운영 콘솔 space 시스템; #1289 node j, ADR-0110 decision 5).
 * One read-only menu: which tracked system (Managed System) each business system is registered for, whether that link is still declared, the 「플랫폼」 system, and
 * systems registered by hand outside the platform. The data comes through the feature bridge (`GET /managed-systems/space-links` and `GET /managed-systems`), so the
 * screen needs a real server (mock preview shows 실서버 필요). `console:access` only: the link is navigation metadata and grants nothing (ADR-0068 decision 1); the server decides each read.
 */
import { lazy } from 'react';
import { Server } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { PlatformMenuEntry } from '@ap/kernel';

export const manifests: PlatformMenuEntry[] = [
  {
    id: 'systems', primary: true, group: groupId('systems'),
    label: { ko: '시스템', en: 'Systems' },
    description: { ko: '업무 시스템별 추적 시스템 연결 · 연결 상태', en: 'Tracked system links by business system · Link status' },
    path: '/operations/systems', icon: Server, permission: 'console:access',
    requiresScope: false, context: contextCapabilities(), pageType: 'catalog', features: NO_FEATURES, pageKeys: [],
    component: lazy(() => import('./pages/Systems')),
  },
];
