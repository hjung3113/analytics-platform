import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DETAIL_ENVELOPE, ME_RESPONSE } from './_fixtures';
import { VocDetailBody, type VocDetailRegionLayout } from '../VocDetailBody';
import type { DetailCloseGuard } from '../useDetailCloseGuard';

const dirty = vi.hoisted(() => vi.fn());
vi.mock('../useVocDetailPanelController', () => ({
  useVocDetailPanelController: () => ({
    scrollRef: { current: null },
    actorNamesById: new Map(),
    analyticsAreasById: new Map(),
    canTriage: true,
    canCreateFinding: true,
    canRequestTask: true,
    pendingReviewCount: 1,
    showsSimilarVocSection: true,
    isReporterArm: false,
    noFollowUpScope: 'scope',
    canOpenTrailNode: () => true,
    canSelectSimilarVoc: () => true,
    handleOpenTriage: () => {},
    setReviewOpen: () => {},
    setCreateFindingOpen: () => {},
    setRequestTaskOpen: () => {},
  }),
}));
vi.mock('../IdentitySection', () => ({
  IdentitySection: () => <p>Author</p>,
  IdentityMetadataStrip: () => <p>Source context</p>,
}));
vi.mock('../DescriptionSection', () => ({ DescriptionSection: () => <p>Description</p> }));
vi.mock('../TriageBlock', () => ({
  TriageBlock: () => <button type="button">분류에서 변경</button>,
}));
vi.mock('../NoFollowUpSection', () => ({
  NoFollowUpSection: () => <p>No follow-up decision</p>,
}));
vi.mock('../LinkedExecutionSection', () => ({
  LinkedExecutionSection: () => <p>Linked execution</p>,
}));
vi.mock('../LinkedEntityTrailSection', () => ({
  LinkedEntityTrailSection: () => <p>Follow-up trail</p>,
  hasVisibleFollowUp: () => true,
}));
vi.mock('../SimilarVocSection', () => ({ SimilarVocSection: () => <p>Similar VOC</p> }));
vi.mock('../ConversationTimeline', () => ({
  ConversationTimeline: () => <p>Conversation</p>,
}));
vi.mock('../ComposerSection', () => ({
  ComposerSection: ({ onDirtyChange }: { onDirtyChange: (value: boolean) => void }) => (
    <textarea aria-label="Composer" onChange={() => onDirtyChange(true)} />
  ),
}));
vi.mock('../PublicUpdateReviewModal', () => ({ PublicUpdateReviewModal: () => null }));
vi.mock('@/features/cross-system/create-finding/CreateFindingModal', () => ({
  CreateFindingModal: () => null,
}));

function layout({ regions, footer }: VocDetailRegionLayout) {
  return (
    <>
      <main data-testid="body">{regions.body}</main>
      <aside data-testid="properties">{regions.properties}</aside>
      <section data-testid="activity">{regions.activity}</section>
      <footer>{footer}</footer>
    </>
  );
}

function mount(renderRegions?: typeof layout) {
  return render(
    <VocDetailBody
      voc={DETAIL_ENVELOPE}
      vocId={DETAIL_ENVELOPE.id}
      me={ME_RESPONSE}
      closeGuard={{
        setComposerDirty: dirty,
        dirtyConfirmOpen: false,
        confirmClose: () => {},
        cancelClose: () => {},
      } as unknown as DetailCloseGuard}
      isReporterOnOwnVoc={false}
      canRenderAllowedTask
      {...(renderRegions ? { renderRegions } : {})}
    />,
  );
}

afterEach(() => {
  cleanup();
  dirty.mockClear();
});

it('retains body content, properties, conversation/composer and embedded fixed actions', () => {
  mount(layout);

  for (const name of [
    'Author',
    'Description',
    'Source context',
    'No follow-up decision',
    'Linked execution',
    'Follow-up trail',
    'Similar VOC',
  ]) {
    expect(screen.getByText(name).closest('main')).toBeTruthy();
  }
  expect(screen.getByRole('button', { name: '분류에서 변경' }).closest('aside')).toBeTruthy();
  expect(screen.getByText('Conversation').closest('[data-testid="activity"]')).toBeTruthy();
  expect(screen.getByLabelText('Composer').closest('[data-testid="activity"]')).toBeTruthy();
  const action = screen.getByRole('button', { name: /Task 요청/ });
  expect(action.closest('footer')).toBeTruthy();
  expect(action.parentElement).toHaveAttribute('class', 'flex items-center gap-3');
  expect(screen.getByTestId('public-update-review-button').closest('[data-testid="activity"]')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Composer'), { target: { value: 'Unsent' } });
  expect(dirty).toHaveBeenCalledWith(true);
});

it('keeps anchors in the declared body → properties → activity reading order', () => {
  const { container } = mount(layout);

  expect(Array.from(container.querySelectorAll('[data-anchor]'), (node) =>
    node.getAttribute('data-anchor'),
  )).toEqual(['overview', 'description', 'trail', 'similar', 'triage', 'conversation', 'compose']);
});

it('preserves standalone section navigation with all anchors under its shared scroll frame', () => {
  mount();

  const nav = screen.getByRole('navigation', { name: '섹션 이동' });
  expect(within(nav).getByRole('button', { name: '요약' })).toBeInTheDocument();
  expect(within(nav).getByRole('button', { name: '분류' })).toBeInTheDocument();
  const scrollFrame = nav.nextElementSibling;
  if (!scrollFrame) throw new Error('Standalone detail scroll frame is missing');
  expect(scrollFrame).toHaveClass('overflow-y-auto', 'pt-7', 'px-6', 'pb-16');
  expect(Array.from(scrollFrame.querySelectorAll('[data-anchor]'), (node) =>
    node.getAttribute('data-anchor'),
  )).toEqual(['overview', 'triage', 'description', 'trail', 'similar', 'conversation', 'compose']);
  expect(screen.getByRole('button', { name: /Task 요청/ }).parentElement).toHaveClass(
    'sticky', 'border-t', 'bg-surface-canvas', 'px-4', 'py-3',
  );
});
