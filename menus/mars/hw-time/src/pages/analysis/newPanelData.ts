import type { HeatmapCell } from '@ap/components';
import { HTM_STATUSES, HW_TIME_MODULE_TYPES, type HtmJudgement, type HtmStatus, type HwTimeMatrix } from '../../endpoints';
import { HW_TIME_NEW_PANEL_MESSAGES as N } from '../../messages';
import { htmEmphasisStatus, htmStatusText, htmStatusView } from '../../shared/htm';
import type { Checks } from './stepped';

function selectedJudgements(matrices: readonly HwTimeMatrix[], selection: (type: string) => Checks) {
  return matrices.flatMap(matrix => {
    const type = HW_TIME_MODULE_TYPES.find(type => type.modules.some(id => matrix.modules.includes(id)));
    if (!type) return [];
    const checks = selection(type.id);
    return matrix.cells.filter(cell => checks.modules.includes(cell.moduleId)).flatMap(cell => checks.motions.map(motion => ({
      id: `${cell.moduleId}/${motion}`, label: `${cell.moduleId} · ${motion}`, judgement: cell.motions[motion],
    })));
  });
}
export function verdictCounts(matrices: readonly HwTimeMatrix[], selection: (type: string) => Checks): Record<HtmStatus, number> {
  const counts = Object.fromEntries(HTM_STATUSES.map(status => [status, 0])) as Record<HtmStatus, number>;
  for (const { judgement } of selectedJudgements(matrices, selection)) counts[judgement?.status ?? 'unjudgeable']++;
  return counts;
}
/** Counts equipment–Module–Motion aggregate judgements, never sampled raw runs. */
export function paretoItems(matrices: readonly HwTimeMatrix[], selection: (type: string) => Checks) {
  const counts = new Map<string, { id: string; label: string; value: number }>();
  for (const item of selectedJudgements(matrices, selection)) {
    const entry = counts.get(item.id) ?? { id: item.id, label: item.label, value: 0 };
    if (item.judgement?.status === 'over') entry.value++;
    counts.set(item.id, entry);
  }
  return [...counts.values()].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
}
export function verdictEmphasis(judgement: HtmJudgement | undefined, verdict: HtmStatus | null, lang: 'ko' | 'en') {
  if (!verdict) return htmEmphasisStatus(htmStatusView(judgement, lang));
  if (judgement?.status !== verdict) return undefined;
  return htmStatusView(judgement, lang) ?? { tone: 'neutral' as const, label: `${N.verdict[lang]}: ${htmStatusText(judgement, lang)}` };
}
export function heatmapValues(data: HwTimeMatrix, checks: Checks, motion: string | null, verdict: HtmStatus | null, lang: 'ko' | 'en'): HeatmapCell[] {
  return data.cells.filter(cell => checks.modules.includes(cell.moduleId)).map(cell => {
    const picked = motion ? cell.motions[motion] : undefined;
    const values = checks.motions.map(id => cell.motions[id]?.value ?? null);
    const sum = !values.length || values.some(value => value === null) ? null : values.reduce<number>((sum, value) => sum + value!, 0);
    const value = motion ? picked?.value ?? null : sum;
    const statuses = checks.motions.map(id => cell.motions[id]).filter((item): item is HtmJudgement => !!item);
    const worst = statuses.find(item => item.status === 'over') ?? statuses.find(item => item.status === 'under') ?? cell.module;
    return { x: cell.moduleId, y: cell.equipmentId, value, status: verdictEmphasis(motion ? picked : worst, verdict, lang) };
  });
}
