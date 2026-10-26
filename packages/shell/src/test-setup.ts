import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import { resetBoardSessionsForTests } from './board/boardSession';

// Dock and menu tests render past testing-library's 1 s default under CI load (#783: BoardDock Shift+F10 failed twice).
configure({ asyncUtilTimeout: 3000 });

// The board session store is module-level; tests that render without cleanup must not see the previous test's boards.
afterEach(resetBoardSessionsForTests);
