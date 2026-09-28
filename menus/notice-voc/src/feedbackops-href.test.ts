import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ContractError, buildFeedbackOpsLink } from '@ap/contracts';
import { feedbackOpsHref } from './feedbackops-href';

const VOC_ID = 'e1111111-1111-4111-8111-111111111111';

// The real builder can only throw feedbackops_origin/feedbackops_id, so a foreign contract code is forced
// through a pass-through mock of the builder (issue #60 review: the wrapper must map EVERY ContractError
// to `invalid`, never rethrow). mockReset restores the wrapped real implementation.
vi.mock('@ap/contracts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ap/contracts')>();
  return { ...actual, buildFeedbackOpsLink: vi.fn(actual.buildFeedbackOpsLink) };
});

beforeEach(() => { vi.mocked(buildFeedbackOpsLink).mockReset(); });
afterEach(() => { vi.mocked(buildFeedbackOpsLink).mockReset(); });

describe('feedbackOpsHref (issue #60 §4: fail closed, never throw)', () => {
  it('reports missing for a null or empty origin, for both targets', () => {
    for (const origin of [null, '']) {
      expect(feedbackOpsHref(origin, { kind: 'voc-create' })).toEqual({ ok: false, reason: 'missing' });
      expect(feedbackOpsHref(origin, { kind: 'voc-detail', vocId: VOC_ID })).toEqual({ ok: false, reason: 'missing' });
    }
  });

  it('builds the exact create link', () => {
    expect(feedbackOpsHref('https://feedbackops.example', { kind: 'voc-create' }))
      .toEqual({ ok: true, href: 'https://feedbackops.example/vocs?action=create' });
  });

  it('builds the exact row link and never carries managedSystem', () => {
    const got = feedbackOpsHref('https://feedbackops.example', { kind: 'voc-detail', vocId: VOC_ID });
    expect(got).toEqual({ ok: true, href: `https://feedbackops.example/vocs?view=inbox&selected=${VOC_ID}` });
    expect(JSON.stringify(got)).not.toContain('managedSystem');
  });

  it('reports invalid for a non-canonical origin without throwing', () => {
    expect(feedbackOpsHref('https://EXAMPLE.com', { kind: 'voc-create' })).toEqual({ ok: false, reason: 'invalid' });
    expect(feedbackOpsHref('https://feedbackops.example/vocs', { kind: 'voc-create' })).toEqual({ ok: false, reason: 'invalid' });
  });

  it('reports invalid for a non-uuid vocId', () => {
    expect(feedbackOpsHref('https://feedbackops.example', { kind: 'voc-detail', vocId: 'VOC-M-1001' }))
      .toEqual({ ok: false, reason: 'invalid' });
  });

  it('maps any ContractError to invalid instead of rethrowing, even a foreign contract code', () => {
    vi.mocked(buildFeedbackOpsLink).mockImplementation(() => {
      throw new ContractError('feedbackops_path', 'forced: not an origin or id rejection');
    });
    expect(feedbackOpsHref('https://feedbackops.example', { kind: 'voc-create' })).toEqual({ ok: false, reason: 'invalid' });
  });
});
