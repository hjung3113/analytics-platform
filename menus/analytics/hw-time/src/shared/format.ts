/** Page-rendered text for a value the source did not measure; never 0. (The Frame's own tooltip keeps its shared label.) */
export const MISSING_TEXT = '미측정';
export const missingText = (lang: 'ko' | 'en') => (lang === 'ko' ? MISSING_TEXT : 'Not measured');

/** Two decimals with thousand separators, the same grouping the chart axis uses. */
export const formatSeconds = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** `EQ-001.H1` → `EQ-001 · H1`: the row name in the detail labels and the trend legend. */
export const rowIdLabel = (id: string) => id.replace('.', ' · ');
