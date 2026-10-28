import { TaskRequestDraftCard } from '@/features/cross-system/request-task/TaskRequestDraftCard';
import { errorMapper } from '@/lib/api/errorMapper';
import type { ApiError } from '@/lib/api/types';
import { useIdempotencyKey } from '@/lib/api/useIdempotencyKey';
import { TASK_REQUEST_COPY } from '@/lib/copy/task-requests';
import { useHostNotice, useHostSeam } from '@/lib/host/host-seam';
import { searchHref } from '@/lib/host/search';
import type { FindingDto } from '@ap/feature-shared';
import type * as React from 'react';
import { useRequestTaskFromFinding } from '../../hooks/useRequestTaskFromFinding';

export interface FindingRequestTaskDraftHostProps {
  findingId: string;
  finding: FindingDto | undefined;
  open: boolean;
  onClose: () => void;
}

function FindingRequestTaskDraftSubmission({
  finding,
  idempotencyKey,
  markConsumed,
  onClose,
}: {
  finding: FindingDto;
  idempotencyKey: string;
  markConsumed: () => void;
  onClose: () => void;
}): React.ReactElement {
  const { canLink, notifyError, useNavigate } = useHostSeam();
  const navigate = useNavigate?.();
  const { notify } = useHostNotice();
  const mutation = useRequestTaskFromFinding({
    findingId: finding.id,
    idempotencyKey,
    onError: (err: ApiError) => {
      notifyError(errorMapper(err.envelope).message);
    },
  });

  return (
    <TaskRequestDraftCard
      sourceKind="Finding"
      sourceDisplayId={finding.display_id}
      evidenceSummaryDefault={finding.summary}
      isSubmitting={mutation.isPending}
      source={{ type: 'finding', id: finding.id }}
      onClose={onClose}
      onSubmit={(values) => {
        mutation.mutate(values, {
          onSuccess: (request) => {
            markConsumed();
            mutation.reset();
            onClose();
            const to = searchHref('/tasks', { view: 'requests', param: request.id });
            notify({
              tone: 'success',
              message: TASK_REQUEST_COPY.created,
              durationMs: Number.POSITIVE_INFINITY,
              ...(navigate !== undefined && canLink(to)
                ? {
                    action: {
                      label: TASK_REQUEST_COPY.openRequest,
                      onAction: () => navigate(to),
                    },
                  }
                : {}),
            });
          },
        });
      }}
    />
  );
}

export function FindingRequestTaskDraftHost({
  findingId,
  finding,
  open,
  onClose,
}: FindingRequestTaskDraftHostProps): React.ReactElement | null {
  const { key, markConsumed } = useIdempotencyKey();

  if (!open || !finding || finding.id !== findingId) return null;

  return (
    <FindingRequestTaskDraftSubmission
      finding={finding}
      idempotencyKey={key}
      markConsumed={markConsumed}
      onClose={onClose}
    />
  );
}
