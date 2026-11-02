/**
 * @ap/menu-log-knowledge — logKnowledge group manifests (표준 로그 개발 — 로그 지식 허브, #1193, ADR-0107).
 * The catalog screen is #1194 (variant A: tabs + right drawer); the server reads are `logKnowledge.*` (apps/platform-api).
 */
import { lazy } from 'react';
import { BookOpen } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import { CATALOG_MANAGE_PERMISSION } from './endpoints';
import type { MenuEntry } from '@ap/kernel';

export const manifests: MenuEntry[] = [
  {
    id: 'log-knowledge-catalog', primary: true, group: groupId('logKnowledge'), label: { ko: '카탈로그 관리', en: 'Catalog' },
    description: { ko: '제조사·공정·모델·SW 버전 기준 목록을 조회하고 관리합니다', en: 'Reference lists of vendors, processes, equipment models and software versions' },
    path: '/log/knowledge/catalog', icon: BookOpen, permission: CATALOG_MANAGE_PERMISSION, requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['tab', 'q', 'filter', 'sort', 'page', 'focus'], repeatedPageKeys: ['filter'], hiddenPageKeys: ['filter'], contextResetKeys: ['page'],
    component: lazy(() => import('./pages/CatalogManagement')),
  },
];
