import { expect, it } from 'vitest';
import { shellDimensions } from './App';
// This preserved prototype records the 2026-09-21 shell baseline (DESIGN.md sidebar-shell/top-bar, 06 §7 at the time).
// 06 §7 moved to the FeedbackOps shell on 2026-10-04 (docs/adr/0011-design-direction-feedbackops-shell.md), so the
// current docs are no longer this prototype's source — the test pins the recorded baseline instead of reading them.
it('keeps the 2026-09-21 shell baseline it was built against', () => {
  expect(shellDimensions).toEqual({ expanded: 270, collapsed: 64, header: 54 });
});
