import { Suspense, lazy } from 'react';
import type { SampleSet } from './endpoints';

/**
 * The Round detail's «원본/시퀀스» tab body (#1475). The app wires this into menu-log-models (the two menus never import each other):
 * the host passes the Round's own sample list, and the body reads the Source with it. It is read-only and saves nothing: no
 * investigation row, no saved conditions, no evidence basket. The address keys are namespaced (`sourceTab`, `sourceFocus`,
 * `sourceDrawer`) so they cannot meet the Round screen's own `tab`, and the page frame stays with the host.
 *
 * This file stays thin on purpose: `main.tsx` imports it at start-up, so the table, the virtualizer and the Source reads are a lazy
 * chunk that loads when the tab opens (`check:lazy-chunks` keeps the virtualizer out of the start-up chunks).
 */
export type RoundSourceViewProps = { roundId: string; sampleSet: SampleSet };

const Body = lazy(() => import('./roundSourceBody'));

export function RoundSourceView(props: RoundSourceViewProps) {
  return <Suspense fallback={<p role="status" className="text-sm text-text-secondary">불러오는 중</p>}><Body {...props} /></Suspense>;
}
