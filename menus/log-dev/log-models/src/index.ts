/**
 * @ap/menu-log-models — logModels group manifests (표준 로그 개발 — 모델, #252, ADR-0065).
 * Result-first Round workbench (#1809), lifecycle tables and validation requests (#1447).
 */
import { lazy } from 'react';
import { Cpu, ListChecks } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';
import { ModelHierarchySource, modelHierarchyCurrentNode, modelHierarchyIcon } from './hierarchy';

export const manifests: MenuEntry[] = [
  {
    id: 'log-models', primary: true, group: groupId('logModels'), label: { ko: '모델 목록', en: 'Models' },
    description: { ko: '설비 모델별 개발 단계·검증 Round·Gate 결정', en: 'Development stages, validation rounds and human Gate decisions' },
    path: '/log/models', icon: Cpu, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['q', 'stage', 'validation', 'vendorId', 'processId', 'modelId', 'active', 'page', 'sort'],
    navTree: { label: { ko: '모델 계층', en: 'Model hierarchy' }, mode: 'tree', Source: ModelHierarchySource, levelIcon: modelHierarchyIcon, currentNodeId: modelHierarchyCurrentNode },
    component: lazy(() => import('./pages/LifecyclePage')),
  },
  {
    id: 'log-model-project', parent: 'log-models', navHidden: true, group: groupId('logModels'), label: { ko: '개발 건 상세', en: '개발 건 상세' },
    description: { ko: '모델 개발 단계·Round·변경 이력', en: 'Model development stages, rounds and change history' }, path: '/log/models/:projectId', icon: Cpu, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['node', 'tab', 'page', 'requestsPage', 'rulesPage', 'request', 'attempt', 'result', 'required', 'sort'],
    component: lazy(() => import('./pages/LifecyclePage')),
  },
  {
    id: 'log-model-round', parent: 'log-models', navHidden: true, group: groupId('logModels'), label: { ko: 'Round 상세', en: 'Round 상세' },
    description: { ko: '샘플·검증 결과와 사람의 Gate 결정', en: 'Samples, validation results and human Gate decisions' }, path: '/log/models/:projectId/rounds/:roundId', icon: Cpu, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['node', 'tab', 'page', 'requestsPage', 'rulesPage', 'request', 'attempt', 'result', 'required', 'sort', 'rule', 'issue', 'view', 'sourceTab', 'sourceFocus', 'sourceDrawer'],
    component: lazy(() => import('./pages/LifecyclePage')),
  },
  {
    id: 'log-validation-requests', group: groupId('logModels'), label: { ko: '검증 요청', en: 'Validation requests' },
    description: { ko: 'Round 검증 요청·시도·결과와 취소 이력', en: 'Round validation requests, attempts and results' },
    path: '/log/validation-requests', icon: ListChecks, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['request', 'state', 'page', 'priority', 'modelId', 'requestedFrom', 'requestedTo'],
    component: lazy(() => import('./pages/LifecyclePage')),
  },
];
