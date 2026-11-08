import type { ReactNode } from 'react';

/**
 * The Round detail's «원본/시퀀스» tab body (#1475). The app injects it at startup (`apps/platform-web/src/main.tsx`), the same way it hands
 * the feature API to the bridge menus: this menu and menu-log-analysis never import each other. The props are structural, so the
 * injected component needs no type from this package. Unset (a host that wires nothing) → the Round detail shows no such tab.
 */
export type RoundSourceViewProps = { roundId: string; sampleSet: { sourceOwner: string; files: { fileRef: string; order: number; sha256: string }[] } };
export type RoundSourceViewComponent = (props: RoundSourceViewProps) => ReactNode;

let injected: RoundSourceViewComponent | null = null;
export function setRoundSourceView(view: RoundSourceViewComponent | null): void { injected = view; }
export function roundSourceView(): RoundSourceViewComponent | null { return injected; }
