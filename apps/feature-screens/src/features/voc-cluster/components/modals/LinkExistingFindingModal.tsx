// Link an existing Finding from the cluster Managed System. Without the cluster
// system, disable the read instead of falling back to the unscoped inventory.

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@ap/ui';
import type * as React from 'react';
import { useState } from 'react';

import { useFindingsList } from '@/features/findings/hooks/useFindingsList';
import { useLinkExistingFindingToVocCluster } from '@/features/voc-cluster/hooks/useLinkExistingFindingToVocCluster';
import { errorMapper } from '@/lib/api/errorMapper';
import type { ApiError } from '@/lib/api/types';
import { useIdempotencyKey } from '@/lib/api/useIdempotencyKey';
import { useHostSeam } from '@/lib/host/host-seam';

const NO_FINDING = '__none__';

export function LinkExistingFindingModal({
  open,
  clusterId,
  managedSystemId,
  onClose,
}: {
  open: boolean;
  clusterId: string;
  managedSystemId?: string;
  onClose: () => void;
}): React.ReactElement {
  const { notifyError, notifySuccess } = useHostSeam();
  const [findingId, setFindingId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const findings = useFindingsList(managedSystemId, undefined, !!managedSystemId);
  const findingItems = managedSystemId ? (findings.data?.items ?? []) : [];
  const { key, markConsumed } = useIdempotencyKey();
  const mutation = useLinkExistingFindingToVocCluster({ idempotencyKey: key });
  function closeAndReset() {
    setFindingId('');
    setError(null);
    mutation.reset();
    onClose();
  }
  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    mutation.mutate(
      { clusterId, findingId },
      {
        onSuccess: () => {
          markConsumed();
          notifySuccess('Finding이 반복 VOC에 연결되었습니다.');
          closeAndReset();
        },
        onError: (err: ApiError) => {
          const message = errorMapper(err.envelope).message;
          setError(message);
          notifyError(message);
        },
      },
    );
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) closeAndReset();
      }}
    >
      <DialogContent data-testid="link-existing-finding-modal">
        <DialogHeader>
          <DialogTitle>기존 Finding 연결</DialogTitle>
        </DialogHeader>
        <form
          id="link-existing-finding-form"
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <Label htmlFor="cluster-finding-picker">Finding</Label>
          {findings.isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : findings.isError ? (
            <p className="text-sm text-accent-danger">연결 가능한 Finding을 불러오지 못했습니다.</p>
          ) : (
            <Select
              value={findingId || NO_FINDING}
              onValueChange={(value) => setFindingId(value === NO_FINDING ? '' : value)}
            >
              <SelectTrigger
                id="cluster-finding-picker"
                aria-label="Finding"
                aria-required="true"
                data-testid="link-existing-finding-picker"
                appearance="field"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_FINDING}>연결할 Finding을 선택하세요.</SelectItem>
                {findingItems.map((finding) => (
                  <SelectItem key={finding.id} value={finding.id}>
                    {finding.display_id} · {finding.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {error && (
            <p data-testid="link-existing-finding-error" className="text-sm text-accent-danger">
              {error}
            </p>
          )}
        </form>
        <DialogFooter spacing="compact">
          <Button
            type="button"
            variant="secondary"
            onClick={closeAndReset}
            disabled={mutation.isPending}
          >
            취소
          </Button>
          <Button
            type="submit"
            form="link-existing-finding-form"
            disabled={mutation.isPending || !managedSystemId || !findingId}
            data-testid="link-existing-finding-submit"
          >
            연결
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
