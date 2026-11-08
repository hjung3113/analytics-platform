// Moved FeedbackOps tests rely on jest-dom matchers (toBeDisabled, toHaveAttribute, ...) and RTL auto-cleanup (globals).
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// The rich editor mounts behind a lazy import (#1452); its first render passes testing-library's 1 s default under CI load, like the shell (#783).
configure({ asyncUtilTimeout: 3000 });
