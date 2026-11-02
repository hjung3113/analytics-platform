/**
 * @ap/menu-log-knowledge — logKnowledge group manifests (표준 로그 개발 — 로그 지식 허브, #1193, ADR-0107).
 * The catalog screen is #1194 (variant A: tabs + right drawer); the server reads are `logKnowledge.*` (apps/platform-api).
 */
import { lazy } from 'react';
import { BookOpen, Boxes, Cpu, FileText } from 'lucide-react';
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
  // PROTOTYPE (#1197 / #1108, throwaway branch, never merged): four `?variant=A|B|C` screens on a synthetic in-component fixture.
  {
    id: 'log-knowledge-models', group: groupId('logKnowledge'), label: { ko: '모델 탐색', en: 'Models' },
    description: { ko: '제조사·공정별 모델과 SW 버전을 조회합니다', en: 'Models and software versions by vendor and process' },
    path: '/log/knowledge/models', icon: Boxes, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['variant', 'q', 'filter', 'sort', 'page', 'node', 'model', 'sw'], repeatedPageKeys: ['filter'], hiddenPageKeys: ['filter'], contextResetKeys: ['page'],
    component: lazy(() => import('./prototype/ModelsExplorer')),
  },
  {
    id: 'log-knowledge-model', group: groupId('logKnowledge'), parent: 'log-knowledge-models', navHidden: true, label: { ko: '모델 공통 프로파일', en: 'Model profile' },
    description: { ko: '모델 요약, SW 버전, 모델 공통 Item', en: 'Model summary, software versions and model-owned items' },
    path: '/log/knowledge/models/:modelId', icon: Cpu, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['variant', 'tab', 'drawer'],
    component: lazy(() => import('./prototype/ModelProfile')),
  },
  {
    id: 'log-knowledge-items', group: groupId('logKnowledge'), label: { ko: '전체 기술 Item', en: 'Knowledge items' },
    description: { ko: '모든 Model·SW 버전의 기술 Item을 찾습니다', en: 'Knowledge items of every model and software version' },
    path: '/log/knowledge/items', icon: FileText, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['variant', 'q', 'filter', 'sort', 'page', 'preview', 'drawer'], repeatedPageKeys: ['filter'], hiddenPageKeys: ['filter'], contextResetKeys: ['page'],
    component: lazy(() => import('./prototype/ItemsList')),
  },
  {
    id: 'log-knowledge-item', group: groupId('logKnowledge'), parent: 'log-knowledge-items', navHidden: true, label: { ko: 'Item 상세', en: 'Item detail' },
    description: { ko: '관찰 사실·기대 기준·분석 의견·개선 방향과 근거, 판단 변경 이력', en: 'Facts, baseline, analysis, improvement, evidence and assessment history' },
    path: '/log/knowledge/items/:itemId', icon: FileText, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['variant', 'tab', 'drawer'],
    component: lazy(() => import('./prototype/ItemDetail')),
  },
];
