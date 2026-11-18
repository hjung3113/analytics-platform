// Create a Finding from a VOC Cluster. Local form (not the cross-system
// CreateFindingModal): this flow is VOC-cluster origin and has its own
// analytics-free severity picker. Its mutation invalidates the Findings list
// before the success path navigates to the new Finding — or, where the host
// cannot open Findings (the platform until #763), closes with a success notice.

import { FINDING_SEVERITY_LABELS } from '../../../../lib/copy/enum-labels';
import type { CreateFindingRequest, VocClusterDto } from '@ap/feature-shared';
import { createFindingRequestSchema, findingSeveritySchema } from '@ap/feature-shared';
import {
  Button,
  Checkbox,
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
  useImeEnterGuard,
} from '@ap/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import type * as React from 'react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { useCreateFindingFromCluster } from '../../hooks/useCreateFindingFromCluster';
import { errorMapper } from '../../../../lib/api/errorMapper';
import type { ApiError } from '../../../../lib/api/types';
import { useIdempotencyKey } from '../../../../lib/api/useIdempotencyKey';
import { useHostNavigate, useHostSeam } from '../../../../lib/host/host-seam';

// ── Severity options (mirrors CreateFindingModal) ─────────────────────────────
// Built inside the component: FINDING_SEVERITY_LABELS re-exports src/ui, and
// evaluating it at module init breaks when this file loads early in the route
// tree import chain (RouteFallback.test hit it via voc-clusters).
const EMPTY_CLUSTER_MEMBERS: NonNullable<VocClusterDto['members']> = [];

export function CreateFindingFromClusterModal({
  open,
  cluster,
  onClose,
}: {
  open: boolean;
  cluster: Pick<VocClusterDto, 'id' | 'title' | 'summary' | 'members'>;
  onClose: () => void;
}): React.ReactElement {
  const ime = useImeEnterGuard();
  const navigate = useHostNavigate();
  const { canLink, notifyError, notifySuccess } = useHostSeam();
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();
  const mutation = useCreateFindingFromCluster({ idempotencyKey });
  const members = cluster.members ?? EMPTY_CLUSTER_MEMBERS;
  const [selectedEvidenceVocIds, setSelectedEvidenceVocIds] = useState<string[]>([]);

  const severityOptions = findingSeveritySchema.options.map((value) => ({
    value,
    label: FINDING_SEVERITY_LABELS[value],
  }));
  const form = useForm<CreateFindingRequest>({
    resolver: zodResolver(createFindingRequestSchema),
    defaultValues: {
      title: '',
      summary: '',
      severity: 'medium',
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      title: cluster.title,
      summary: cluster.summary ?? '',
      severity: 'medium',
    });
    setSelectedEvidenceVocIds(members.map((member) => member.voc_id));
  }, [open, cluster.id, cluster.title, cluster.summary, members, form]);

  function closeAndReset() {
    form.reset({
      title: cluster.title,
      summary: cluster.summary ?? '',
      severity: 'medium',
    });
    setSelectedEvidenceVocIds([]);
    mutation.reset();
    onClose();
  }

  function handleSubmit(values: CreateFindingRequest) {
    const selectedIds = new Set(selectedEvidenceVocIds);
    const evidenceVocIds = members
      .filter((member) => selectedIds.has(member.voc_id))
      .map((member) => member.voc_id);
    mutation.mutate(
      {
        clusterId: cluster.id,
        body: { ...values, evidence_voc_ids: evidenceVocIds },
      },
      {
        onSuccess: (finding) => {
          markConsumed();
          form.reset({
            title: cluster.title,
            summary: cluster.summary ?? '',
            severity: 'medium',
          });
          setSelectedEvidenceVocIds([]);
          mutation.reset();
          onClose();
          const findingPath = `/findings/${finding.id}`;
          if (canLink(findingPath)) navigate(findingPath);
          else notifySuccess(`Finding이 생성되었습니다. 근거 VOC ${evidenceVocIds.length}건을 연결했습니다.`);
        },
        onError: (err: ApiError) => {
          notifyError(errorMapper(err.envelope).message);
        },
      },
    );
  }

  const isSubmitting = mutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !mutation.isPending) closeAndReset();
      }}
    >
      <DialogContent className="max-w-lg" data-testid="create-finding-from-cluster-modal">
        <DialogHeader>
          <DialogTitle>Finding 생성</DialogTitle>
        </DialogHeader>

        <form
          onKeyDown={ime.onKeyDown}
          onCompositionStart={ime.onCompositionStart}
          onCompositionEnd={ime.onCompositionEnd}
          id="create-finding-from-cluster-form"
          data-testid="create-finding-from-cluster-form"
          onSubmit={form.handleSubmit(handleSubmit)}
          noValidate
          className="flex flex-col gap-4"
        >
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="cluster-finding-title">
              제목
            </FieldLabel>
            <Input
              id="cluster-finding-title"
              placeholder="Finding을 한 줄로 요약하세요."
              {...form.register('title')}
              aria-invalid={Boolean(form.formState.errors.title)}
              data-testid="cluster-finding-title-input"
            />
            {form.formState.errors.title?.message && (
              <p className="text-xs text-text-danger" role="alert">
                {form.formState.errors.title.message}
              </p>
            )}
          </div>

          {/* Summary */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="cluster-finding-summary">
              요약
            </FieldLabel>
            <Textarea
              id="cluster-finding-summary"
              placeholder="어떤 문제가 있고 왜 실행해야 하는지 설명하세요."
              rows={4}
              {...form.register('summary')}
              aria-invalid={Boolean(form.formState.errors.summary)}
              data-testid="cluster-finding-summary-input"
            />
            {form.formState.errors.summary?.message && (
              <p className="text-xs text-text-danger" role="alert">
                {form.formState.errors.summary.message}
              </p>
            )}
          </div>

          {members.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">
                근거로 가져올 VOC {selectedEvidenceVocIds.length}건
              </legend>
              {members.map((member) => {
                const isSelected = selectedEvidenceVocIds.includes(member.voc_id);
                const checkboxId = `cluster-evidence-${member.voc_id}`;
                return (
                  <div key={member.voc_id} className="flex items-center gap-2">
                    <Checkbox
                      id={checkboxId}
                      checked={isSelected}
                      disabled={isSubmitting}
                      onCheckedChange={(checked) => {
                        setSelectedEvidenceVocIds((current) => {
                          if (checked === true) {
                            return current.includes(member.voc_id)
                              ? current
                              : [...current, member.voc_id];
                          }
                          return current.filter((vocId) => vocId !== member.voc_id);
                        });
                      }}
                    />
                    <label htmlFor={checkboxId} className="text-sm">
                      {member.display_id ? `${member.display_id} · ` : ''}
                      {member.title ?? member.voc_id}
                    </label>
                  </div>
                );
              })}
            </fieldset>
          )}

          {/* Severity */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="cluster-finding-severity">
              심각도
            </FieldLabel>
            <Select
              defaultValue="medium"
              onValueChange={(val) =>
                form.setValue('severity', val as CreateFindingRequest['severity'], {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger
                id="cluster-finding-severity"
                data-testid="cluster-finding-severity-select"
              >
                <SelectValue placeholder="심각도 선택" />
              </SelectTrigger>
              <SelectContent>
                {severityOptions.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    data-testid={`severity-option-${opt.value}`}
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.severity?.message && (
              <p className="text-xs text-text-danger" role="alert">
                {form.formState.errors.severity.message}
              </p>
            )}
          </div>
        </form>

        <DialogFooter spacing="compact">
          <Button
            type="button"
            variant="secondary"
            onClick={closeAndReset}
            disabled={isSubmitting}
            data-testid="create-finding-from-cluster-cancel"
          >
            취소
          </Button>
          <Button
            type="submit"
            form="create-finding-from-cluster-form"
            disabled={isSubmitting}
            data-testid="create-finding-from-cluster-submit"
          >
            Finding 생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
