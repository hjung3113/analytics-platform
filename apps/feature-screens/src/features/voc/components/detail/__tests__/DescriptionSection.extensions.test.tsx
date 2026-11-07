import { configureApiClient } from '@/lib/api/client';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DescriptionSection } from '../DescriptionSection';
import { DETAIL_ENVELOPE } from './_fixtures';
vi.mock('../EditDescriptionModal', () => ({ EditDescriptionModal: () => null }));
afterEach(() => configureApiClient({ basePath: '' }));
describe('VOC description extended reader', () => {
  it('selects voc-description and resolves inline image downloads through the configured API prefix', () => {
    configureApiClient({ basePath: '/api/features' });
    const id = '11111111-1111-4111-8111-111111111111';
    const p = { type: 'paragraph', content: [{ type: 'text', text: '본문' }] };
    const voc = { ...DETAIL_ENVELOPE, description_rich_content: { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '개요' }] },
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [p] }] }] },
      { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p] }] },
      { type: 'details', content: [{ type: 'detailsSummary', content: [{ type: 'text', text: '요약' }] }, { type: 'detailsContent', content: [p] }] },
      { type: 'image', attrs: { id } },
    ] } };
    const { container } = render(<DescriptionSection voc={voc} isReporterOnOwnVoc={false} />);
    expect(container.querySelector('h2')).toHaveTextContent('개요');
    expect(container.querySelector('table')).toBeInTheDocument();
    expect(container.querySelector('input[type="checkbox"]')).toBeChecked();
    expect(container.querySelector('details')).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('src', `/api/features/attachments/${id}/download`);
  });
});
