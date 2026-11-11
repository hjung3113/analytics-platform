/** @ap/menu-topview-studio — the Top View authoring group: Layouts (#1654) and 설비 온보딩 (#1658). Manifest only: the screens are lazy, so `@eqv/*` stays out of this import graph. */
import { lazy } from 'react';
import { ClipboardList, PenTool } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { PlatformMenuEntry } from '@ap/kernel';
import { STUDIO_VIEW_PERMISSION } from './endpoints';

/** URL page keys: the open Layout, Revision (`sha256:<64 hex>`) and EV Template. Component selection stays out of the address. */
export const PAGE_KEYS = ['layout', 'revision', 'template'] as const;

/** 설비 온보딩 page keys: no `equipment` is the Fleet; `step` is the open tab; `window` the selected Sample Window (64 hex). Dialogs stay out of the address. */
export const ONBOARDING_PAGE_KEYS = ['equipment', 'step', 'window'] as const;

export const manifests: PlatformMenuEntry[] = [
  {
    id: 'eqv-studio', primary: true, group: groupId('topviewStudio'),
    label: { ko: '레이아웃', en: 'Layouts' },
    description: { ko: 'Layout을 편집하고 Revision으로 게시하며 EV Template으로 승격합니다.', en: 'Edit a Layout, publish it as a Revision and promote it to an EV Template.' },
    path: '/tools/eqv-studio', icon: PenTool, permission: STUDIO_VIEW_PERMISSION,
    requiresScope: false,
    context: contextCapabilities({ time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported' }),
    pageType: 'catalog', features: NO_FEATURES, pageKeys: [...PAGE_KEYS],
    component: lazy(() => import('./pages/EqvStudio')),
  },
  {
    id: 'eqv-onboarding', group: groupId('topviewStudio'),
    label: { ko: '설비 온보딩', en: 'Equipment onboarding' },
    description: { ko: '설비 alias를 Layout Component에 매핑하고 게시합니다.', en: 'Map equipment aliases to Layout Components and publish.' },
    path: '/tools/eqv-onboarding', icon: ClipboardList, permission: STUDIO_VIEW_PERMISSION,
    requiresScope: false,
    context: contextCapabilities({ time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported' }),
    pageType: 'management', features: NO_FEATURES, pageKeys: [...ONBOARDING_PAGE_KEYS],
    component: lazy(() => import('./pages/onboarding/EqvOnboarding')),
  },
];
