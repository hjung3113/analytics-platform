import { formatText } from '@ap/kernel';
import { HW_TIME_MESSAGES } from '../messages';
import { formatNumber } from '@ap/contracts';

/** Page-rendered text for a value the source did not measure; never 0. (The Frame's own tooltip keeps its shared label.) */
export const MISSING_TEXT = '미측정';
export const missingText = (lang: 'ko' | 'en') => (formatText(HW_TIME_MESSAGES.formatNotMeasured, lang));

/** Two decimals with thousand separators in the user's language, the same grouping the chart axis uses. */
export const formatSeconds = (value: number, lang: 'ko' | 'en') => formatNumber(value, lang, { decimals: 2 });

/** `MEM-PHOTO-0103.H1` → `MEM-PHOTO-0103 · H1`: the row name in the detail labels and the trend legend. */
export const rowIdLabel = (id: string) => id.replace('.', ' · ');
