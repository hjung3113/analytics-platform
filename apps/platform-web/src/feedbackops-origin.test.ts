import { describe, expect, it } from 'vitest';
import { readFeedbackOpsOrigin } from './feedbackops-origin';

describe('readFeedbackOpsOrigin (issue #60 §4)', () => {
  it('maps undefined and empty to null', () => {
    expect(readFeedbackOpsOrigin(undefined)).toBeNull();
    expect(readFeedbackOpsOrigin('')).toBeNull();
  });

  it('passes values through unchanged: rejection is the menu helper, not the reader', () => {
    // Uppercase host is invalid, but the reader must not rewrite it.
    expect(readFeedbackOpsOrigin('https://EXAMPLE.com')).toBe('https://EXAMPLE.com');
    // One trailing slash is accepted by the builder's canonical check.
    expect(readFeedbackOpsOrigin('https://feedbackops.example/')).toBe('https://feedbackops.example/');
  });
});
