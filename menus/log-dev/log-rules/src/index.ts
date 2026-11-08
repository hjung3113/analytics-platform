/** @ap/menu-log-rules — read-only Validator snapshot and spec coverage (ADR-0122, #1495). Screens stay lazy. */
import { lazy } from 'react';
import { Ruler } from 'lucide-react';
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
];
