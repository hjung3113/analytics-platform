import type { AnalysisSelection } from '@ap/contracts';
import { formatText, type Lang } from '@ap/kernel';
import { COMPONENTS_MESSAGES } from '../messages';

export function analysisSelectionLabel(selection: AnalysisSelection, dimension: string, lang: Lang): string {
  if (selection.shape === 'range') return `${dimension} ${selection.from} – ${selection.to}`;
  const [first = ''] = selection.values;
  const others = selection.values.length - 1;
  const value = others > 0 ? formatText(COMPONENTS_MESSAGES.analysisSelectionMoreValues, lang, { first, count: others }) : first;
  return `${dimension} ${value}`;
}
