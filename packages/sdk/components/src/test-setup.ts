import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// Vitest 4+ jsdom gives each file one working Web Storage that persists across its tests; a test that calls setLang('en')
// would leak English into the next one (#3030). Start every test from empty storage. `@vitest-environment node` files have none.
afterEach(() => {
  if (typeof window === 'undefined') return;
  window.localStorage.clear();
  window.sessionStorage.clear();
});
