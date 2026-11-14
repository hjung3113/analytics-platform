/** Menu-owned repeatable conformance inputs (#2010); never imported by production screens. */
import { emptyGlobal } from '@ap/contracts';
import { studioActionsMock } from './actions';
import { studioReadsMock } from './reads';
import { stageOnboardingWindow } from './onboarding-store';
// Studio Layouts (#1654): the mock's own handlers stage Layouts, Revisions and Templates; each write sample owns a fresh Layout so repeated calls never collide.
const studioAction = (id: string) => studioActionsMock.find(action => action.spec.id === `eqv.${id}`)!;
const studioRun = (id: string, input: Record<string, unknown>) => studioAction(id).handle({ input, actor: 'admin', scopeId: null }).data as Record<string, string>;
const studioRead = (id: string, params: Record<string, unknown>) => studioReadsMock.find(({ spec }) => spec.id === `eqv.${id}`)!.handle({ equipment: [], context: emptyGlobal, params, actor: 'admin' }) as { document: Record<string, unknown> };
const STUDIO_LAYOUT = 'sample-layout';
let studioSequence = 0;
const stagedStudioLayout = (): string => {
  const layoutId = `cf-layout-${++studioSequence}`;
  studioRun('saveDraft', { layoutId, document: { ...studioRead('layoutDraft', { layoutId: STUDIO_LAYOUT }).document, id: layoutId } });
  return layoutId;
};
let onboardingUploadId: string | null = null;
export function setConformanceUpload(uploadId: string): void { onboardingUploadId = uploadId; }
// 설비 온보딩 writes (#1658): a publish sample stages its own Layout and Revision and a later effectiveFrom, so it never equals the latest
// Binding; a window sample stages its own synthetic window (`stageOnboardingWindow`) on eq-synth-02.
const ONBOARDING_MAPPING = 'sha256:0abf3e9ff0b22cb0e7993bfe143461f44ef1b8828df2cdce8e25af3d02987aef';
/** The seeded active window of eq-synth-02: a publish names it and the mock takes its stored Inventory as the Baseline. */
const ONBOARDING_WINDOW = '38098e59b24809a728006d2b635e8034d7303ea9403f69f6da7201fe635f9da8';
let onboardingSequence = 0;
const onboardingSamples: Record<string, () => Record<string, unknown>> = {
  saveAliasRules: () => ({ level: 'equipment', equipmentId: 'eq-synth-02', document: { schemaVersion: '0.4', scope: { level: 'equipment', equipmentId: 'eq-synth-02' }, rules: [] } }),
  saveTypeDictionary: () => ({ level: 'maker', vendorId: 'synth-maker', document: { schemaVersion: '0.4', scope: { level: 'maker', maker: 'synth-maker' }, entries: [] } }),
  publishMapping: () => {
    const layoutId = stagedStudioLayout();
    const { revision } = studioRun('publishRevision', { layoutId });
    const effectiveFrom = new Date(Date.UTC(2027, 0, 1) + ++onboardingSequence * 1000).toISOString().slice(0, 23);
    // The mock checks only the format of the reviewed hash (it cannot recompute the screen's, #2053).
    return { equipmentId: 'eq-synth-02', layoutId, layoutRevision: revision, windowHash: ONBOARDING_WINDOW, effectiveFrom, expectedMappingHash: ONBOARDING_MAPPING };
  },
  replaceSampleWindow: () => ({ equipmentId: 'eq-synth-02', windowHash: stageOnboardingWindow('staged') }),
  retireSampleWindow: () => ({ equipmentId: 'eq-synth-02', windowHash: stageOnboardingWindow('active') }),
  // The synthetic eq-synth-01 batch, uploaded once by the granted actor below: importing stored content again answers the stored row.
  importSampleWindow: () => {
    if (onboardingUploadId === null) throw new Error('Conformance upload must be staged before sampling');
    return { equipmentId: 'eq-synth-01', uploadId: onboardingUploadId };
  },
  registerEquipment: () => ({ equipmentId: `cf-eq-${++onboardingSequence}`, label: 'Conformance', vendorId: 'synth-maker', modelId: 'synth-model' }),
};
const studioSamples: Record<string, () => Record<string, unknown>> = {
  saveDraft: () => { const layoutId = `cf-new-${++studioSequence}`; return { layoutId, document: { ...studioRead('layoutDraft', { layoutId: STUDIO_LAYOUT }).document, id: layoutId } }; },
  publishRevision: () => ({ layoutId: stagedStudioLayout() }),
  promoteTemplate: () => { const layoutId = stagedStudioLayout(); const { revision } = studioRun('publishRevision', { layoutId }); return { layoutId, revision, templateId: `cf-template-${++studioSequence}`, name: 'Conformance' }; },
};

export const topviewStudioWriteSamples: Readonly<Record<string, () => Record<string, unknown>>> = Object.fromEntries(
  Object.entries({ ...studioSamples, ...onboardingSamples }).map(([name, sample]) => [`eqv.${name}`, sample]),
);
