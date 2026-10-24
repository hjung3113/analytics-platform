import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// Dock and menu tests render past testing-library's 1 s default under CI load (#783: BoardDock Shift+F10 failed twice).
configure({ asyncUtilTimeout: 3000 });
