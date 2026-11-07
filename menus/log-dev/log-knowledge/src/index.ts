/**
 * @ap/menu-log-knowledge — logKnowledge group manifests (표준 로그 개발 — 로그 지식 허브, #1193, ADR-0107).
 * The catalog screen is #1194 (variant A: tabs + right drawer); the server reads are `logKnowledge.*` (apps/platform-api).
 */
import { lazy } from 'react';
import { BookOpen, Cpu, FileText, ListChecks } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import { CATALOG_MANAGE_PERMISSION } from './endpoints';
import type { MenuEntry } from '@ap/kernel';

export const manifests: MenuEntry[] = [
  {
    id: 'log-knowledge-models', primary: true, group: groupId('logKnowledge'), label: { ko: '모델 탐색', en: 'Models' },
    description: { ko: '설비 모델을 설비사·공정으로 좁혀 찾고 모델 공통 프로파일을 엽니다', en: 'Find equipment models by vendor and process and open the model profile' },
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
    id: 'log-knowledge-spec', parent: 'log-knowledge-models', navHidden: true, group: groupId('logKnowledge'), label: { ko: '모델 명세', en: 'Model specification' },
    description: { ko: '모델 Revision과 SW 실효 명세·변경점·Revision 이력을 확인합니다', en: 'Read model revisions, effective software specifications and changes' },
    path: '/log/knowledge/models/:modelId/spec', icon: FileText, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['software', 'tab', 'drawer', 'change', 'module', 'event', 'review', 'revision', 'returnTo'],
    component: lazy(() => import('./pages/spec/SpecScreen')),
  },
  {
    id: 'log-knowledge-items', group: groupId('logKnowledge'), label: { ko: '전체 기술 Item', en: 'Technical items' },
    description: { ko: '모든 모델·SW 버전의 기술 Item을 유형·검증·처리·발행 상태로 찾습니다', en: 'Find technical items of every model and software version by type, verification, processing and publication state' },
    path: '/log/knowledge/items', icon: ListChecks, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['q', 'filter', 'sort', 'page', 'focus', 'owner'], repeatedPageKeys: ['filter'], hiddenPageKeys: ['filter'], contextResetKeys: ['page'],
    component: lazy(() => import('./pages/items/ItemList')),
  },
  {
    id: 'log-knowledge-item', group: groupId('logKnowledge'), parent: 'log-knowledge-items', navHidden: true, label: { ko: '기술 Item 상세', en: 'Item detail' },
    description: { ko: 'Item 한 건의 본문·근거·연결·리비전·판단 변경 이력을 읽습니다', en: 'Read one item: body, evidence, links, revisions and assessment history' },
    path: '/log/knowledge/items/:itemId', icon: FileText, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['rev', 'returnTo', 'drawer'],
    component: lazy(() => import('./pages/items/ItemDetail')),
  },
  {
    id: 'log-knowledge-catalog', group: groupId('logKnowledge'), label: { ko: '카탈로그 관리', en: 'Catalog' },
    description: { ko: '설비사·공정·모델·SW 버전 기준 목록을 조회하고 관리합니다', en: 'Reference lists of vendors, processes, equipment models and software versions' },
    path: '/log/knowledge/catalog', icon: BookOpen, permission: CATALOG_MANAGE_PERMISSION, requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: { ...NO_FEATURES, export: true }, pageKeys: ['tab', 'q', 'filter', 'sort', 'page', 'focus'], repeatedPageKeys: ['filter'], hiddenPageKeys: ['filter'], contextResetKeys: ['page'],
    component: lazy(() => import('./pages/CatalogManagement')),
  },
];
