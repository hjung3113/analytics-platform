/// <reference types="@testing-library/jest-dom" />
import { render } from '@testing-library/react';
import { RichContentRenderer } from '../RichContentRenderer.js';
import type { TipTapDoc } from '../RichEditor.js';

const ID = '78fba6fa-1b2c-4d3e-8f90-123456789abc';
const doc: TipTapDoc = { type: 'doc', content: [{ type: 'attachmentRef', attrs: { id: ID } }] };

describe('RichContentRenderer attachment names', () => {
  it.each([
    ['name from the list', [{ id: ID, name: 'report.pdf' }], undefined, 'report.pdf'],
    ['fallback label when id is not listed', [{ id: 'other', name: 'x.txt' }], '첨부 파일', '첨부 파일'],
    ['neutral default with neither prop', undefined, undefined, 'attachment'],
  ])('renders %s, never the UUID', (_n, attachments, attachmentFallbackLabel, expected) => {
    const { container, queryByText } = render(
      <RichContentRenderer
        doc={doc}
        mode="internal"
        surface="voc-description"
        attachments={attachments}
        attachmentFallbackLabel={attachmentFallbackLabel}
      />,
    );
    expect(container.querySelector('.attachment-id')?.textContent).toBe(expected);
    expect(queryByText(ID)).toBeNull();
    const node = container.querySelector('[data-type="attachment-ref"]');
    expect(node?.getAttribute('name')).toBeNull();
    expect(node?.getAttribute('data-attachment-name')).toBeFalsy();
  });
});
