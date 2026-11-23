import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import { resetBoardPresentationForTests } from './board/boardPresentation';
import { resetBoardSessionsForTests } from './board/boardSession';

// Dock and menu tests render past testing-library's 1 s default under CI load (#783: BoardDock Shift+F10 failed twice).
configure({ asyncUtilTimeout: 3000 });

// The board session store is module-level; tests that render without cleanup must not see the previous test's boards.
afterEach(resetBoardSessionsForTests);
// Likewise the board's presentation (live, return path): a board left open by one test must not mount in the next.
afterEach(resetBoardPresentationForTests);
// Below 1200px the sidebar starts collapsed (#1944) and a collapsed sidebar is not drawn (#2727): give jsdom (1024px) a desktop window.
Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
