import { GLOSSARY } from '@/lib/copy/glossary';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DETAIL_ENVELOPE, ME_RESPONSE } from './_fixtures';
import { VocDetailBody } from '../VocDetailBody';
import type { DetailCloseGuard } from '../useDetailCloseGuard';

const arm = vi.hoisted(() => ({ reporter: false, scroll: { current: null as HTMLElement | null } }));
vi.mock('../useVocDetailPanelController', () => ({
  useVocDetailPanelController: () => ({
    scrollRef: arm.scroll,
    actorNamesById: new Map(),
    ownerTeamName: '운영팀',
    analyticsAreasById: new Map(),
    canTriage: true,
    canCreateFinding: true,
    canRequestTask: true,
    pendingReviewCount: 1,
    showsSimilarVocSection: true,
    isReporterArm: arm.reporter,
    noFollowUpScope: 'scope',
    canOpenTrailNode: () => true,
    canSelectSimilarVoc: () => true,
    handleOpenTriage: () => {},
    setReviewOpen: () => {},
    setCreateFindingOpen: () => {},
    setRequestTaskOpen: () => {},
  }),
}));
vi.mock('../DescriptionSection', () => ({ DescriptionSection: () => <p>Description</p> }));
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

vi.mock('@/lib/api/me', () => ({ useMeBridge: () => ({ data: ME_RESPONSE }) }));
vi.mock('@/lib/cross-system/useManagedSystem', () => ({ useManagedSystem: () => null }));

function mount(voc = DETAIL_ENVELOPE) {
  return render(
    <VocDetailBody
      voc={voc}
      vocId={voc.id}
      me={ME_RESPONSE}
      closeGuard={{ setComposerDirty: () => {}, dirtyConfirmOpen: false, confirmClose: () => {}, cancelClose: () => {} } as unknown as DetailCloseGuard}
      isReporterOnOwnVoc={false}
      canRenderAllowedTask
    />,
  );
}

afterEach(cleanup);

it('uses unknown reporter when the empty actor-name map cannot resolve someone else', () => {
  mount({ ...DETAIL_ENVELOPE, reporter_id: '00000000-0000-4000-8000-000000000051' });
  expect(screen.getByText(GLOSSARY.unknownUser)).toBeInTheDocument();
  expect(screen.queryByText(ME_RESPONSE.actor.display_name)).not.toBeInTheDocument();
});

it('keeps the self reporter fallback when the actor-name map is empty', () => {
  mount();
  expect(screen.getByText(ME_RESPONSE.actor.display_name)).toBeInTheDocument();
});

it('passes a resolved team name to the real detail triage block', () => {
  mount({ ...DETAIL_ENVELOPE, owner_team_id: '00000000-0000-4000-8000-000000000050' });
  expect(screen.getByText('팀 · 운영팀')).toBeInTheDocument();
  expect(screen.queryByText('담당자 없음')).not.toBeInTheDocument();
});
