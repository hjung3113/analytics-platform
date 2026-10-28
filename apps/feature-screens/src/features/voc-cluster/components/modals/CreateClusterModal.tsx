// CreateClusterModal: the "Cluster 생성" dialog. It reports the new cluster id; where to go next is the host screen's call.

import { useCreateVocCluster } from '@/features/voc-cluster/hooks/useCreateVocCluster';
import { errorMapper } from '@/lib/api/errorMapper';
import { fetchCapabilityScopeViaClient } from '@/lib/api/permission-reads';
import { fetchManagedSystems } from '@/lib/api/registry-reads';
import { type ApiError, isPermissionDenied } from '@/lib/api/types';
import { CLUSTER_CREATE_COPY } from '@/lib/copy/voc-cluster';
import { useHostSeam } from '@/lib/host/host-seam';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@ap/ui';
import type { CreateVocClusterRequest } from '@fops/shared';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useState } from 'react';

const NO_MANAGED_SYSTEM = '__none__';

export function CreateClusterModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}): React.ReactElement {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [managedSystemId, setManagedSystemId] = useState('');
  const [managedSystemError, setManagedSystemError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const managedSystemTriggerRef = React.useRef<HTMLButtonElement>(null);

  const systemsQuery = useQuery({
    queryKey: ['managed-systems', { includeArchived: false }] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: false, signal }),
    retry: false,
  });

  // Same capability the backend checks on create (finding.manage). Narrowing is UX only;
  // while the scope is pending the picker is disabled; if the scope query errors every system
  // stays listed and the server stays the authority (a 403 shows CLUSTER_CREATE_COPY.denied).
  const scopeQuery = useQuery({
    queryKey: ['permission-scope', 'finding.manage'] as const,
    queryFn: ({ signal }) => fetchCapabilityScopeViaClient('finding.manage', { signal }),
    enabled: open,
    retry: false,
  });
  const scope = scopeQuery.data?.scope;
  const allowedSystems = (systemsQuery.data?.items ?? []).filter(
    (s) => scope?.kind !== 'scoped' || scope.managed_system_ids.includes(s.id),
  );
  // A selection made before the scope narrowed counts as empty.
  const selectedSystemId = allowedSystems.some((s) => s.id === managedSystemId)
    ? managedSystemId
    : '';

  const { notifyError } = useHostSeam();
  const mutation = useCreateVocCluster();

  function closeAndReset() {
    setTitle('');
    setSummary('');
    setManagedSystemId('');
    setManagedSystemError(null);
    setError(null);
    mutation.reset();
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (selectedSystemId === '') {
      setManagedSystemError('Managed System을 선택하세요.');
      managedSystemTriggerRef.current?.focus();
      return;
    }
    setManagedSystemError(null);
    const body: CreateVocClusterRequest = {
      title,
      primary_managed_system_id: selectedSystemId,
      ...(summary.trim() ? { summary } : {}),
    };
    mutation.mutate(body, {
      onSuccess: (cluster) => {
        closeAndReset();
        onCreated(cluster.id);
      },
      onError: (err: ApiError) => {
        const permissionDenied: boolean = isPermissionDenied(err);
        const message = permissionDenied
          ? CLUSTER_CREATE_COPY.denied
          : errorMapper(err.envelope).message;
        setError(message);
        notifyError(message);
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) closeAndReset();
      }}
    >
      <DialogContent data-testid="create-cluster-modal">
        <DialogHeader>
          <DialogTitle>Cluster 생성</DialogTitle>
        </DialogHeader>
        <form
          id="create-cluster-form"
          data-testid="create-cluster-form"
          className="flex flex-col gap-4"
          onSubmit={handleSubmit}
        >
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="cluster-title" tone="secondary">
              제목 <span aria-hidden>*</span>
            </FieldLabel>
            <Input
              id="cluster-title"
              required
              value={title}
              placeholder="Cluster 제목을 입력하세요."
              onChange={(e) => setTitle(e.target.value)}
              data-testid="cluster-title-input"
            />
          </div>

          {/* Summary */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="cluster-summary" tone="secondary">
              요약 (선택)
            </FieldLabel>
            <Textarea
              id="cluster-summary"
              rows={3}
              value={summary}
              placeholder="Cluster에 대한 간단한 설명을 입력하세요."
              onChange={(e) => setSummary(e.target.value)}
              data-testid="cluster-summary-input"
            />
          </div>

          {/* Managed System */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="cluster-managed-system" tone="secondary">
              Managed System <span aria-hidden>*</span>
            </FieldLabel>
            <Select
              value={selectedSystemId || NO_MANAGED_SYSTEM}
              disabled={scopeQuery.isPending}
              onValueChange={(value) => {
                setManagedSystemId(value === NO_MANAGED_SYSTEM ? '' : value);
                setManagedSystemError(null);
              }}
            >
              <SelectTrigger
                ref={managedSystemTriggerRef}
                id="cluster-managed-system"
                aria-label="Managed System"
                aria-required="true"
                aria-invalid={managedSystemError !== null}
                {...(managedSystemError
                  ? { 'aria-describedby': 'cluster-managed-system-error' }
                  : {})}
                data-testid="cluster-managed-system-select"
                appearance="field"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_MANAGED_SYSTEM}>시스템 선택…</SelectItem>
                {allowedSystems.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {managedSystemError ? (
              <p
                id="cluster-managed-system-error"
                role="alert"
                className="text-sm text-accent-danger"
              >
                {managedSystemError}
              </p>
            ) : null}
          </div>

          {error && (
            <p data-testid="create-cluster-error" className="text-sm text-accent-danger">
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
            data-testid="create-cluster-cancel"
          >
            취소
          </Button>
          <Button
            type="submit"
            form="create-cluster-form"
            disabled={mutation.isPending}
            data-testid="create-cluster-submit"
          >
            생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
