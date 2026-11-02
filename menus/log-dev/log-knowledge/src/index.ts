/**
 * @ap/menu-log-knowledge — logKnowledge group manifests (표준 로그 개발 — 로그 지식 허브, #1193, ADR-0107).
 * The catalog screen is #1194 (variant A: tabs + right drawer); the server reads are `logKnowledge.*` (apps/platform-api).
 */
import { lazy } from 'react';
import { BookOpen, Cpu } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import { CATALOG_MANAGE_PERMISSION } from './endpoints';
import type { MenuEntry } from '@ap/kernel';

export const manifests: MenuEntry[] = [
  {
    id: 'log-knowledge-models', primary: true, group: groupId('logKnowledge'), label: { ko: '모델 탐색', en: 'Models' },
    description: { ko: '설비 모델을 제조사·공정으로 좁혀 찾고 모델 공통 프로파일을 엽니다', en: 'Find equipment models by vendor and process and open the model profile' },
    path: '/log/knowledge/models', icon: Cpu, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['q', 'filter', 'sort', 'page'], repeatedPageKeys: ['filter'], hiddenPageKeys: ['filter'], contextResetKeys: ['page'],
    component: lazy(() => import('./pages/models/ModelExplore')),
  },
  {
    id: 'log-knowledge-model', parent: 'log-knowledge-models', navHidden: true, group: groupId('logKnowledge'), label: { ko: '모델 프로파일', en: 'Model profile' },
    description: { ko: '모델의 요약, SW 버전, 모델 공통 Item을 한 화면에서 봅니다', en: 'Summary, software versions and common items of one model' },
    path: '/log/knowledge/models/:modelId', icon: Cpu, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['returnTo'],
    component: lazy(() => import('./pages/models/ModelProfile')),
  },
  {
    id: 'log-knowledge-catalog', group: groupId('logKnowledge'), label: { ko: '카탈로그 관리', en: 'Catalog' },
    description: { ko: '제조사·공정·모델·SW 버전 기준 목록을 조회하고 관리합니다', en: 'Reference lists of vendors, processes, equipment models and software versions' },
    path: '/log/knowledge/catalog', icon: BookOpen, permission: CATALOG_MANAGE_PERMISSION, requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['tab', 'q', 'filter', 'sort', 'page', 'focus'], repeatedPageKeys: ['filter'], hiddenPageKeys: ['filter'], contextResetKeys: ['page'],
    component: lazy(() => import('./pages/CatalogManagement')),
  },
];
