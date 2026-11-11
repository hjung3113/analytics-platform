/** @ap/menu-topview — the Top View viewer group: Top View and Focus (EV ADR-0012). Manifest only: the screens are lazy, so `@eqv/*` stays out of this import graph. */
import { lazy } from 'react';
import { Map as MapIcon, Radar } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { PlatformMenuEntry } from '@ap/kernel';
import { EQV_MAX_WINDOW_HOURS } from './limits.js';
import { VIEW_PERMISSION } from './endpoints.js';

const GROUP = groupId('topview');

/**
 * Read-only screens (EV ADR-0012 first scope). `eqv:topview` is the group's primary screen and `eqv:focus` its child. The equipment id
 * travels as the page key `equipment` (`?equipment=`), not a route param: the Registry rejects a parent whose route needs params.
 * `aliases` keep the links of the former host-module mount (`/tools/topview`, `/tools/topview/focus`). `requiresScope: false`: an
 * equipment is addressed by that page key, not by a Scope selection; the endpoints re-check access on the server.
 */
export const manifests: PlatformMenuEntry[] = [
  {
    id: 'eqv:topview', primary: true, group: GROUP,
    label: { ko: '설비 Top View', en: 'Equipment Top View' },
    description: { ko: '설비 구성요소 배치와 재생 시점의 자재 위치를 보여줍니다.', en: 'Shows the equipment layout and where material sits at the replay cursor.' },
    path: '/tools/eqv-topview', aliases: ['/tools/topview'], icon: MapIcon, permission: VIEW_PERMISSION,
    requiresScope: false,
    // The board is drawn for the applied time window (topview-context / topview-events are time-projected).
    context: contextCapabilities({ time: 'apply' }), defaultPeriodHours: EQV_MAX_WINDOW_HOURS,
    pageType: 'overview', features: NO_FEATURES, pageKeys: ['equipment'],
    component: lazy(() => import('./screens/TopViewScreen.js').then(m => ({ default: m.TopViewScreen }))),
  },
  {
    id: 'eqv:focus', group: GROUP, parent: 'eqv:topview',
    label: { ko: 'Focus', en: 'Focus' },
    description: { ko: 'Top View, Gantt, Occurrence 목록을 하나의 커서로 함께 재생합니다.', en: 'Replays the Top View, Gantt and Occurrence list on one shared cursor.' },
    path: '/tools/eqv-focus', aliases: ['/tools/topview/focus'], icon: Radar, permission: VIEW_PERMISSION,
    requiresScope: false,
    context: contextCapabilities({ time: 'apply' }), defaultPeriodHours: EQV_MAX_WINDOW_HOURS,
    pageType: 'analysis', features: NO_FEATURES,
    // `equipment` selects the equipment; the entityType/anchor pair survives navigation on this route; rangeFrom/rangeTo hold the
    // applied 재생 구간 so a refresh or a copied link reopens it.
    pageKeys: ['equipment', 'entityType', 'anchor', 'rangeFrom', 'rangeTo'],
    component: lazy(() => import('./screens/FocusScreen.js').then(m => ({ default: m.FocusScreen }))),
  },
];
