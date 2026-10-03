// PROTOTYPE (#52) — 버리는 코드, main 병합 금지.
// 디자인 방향 3안(A 현재 / B FeedbackOps 토큰 + 플랫폼 셸 / C FeedbackOps 토큰 + FeedbackOps 셸)을 고르는 상태.
// 앱 CSS·셸·PlatformPage가 함께 본다. 메뉴 이동 때 URL 계약이 모르는 파라미터를 다시 쓰므로 선택은 localStorage에 두고,
// `?variant=`는 진입·공유용으로만 읽는다.
import { useSyncExternalStore } from 'react';

export type ProtoVariant = 'A' | 'B' | 'C';
export const PROTO_VARIANTS: { key: ProtoVariant; name: string }[] = [
  { key: 'A', name: '현재 플랫폼' },
  { key: 'B', name: 'FeedbackOps 토큰 + 플랫폼 셸' },
  { key: 'C', name: 'FeedbackOps 토큰 + FeedbackOps 셸' },
];

const KEY = 'proto:variant';
const isVariant = (v: unknown): v is ProtoVariant => v === 'A' || v === 'B' || v === 'C';

function initial(): ProtoVariant {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('variant')?.toUpperCase();
    if (isVariant(fromUrl)) { localStorage.setItem(KEY, fromUrl); return fromUrl; }
    const stored = localStorage.getItem(KEY);
    if (isVariant(stored)) return stored;
  } catch { /* ignore */ }
  return 'A';
}

let current: ProtoVariant = typeof window === 'undefined' ? 'A' : initial();
const listeners = new Set<() => void>();

export function getProtoVariant(): ProtoVariant { return current; }
export function subscribeProtoVariant(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setProtoVariant(next: ProtoVariant): void {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(KEY, next);
    const url = new URL(window.location.href);
    url.searchParams.set('variant', next);
    window.history.replaceState(window.history.state, '', url);
  } catch { /* ignore */ }
  listeners.forEach(l => l());
}
export function useProtoVariant(): ProtoVariant {
  return useSyncExternalStore(subscribeProtoVariant, getProtoVariant, () => 'A');
}
