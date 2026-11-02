/**
 * @ap/menu-log-knowledge — logKnowledge group manifests (표준 로그 개발 — 로그 지식 허브, #1193, ADR-0107).
 * Planned menu only: the catalog screen is #1194, the server reads are `logKnowledge.*` (apps/platform-api).
 */
import { BookOpen } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

export const manifests: MenuEntry[] = [
  {
    id: 'log-knowledge-catalog', primary: true, group: groupId('logKnowledge'), label: { ko: '카탈로그 관리', en: 'Catalog' },
    description: { ko: 'Vendor·공정·장비 모델·SW 버전 기준 목록 (예정)', en: 'Reference lists of vendors, processes, equipment models and software versions (planned)' },
    path: '/log/knowledge/catalog', icon: BookOpen, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
  },
];
