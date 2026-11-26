import type { AnalysisSelectionChip, Lang } from '@ap/kernel';
import { analysisSelectionLabel } from './analysisSelectionLabel';

export function analysisSelectionChipLabel(chip: AnalysisSelectionChip, lang: Lang) {
  const dimension = chip.label?.[lang] ?? chip.dimension;
  const title = chip.source?.title[lang];
  const source = title && !/\{[^{}]+\}/.test(title) ? title : undefined;
  return { dimension, source, text: analysisSelectionLabel(chip.selection, dimension, lang) };
}
