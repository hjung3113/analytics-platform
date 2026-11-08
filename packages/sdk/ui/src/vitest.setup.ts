// Moved FeedbackOps tests rely on jest-dom matchers (toBeDisabled, toHaveAttribute, ...) and RTL auto-cleanup (globals).
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import { afterAll } from 'vitest';
import { watchEditorTimers } from './__tests__/support/watch-editor-timers';

// The rich editor mounts behind a lazy import (#1452); its first render passes testing-library's 1 s default under CI load, like the shell (#783).
configure({ asyncUtilTimeout: 3000 });

if (typeof document !== 'undefined') afterAll(watchEditorTimers());
