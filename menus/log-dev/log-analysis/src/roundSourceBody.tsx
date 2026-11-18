import { useEffect, useState, type ReactNode } from 'react';
import { usePlatform } from '@ap/kernel';
import type { Investigation } from './endpoints';
import { InvestigationScreen } from './pages/LogExplorer';
import type { RoundSourceViewProps } from './view';

/** The heavy body of `RoundSourceView`, loaded lazily (see view.tsx). */
const ROUND_SOURCE_PAGE_KEYS = { tab: 'sourceTab', focus: 'sourceFocus', drawer: 'sourceDrawer', logType: 'sourceLogType', module: 'sourceModule', event: 'sourceEvent', contextKey: 'sourceContextKey', contextValue: 'sourceContextValue', text: 'sourceText' } as const;
const ROUND_FILTER_KEYS = ['sourceLogType', 'sourceModule', 'sourceEvent', 'sourceContextKey', 'sourceContextValue', 'sourceText'] as const;

const frame = ({ contextExtension, children }: { contextExtension: ReactNode; children: ReactNode }) => (
  <div className="flex h-full min-h-0 flex-col gap-3">{contextExtension}{children}</div>
);

export default function RoundSourceBody({ roundId, sampleSet }: RoundSourceViewProps) {
  const { setPage } = usePlatform();
  const [readyRound, setReadyRound] = useState(roundId);
  useEffect(() => {
    if (readyRound === roundId) return;
    setPage(Object.fromEntries(ROUND_FILTER_KEYS.map(key => [key, null])));
    setReadyRound(roundId);
  }, [readyRound, roundId, setPage]);
  if (readyRound !== roundId) return null;
  const investigation: Investigation = {
    id: roundId, title: 'Round 샘플', origin: 'round', roundId, status: 'open', version: '0', createdAt: '', updatedAt: '',
    sampleSet, sampleSetState: 'round', canInvestigate: false, handoff: { round: false, knowledgeDraft: false }, filters: {}, evidence: [],
  };
  return <InvestigationScreen key={roundId} embedded picker={null} pageKeys={ROUND_SOURCE_PAGE_KEYS} frame={frame} investigation={investigation} />;
}
