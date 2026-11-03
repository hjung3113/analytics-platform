// VocStageLine — the reporter-facing progress stages of a VOC with the current one marked (prototype ② B).
// Shared by the public detail and the reporter's own detail so both read the same.

import { REPORTER_FACING_STATUS_ALL, REPORTER_STATUS_LABELS } from '@/lib/copy/reporter-status-labels';
import type * as React from 'react';

// `reopened` is a step back, not a stage of its own: it sits at the reviewing stage.
const STAGES = REPORTER_FACING_STATUS_ALL.filter((status) => status !== 'reopened');

export function VocStageLine({ status }: { status: (typeof REPORTER_FACING_STATUS_ALL)[number] }): React.ReactElement {
  const stage = status === 'reopened' ? 'reviewing' : status;
  return (
    <ol aria-label="진행 단계" className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
      {STAGES.map((item) => (
        <li key={item} aria-current={item === stage ? 'step' : undefined}
          className={item === stage ? 'font-semibold text-text-primary' : undefined}>
          {REPORTER_STATUS_LABELS[item]}
        </li>
      ))}
    </ol>
  );
}
