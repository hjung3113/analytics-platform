/**
 * Mock server half of the home endpoints (#130). Registered by the app composition root via `@ap/menu-home/mock`;
 * pages never import this module.
 */
import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';
import { noticesEndpoint, type Notice } from '../endpoints';

export const NOTICES: Notice[] = [
  { id: 'N-2026-091', title: { ko: '9/28(일) 02:00–04:00 mart 재계산 작업으로 생산성 지표가 잠정 표시됩니다.', en: 'Sep 28 02:00–04:00: productivity metrics show as provisional during mart recompute.' }, scopeId: 'ICH', until: '2026-09-29T00:00:00' },
  { id: 'N-2026-088', title: { ko: 'CJU PHOTO 설비 마스터 정정 반영 완료 — 지난 7일 값이 달라질 수 있습니다.', en: 'CJU PHOTO master correction applied — the last 7 days may change.' }, scopeId: 'CJU', until: '2026-09-30T00:00:00' },
];

export const homeMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(noticesEndpoint, {
    handle: ({ params }) => NOTICES.filter(n => n.scopeId === params.targetScopeId),
    isEmpty: rows => rows.length === 0,
  }),
];
