import { useState } from 'react';

/**
 * Boolean UI preference (collapsed rails/rows) kept across reloads, with the same try/catch shape as
 * AnalysisLayout·ManagementLayout: storage failures leave the value in memory only. The storage key is the
 * caller's contract (`platform:…` prefix by convention); values stay out of the URL, which owns filter values.
 */
export function useStoredBoolean(key: string): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(() => {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  });
  const set = (next: boolean) => {
    setValue(next);
    try {
      if (next) localStorage.setItem(key, '1');
      else localStorage.removeItem(key);
    } catch { /* preference stays in memory */ }
  };
  return [value, set];
}
