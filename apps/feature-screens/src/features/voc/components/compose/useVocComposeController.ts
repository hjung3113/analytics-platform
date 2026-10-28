import { errorMapper, mapUnknownError } from '@/lib/api/errorMapper';
import {
  fetchAnalyticsAreas,
  fetchManagedSystems,
  walkAnalyticsAreaPages,
} from '@/lib/api/registry-reads';
import type { ApiError, ApiErrorEnvelope } from '@/lib/api/types';
import { useIdempotencyKey } from '@/lib/api/useIdempotencyKey';
import { useHostSeam } from '@/lib/host/host-seam';
import {
  MAX_ATTACHMENT_IDS_PER_PARENT,
  createVocRequestSchema,
  emptyTipTapDoc,
  isTipTapDocBlank,
} from '@ap/feature-shared';
import type { CreateVocRequest } from '@ap/feature-shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useVocCreateMutation } from '../../hooks/useVocCreateMutation';
import { mergeAttachmentIds, normalizeAttachmentRefs } from './attachment-refs';
import { type VocComposeContextBlock, appendContextBlock } from './context-block';

export interface VocComposeSubmitted {
  vocId: string;
  displayId: string;
}

export function useVocComposeController({
  initialManagedSystemId,
  contextBlock,
  onSubmitted,
  onDirtyChange,
}: {
  initialManagedSystemId: string | null;
  contextBlock: VocComposeContextBlock;
  onSubmitted: (result: VocComposeSubmitted) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { notifyError, notifySuccess } = useHostSeam();

  const form = useForm<CreateVocRequest>({
    resolver: zodResolver(createVocRequestSchema),
    defaultValues: {
      primary_managed_system_id: '',
      title: '',
      description_rich_content: emptyTipTapDoc(),
      analytics_area_id: undefined,
      source_context: 'direct_use',
      attachment_ids: [],
    },
    mode: 'onBlur',
  });

  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();

  const [attachmentIds, setAttachmentIds] = React.useState<string[]>([]);
  const [attachmentsUploading, setAttachmentsUploading] = React.useState(false);
  const [attachmentErrorCount, setAttachmentErrorCount] = React.useState(0);
  const hasAttachmentErrors = attachmentErrorCount > 0;
  // Set when a submit attempt finds the merged attachment set over the per-parent cap; reflects the latest attempt.
  const [attachmentLimitExceeded, setAttachmentLimitExceeded] = React.useState(false);

  const mutation = useVocCreateMutation({
    idempotencyKey,
    onSuccess: (data) => {
      markConsumed();
      notifySuccess(`접수 완료: ${data.display_id}`);
      onDirtyChange(false);
      onSubmitted({ vocId: data.id, displayId: data.display_id });
    },
    onError: (err: ApiError) => {
      // A 401 already retired the bridge session (`onSessionLost`); the host shows the expiry state, not a toast.
      if (err.status === 401) return;
      if (err.code === 'validation.failed') {
        // Server field errors land on their fields.
        const fields = (err.detail as { fields?: unknown } | undefined)?.fields;
        if (Array.isArray(fields)) {
          let mapped = false;
          for (const f of fields) {
            const field = f as { path?: unknown; message?: string } | null;
            if (field && typeof field === 'object' && Array.isArray(field.path)) {
              const msg =
                field.message ??
                errorMapper({ code: 'validation.failed', message: '' } as ApiErrorEnvelope).message;
              form.setError(field.path.join('.') as keyof CreateVocRequest, { message: msg });
              mapped = true;
            }
          }
          if (mapped) return;
        }
      }
      notifyError(errorMapper(err.envelope).message);
    },
  });

  const msQuery = useQuery({
    queryKey: ['managed-systems', { includeArchived: false }],
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: false, signal }),
  });

  const [title, description, selectedMs, areaId, sourceContext] = form.watch([
    'title',
    'description_rich_content',
    'primary_managed_system_id',
    'analytics_area_id',
    'source_context',
  ]);

  // The Managed System the screen came from, applied once and only when the fetched list holds it (ADR-0070
  // decision 5: no guess from a screen name). It is the form's initial value, so it does not make the draft dirty.
  const [defaultManagedSystemId, setDefaultManagedSystemId] = React.useState('');
  const defaultResolved = React.useRef(false);
  const managedSystems = msQuery.data?.items;
  React.useEffect(() => {
    if (defaultResolved.current || managedSystems === undefined) return;
    defaultResolved.current = true;
    if (
      initialManagedSystemId !== null &&
      managedSystems.some((ms) => ms.id === initialManagedSystemId)
    ) {
      setDefaultManagedSystemId(initialManagedSystemId);
      form.setValue('primary_managed_system_id', initialManagedSystemId, { shouldValidate: true });
    }
  }, [managedSystems, initialManagedSystemId, form]);

  // Same cache entry as the admin catalog (`analyticsAreasCatalogQuery`), read through `registry-reads` (bridge-safe).
  const aaQuery = useQuery({
    queryKey: ['analytics-areas', 'catalog', selectedMs || 'all'] as const,
    queryFn: ({ signal }) =>
      walkAnalyticsAreaPages(fetchAnalyticsAreas, {
        signal,
        includeArchived: true,
        ...(selectedMs ? { managedSystemId: selectedMs } : {}),
      }),
    select: (catalog) => ({
      ...catalog,
      items: catalog.items.filter((area) => area.archived_at === null),
    }),
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(selectedMs),
  });

  // A different Managed System invalidates the chosen Area.
  const prevMsRef = React.useRef(selectedMs);
  React.useEffect(() => {
    if (prevMsRef.current !== selectedMs) {
      prevMsRef.current = selectedMs;
      form.setValue('analytics_area_id', undefined);
    }
  }, [selectedMs, form]);

  // Dirty = a field differs from its initial value or an attachment exists; the Context block never counts.
  const dirty =
    title !== '' ||
    !isTipTapDocBlank(description) ||
    selectedMs !== defaultManagedSystemId ||
    areaId !== undefined ||
    sourceContext !== 'direct_use' ||
    attachmentIds.length > 0 ||
    attachmentsUploading ||
    attachmentErrorCount > 0;
  React.useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const msOptions = (managedSystems ?? []).map((ms) => ({
    id: ms.id,
    label: ms.name,
    slug: ms.slug,
    archived: ms.archived_at !== null,
  }));
  const aaOptions = (aaQuery.data?.items ?? []).map((aa) => ({
    id: aa.id,
    label: aa.name,
    archived: aa.archived_at !== null,
  }));

  // `contextBlock` is read when the form is submitted, so a chip removed after typing leaves the typed values alone.
  function handleSubmit(body: CreateVocRequest): void {
    const { doc, ids: editorIds } = normalizeAttachmentRefs(body.description_rich_content);
    const mergedIds = mergeAttachmentIds(editorIds, attachmentIds);
    if (mergedIds.length > MAX_ATTACHMENT_IDS_PER_PARENT) {
      // Over the server's per-parent cap: no request, no silent drop of ids — the draft stays as it is
      // and the screen shows the form-level error until the next submit attempt.
      setAttachmentLimitExceeded(true);
      return;
    }
    setAttachmentLimitExceeded(false);
    mutation.mutate({
      ...body,
      description_rich_content: appendContextBlock(doc, contextBlock),
      attachment_ids: mergedIds,
    });
  }

  function handleAttachmentError(err: unknown): void {
    if ((err as ApiError | null)?.status === 401) return;
    notifyError(mapUnknownError(err).message);
  }

  return {
    form,
    msQuery,
    selectedMs,
    aaQuery,
    msOptions,
    aaOptions,
    isSubmitting: mutation.isPending,
    attachmentsUploading,
    hasAttachmentErrors,
    attachmentLimitExceeded,
    setAttachmentIds,
    setAttachmentsUploading,
    setAttachmentErrorCount,
    handleSubmit,
    handleAttachmentError,
    notifyError,
  };
}
