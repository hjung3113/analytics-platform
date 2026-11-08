/** @ap/menu-log-rules — read-only Validator snapshot and spec coverage (ADR-0122, #1495). Screens stay lazy. */
import { lazy } from 'react';
import { Database, Ruler } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

const pageKeys = ['ruleSetKey', 'ruleKey', 'modelId', 'softwareId', 'tab', 'q', 'filter', 'sort', 'page', 'focus'];
export const manifests: MenuEntry[] = [
  {
    id: 'log-rules', primary: true, group: groupId('logRules'), label: { ko: '검증 규칙', en: 'Validation rules' },
    description: { ko: 'Validator가 보고한 규칙과 명세 요구사항의 선언 구성을 봅니다', en: 'Read Validator rules and declared specification coverage' },
    path: '/log/rules', icon: Ruler, permission: 'platform:view', requiresScope: false, pageType: 'catalog',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys, repeatedPageKeys: ['filter'], hiddenPageKeys: ['filter'], contextResetKeys: ['page'],
    component: lazy(() => import('./pages/RulesScreen')),
  },
  {
    id: 'log-rule', parent: 'log-rules', navHidden: true, group: groupId('logRules'), label: { ko: '검증 규칙', en: 'Validation rule' },
    description: { ko: '규칙의 대상 범위 선언과 Revision별 지원 정보를 봅니다', en: 'Read declared targets and support by Revision' },
    path: '/log/rules/:ruleSetKey/:ruleKey', icon: Ruler, permission: 'platform:view', requiresScope: false, pageType: 'catalog',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys, repeatedPageKeys: ['filter'], hiddenPageKeys: ['filter'], contextResetKeys: ['page'],
    component: lazy(() => import('./pages/RulesScreen')),
  },
  {
    id: 'log-datasets', group: groupId('logRules'), label: { ko: '테스트 데이터셋', en: 'Test datasets' },
    description: { ko: '반복 검증에 쓰는 샘플 목록과 기대 결과를 관리합니다.', en: 'Reusable samples, approved expectations and regression comparisons' },
    path: '/log/datasets', icon: Database, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [], component: lazy(() => import('./pages/DatasetsPage')),
  },
  ...[
    { id: 'log-dataset', path: '/log/datasets/:datasetId' },
    { id: 'log-dataset-run', path: '/log/datasets/:datasetId/regression-runs/:suiteRunId' },
  ].map(({ id, path }): MenuEntry => ({
    id, path, parent: 'log-datasets', navHidden: true, group: groupId('logRules'), label: id === 'log-dataset-run' ? { ko: '회귀 실행 비교', en: 'Regression run comparison' } : { ko: '테스트 데이터셋 상세', en: 'Test dataset detail' },
    description: { ko: 'Revision·Baseline·회귀 실행·비교', en: 'Revision, baseline, regression runs and comparison' },
    icon: Database, permission: 'platform:view', requiresScope: false, pageType: 'management', context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: [], component: lazy(() => import('./pages/DatasetsPage')),
  })),
];
