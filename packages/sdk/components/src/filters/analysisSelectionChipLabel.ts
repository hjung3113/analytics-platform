import { formatText, type AnalysisSelectionChip, type Lang } from '@ap/kernel';
import { COMPONENTS_MESSAGES } from '../messages';

export function analysisSelectionChipLabel(chip: AnalysisSelectionChip, lang: Lang) {
  const dimension = chip.label?.[lang] ?? chip.dimension;
  const title = chip.source?.title[lang];
  const source = title && !/\{[^{}]+\}/.test(title) ? title : undefined;
  const { selection } = chip;
  let value: string;
  if (selection.shape === 'range') value = `${selection.from} – ${selection.to}`;
  else {
    const [first, ...others] = selection.values;
    value = others.length > 0 ? formatText(COMPONENTS_MESSAGES.analysisSelectionMoreValues, lang, { first, count: others.length }) : first ?? '';
  }
  return { dimension, source, text: `${dimension} ${value}` };
}
