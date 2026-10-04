import { expect, it } from 'vitest';
import { feedbackOpsUiModuleSideEffects } from './feedbackops-ui-module-side-effects.ts';

it('treats FeedbackOps TSX source as side-effect free', () => {
  expect(feedbackOpsUiModuleSideEffects('/workspace/products/feedbackops/packages/ui/src/button.tsx')).toBe(false);
});

it('leaves FeedbackOps CSS and inline CSS at the default side-effect setting', () => {
  expect(feedbackOpsUiModuleSideEffects('/workspace/products/feedbackops/packages/ui/src/styles/tokens.css')).toBe(null);
  expect(feedbackOpsUiModuleSideEffects('/workspace/products/feedbackops/packages/ui/src/styles/tokens.css?inline')).toBe(null);
});

it('normalizes Windows paths before matching FeedbackOps source', () => {
  expect(feedbackOpsUiModuleSideEffects('C:\\repo\\products\\feedbackops\\packages\\ui\\src\\button.tsx')).toBe(false);
});

it('leaves other packages at the default side-effect setting', () => {
  expect(feedbackOpsUiModuleSideEffects('/workspace/packages/ui/src/button.tsx')).toBe(null);
});
