export type { PanelInputs } from '@ap/contracts';
export type { HwTimePanelDeclaration as PanelDeclaration } from '../../panels';
export { disabledReason, panelQueryIdentity, projectDisplayInputs, projectQueryInputs } from '@ap/kernel';
export { panelDeclarations } from '../../panels';

/** Existing URL state is read once, without a synchronized Context copy. */
export function workspacePanelContext({ step, typeId, motionId, moduleId, trend }: {
  step: number; typeId: string | null; motionId?: string | null; moduleId: string | null; trend: string | null;
}) {
  return { moduleType: typeId, drillMotion: motionId ?? null, drillModule: moduleId, trend, step4: step === 4 };
}
/** C1: resolve after projecting real page inputs. Explicit trend wins for trend;
 * drill wins for scatter. Derived targets are not registered page keys.
 */
export function panelRunTarget(panel: 'trend' | 'scatter', input: { drillModule?: string | null; drillMotion?: string | null; trend?: string | null }): string | null {
  const drillTarget = input.drillModule && input.drillMotion ? `${input.drillModule}/${input.drillMotion}` : null;
  return panel === 'trend' ? input.trend ?? drillTarget : drillTarget ?? input.trend ?? null;
}

