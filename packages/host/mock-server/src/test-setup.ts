import { vi } from 'vitest';

const data = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => data.get(k) ?? null,
  setItem: (k: string, v: string) => { data.set(k, v); },
  removeItem: (k: string) => { data.delete(k); },
  clear: () => data.clear(),
  key: () => null,
  get length() { return data.size; },
});
