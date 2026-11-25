import { render, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { RichContentRenderer } from '../RichContentRenderer';
import type { TipTapDoc } from '../RichEditor';
import RichEditorImpl from '../RichEditorImpl';

const doc: TipTapDoc = {
  type: 'doc',
  content: ['bulletList', 'orderedList'].map(type => ({
    type,
    content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: type }] }] }],
  })),
};

it.each([
  ['internal-comment', 'internal'],
  ['reporter-reply', 'reporter_visible'],
  ['public-update', 'reporter_visible'],
] as const)('scopes lists in the %s reader to the shared marker styles', (surface, mode) => {
  const { container } = render(<RichContentRenderer doc={doc} surface={surface} mode={mode} />);
  expect(within(container).getByText('bulletList').closest('[data-rich-list-content] ul > li')).toBeInTheDocument();
  expect(within(container).getByText('orderedList').closest('[data-rich-list-content] ol > li')).toBeInTheDocument();
});

it.each(['internal-comment', 'public-update', 'voc-description'] as const)('uses the same list style hook in the %s editor', async surface => {
  const { container } = render(<RichEditorImpl surface={surface} defaultValue={doc} />);
  expect((await within(container).findByText('bulletList')).closest('[data-rich-list-content] ul > li')).toBeInTheDocument();
  expect(within(container).getByText('orderedList').closest('[data-rich-list-content] ol > li')).toBeInTheDocument();
});
