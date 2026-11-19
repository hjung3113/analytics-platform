import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { LineErrorList, validateLines } from '../LineErrors.js';

it('validates physical lines with one-based numbers and handles CRLF', () => {
  const errors = validateLines(
    'valid\r\nmissing-id\ninvalid-date',
    (line) => (line === 'valid' ? null : 'Invalid reference'),
    { maxLines: 3 },
  );

  expect(errors).toEqual([
    { line: 2, message: 'Invalid reference' },
    { line: 3, message: 'Invalid reference' },
  ]);
});

it('reports the first line beyond maxLines instead of silently dropping it', () => {
  expect(validateLines('valid\nvalid\nextra', () => null, {
    maxLines: 2,
    maxLinesMessage: 'Only 2 lines are allowed',
  })).toEqual([{ line: 3, message: 'Only 2 lines are allowed' }]);
});

it('renders the first errors and a remaining-count summary', () => {
  render(
    <LineErrorList
      maxVisible={2}
      errors={[
        { line: 2, message: 'Missing id' },
        { line: 7, message: 'Unknown system' },
        { line: 9, message: 'Bad date' },
        { line: 12, message: 'Duplicate' },
      ]}
    />,
  );

  expect(screen.getByText('2행: Missing id')).toBeVisible();
  expect(screen.getByText('7행: Unknown system')).toBeVisible();
  expect(screen.getByText('외 2건')).toBeVisible();
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
});

it('renders nothing when there are no line errors', () => {
  const { container } = render(<LineErrorList errors={[]} />);
  expect(container).toBeEmptyDOMElement();
});
