/** Page-rendered text for a value the source did not measure; never 0. (The Frame's own tooltip keeps its shared label.) */
export const MISSING_TEXT = '미측정';
export const missingText = (lang: 'ko' | 'en') => (lang === 'ko' ? MISSING_TEXT : 'Not measured');

export const formatSeconds = (value: number) => value.toFixed(2);
