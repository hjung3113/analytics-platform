import { DetailPanelHeader } from '@fops/ui';
import {
  type MilestoneDetailPanelProps,
  type MilestoneDetailParts,
  useMilestoneDetailParts,
} from './useMilestoneDetailParts';

export type { MilestoneDetailPanelProps } from './useMilestoneDetailParts';

// #514 B2d — Milestone detail panel mirroring MilestoneDetailPanel in
// docs/design-prototype/screen-milestones.jsx, mounted in the existing
// ListShell detail slot (never a new shell). This is the standalone frame
// around the detail parts (`useMilestoneDetailParts`).
export function MilestoneDetailPanel(props: MilestoneDetailPanelProps) {
  return <MilestoneDetailFrame parts={useMilestoneDetailParts(props)} />;
}

/** The standalone frame over already-built detail parts. */
export function MilestoneDetailFrame({ parts }: { parts: MilestoneDetailParts }) {
  const { view } = parts;
  return (
    <aside className="flex h-full flex-col bg-surface-detail">
      {/* Panel chrome first: header and close stay mounted independently of the
          query result, so pending, denied, and unavailable reads all stay
          dismissible. Identity and record actions render only for a successful
          read with no terminal error — never for cached data after 403/404. */}
      <DetailPanelHeader
        kind="milestone"
        onClose={parts.requestClose}
        {...(view.kind === 'ready'
          ? { id: view.milestone.display_id, extras: parts.headerActions }
          : {})}
      />
      {parts.body}
    </aside>
  );
}
