import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Button as FeedbackOpsButton } from '@fops/ui';

afterEach(cleanup);

it('renders a primitive from the FeedbackOps UI package', () => {
  render(<FeedbackOpsButton>FeedbackOps primitive</FeedbackOpsButton>);

  expect(screen.getByRole('button', { name: 'FeedbackOps primitive' }).textContent).toBe('FeedbackOps primitive');
});
