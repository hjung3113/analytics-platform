import { DetailPanelHeader } from '@ap/ui';
import {
  type MilestoneCreatePanelProps,
  type MilestoneCreateParts,
  useMilestoneCreateParts,
} from './useMilestoneCreateParts';

export type { MilestoneCreatePanelProps } from './useMilestoneCreateParts';

/** The standalone frame around the create parts (`useMilestoneCreateParts`); a host frames the same parts itself. */
export function MilestoneCreatePanel(props: MilestoneCreatePanelProps) {
  return <MilestoneCreateFrame parts={useMilestoneCreateParts(props)} />;
}

/** The standalone frame over already-built create parts. */
export function MilestoneCreateFrame({ parts }: { parts: MilestoneCreateParts }) {
  return (
    <aside className="flex h-full flex-col bg-surface-detail">
      {/* No display id exists yet: the header chrome mounts without record
          identity, mirroring the pending detail read. */}
      <DetailPanelHeader kind="milestone" onClose={parts.requestClose} />
      {parts.body}
    </aside>
  );
}
