// Mock half of the sample read: the kit's mock assembly registers this list. Pages never import it.
// The server half is the in-house data server's (ADR-0146); this file is not shipped to production.
import { DEFAULT_RANGE_TO, defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';
import { sampleEndpoint } from './endpoints';
import { MENU_ID } from './menu';

/** 합성 시계열의 기준 시각(#1864): mock 서버의 기본 기간 끝 DEFAULT_RANGE_TO. 이 시각에서 몇 시간 앞인 행을 만든다. */
const hoursBeforeAnchor = (hours: number): string => {
  const at = new Date(DEFAULT_RANGE_TO);
  at.setHours(at.getHours() - hours);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
};

export const mockEndpoints: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(sampleEndpoint, {
    mart: false,
    handle: () => [
      { name: `${MENU_ID} row A`, at: hoursBeforeAnchor(1), value: 1 },
      { name: `${MENU_ID} row B`, at: hoursBeforeAnchor(2), value: 2 },
    ],
  }),
];
