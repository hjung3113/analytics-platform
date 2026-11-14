/** Menu-owned repeatable conformance inputs (#2010); never imported by production screens. */
import { logAnalysisActionsMock } from './index';
const EXPLORER_SET = { sourceOwner: 'synthetic-ok', files: [{ fileRef: 'source-b', order: 1, sha256: 'b'.repeat(64) }] };
const EXPLORER_REF = { fileRef: 'source-b', line: 1, fileSha256: 'b'.repeat(64) };
// Fresh own investigations keep archive and evidence writes repeatable in the conformance kit.
const explorerHandler = (name: string) => logAnalysisActionsMock.find(a => a.spec.id === `logExplorer.${name}`)!;
const EXPLORER_ROUND = '14740000-0000-4000-8000-0000000000aa';
const freshInvestigation = (withEvidence = false, round = false): string => {
  const id = (explorerHandler('investigationCreate').handle({ actor: 'admin', scopeId: null, input: round ? { title: 'Synthetic conformance round investigation', origin: 'round', roundId: EXPLORER_ROUND } : { title: 'Synthetic conformance investigation', origin: 'standalone', sampleSet: EXPLORER_SET } }).data as { id: string }).id;
  if (withEvidence) explorerHandler('evidenceAdd').handle({ actor: 'admin', scopeId: null, input: { id, ref: EXPLORER_REF } });
  return id;
};
const explorerSamples = {
  investigationCreate: () => ({ title: 'Synthetic conformance investigation', origin: 'standalone', sampleSet: EXPLORER_SET }),
  investigationUpdate: () => ({ id: freshInvestigation(), filters: { module: 'Module 1' } }),
  evidenceAdd: () => ({ id: freshInvestigation(), ref: EXPLORER_REF }),
  evidenceRemove: () => ({ id: freshInvestigation(true), ref: { fileRef: EXPLORER_REF.fileRef, line: EXPLORER_REF.line } }),
  investigationArchive: () => ({ id: freshInvestigation() }),
  evidenceHandoff: () => ({ id: freshInvestigation(true, true), refs: [{ fileRef: EXPLORER_REF.fileRef, line: EXPLORER_REF.line, fileSha256: EXPLORER_REF.fileSha256 }], target: { kind: 'round', roundId: EXPLORER_ROUND } }),
};

export const logAnalysisWriteSamples: Readonly<Record<string, () => Record<string, unknown>>> = Object.fromEntries(
  Object.entries({ ...explorerSamples }).map(([name, sample]) => [`logExplorer.${name}`, sample]),
);
