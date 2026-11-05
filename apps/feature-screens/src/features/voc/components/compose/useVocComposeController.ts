import { errorMapper, mapUnknownError } from '@/lib/api/errorMapper';
import {
  fetchAnalyticsAreas,
  fetchManagedSystems,
  walkAnalyticsAreaPages,
} from '@/lib/api/registry-reads';
import type { ApiError, ApiErrorEnvelope } from '@/lib/api/types';
import { VOC_CREATE_TARGETS_QUERY_KEY, fetchVocCreateTargets } from '@/lib/api/voc-create-targets';
import { VOC_CREATE_COPY } from '@/lib/copy/voc';
import { useIdempotencyKey } from '@/lib/api/useIdempotencyKey';
import { useHostSeam } from '@/lib/host/host-seam';
import {
  MAX_ATTACHMENT_IDS_PER_PARENT,
  createVocRequestSchema,
  emptyTipTapDoc,
  isTipTapDocBlank,
} from '@ap/feature-shared';
import type { CreateVocRequest, TipTapDoc } from '@ap/feature-shared';
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

/**
 * A report filed from a screen's error view (#606). `title`/`body` are the initial field values (they do not make the draft dirty); `traceId`
 * is read at submit, so it is null once the user removed the trace chip and the request then carries no `trace_id`.
 */
export interface VocComposeErrorReport {
  title: string;
  body: string;
  hint: string;
  traceId: string | null;
}

const paragraphDoc = (text: string): TipTapDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

export function useVocComposeController({
  initialManagedSystemId,
  contextBlock,
  errorReport,
  onSubmitted,
  onDirtyChange,
}: {
  initialManagedSystemId: string | null;
  contextBlock: VocComposeContextBlock;
  errorReport?: VocComposeErrorReport | undefined;
  onSubmitted: (result: VocComposeSubmitted) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { notifyError, notifySuccess } = useHostSeam();

  // The prefill is the form's initial value, taken once when the draft starts; a later change of `errorReport` never rewrites typed text.
  const [initialDoc] = React.useState<TipTapDoc>(() => (errorReport ? paragraphDoc(errorReport.body) : emptyTipTapDoc()));
  const [initialTitle] = React.useState(() => errorReport?.title ?? '');
  const form = useForm<CreateVocRequest>({
    resolver: zodResolver(createVocRequestSchema),
    defaultValues: {
      primary_managed_system_id: '',
      title: initialTitle,
      description_rich_content: initialDoc,
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

  // A submit-time 403 belongs to the system that was submitted. `settledAt` is the targets answer that followed it; only a newer answer can end the failure early.
  const [deniedSubmit, setDeniedSubmit] = React.useState<{ systemId: string; settledAt: number | null } | null>(null);
  const submittedMs = React.useRef('');
  // The targets are a pre-check only: while loading or failed nothing is blocked (the server decides at submit).
  const targetsQuery = useQuery({
    queryKey: VOC_CREATE_TARGETS_QUERY_KEY,
    queryFn: ({ signal }) => fetchVocCreateTargets(signal),
    staleTime: 15 * 1000,
    refetchOnMount: 'always',
    retry: false,
  });
  const deniedIds = new Set(
    (targetsQuery.data ?? []).filter((target) => !target.allowed).map((target) => target.managed_system_id),
  );

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
      if (err.status === 403 && err.code === 'permission.denied') {
        // #1358: shown inline under the picker, not as a generic failure toast; the refreshed targets mark the system closed.
        const systemId = submittedMs.current;
        setDeniedSubmit({ systemId, settledAt: null });
        void targetsQuery.refetch().then((result) => {
          setDeniedSubmit((current) => (current?.systemId === systemId && current.settledAt === null ? { systemId, settledAt: result.dataUpdatedAt } : current));
        });
        return;
      }
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
  // The host's lookup can answer after the list does (#1289 node j), so a null `initialManagedSystemId` keeps the default open; it closes
  // once applied, or once the user has chosen a system first (a late default never overwrites a selection).
  const [defaultManagedSystemId, setDefaultManagedSystemId] = React.useState('');
  const defaultResolved = React.useRef(false);
  const managedSystems = msQuery.data?.items;
  React.useEffect(() => {
    if (defaultResolved.current || managedSystems === undefined) return;
    if (selectedMs !== '') {
      defaultResolved.current = true;
      return;
    }
    if (initialManagedSystemId === null) return;
    defaultResolved.current = true;
    if (managedSystems.some((ms) => ms.id === initialManagedSystemId)) {
      setDefaultManagedSystemId(initialManagedSystemId);
      form.setValue('primary_managed_system_id', initialManagedSystemId, { shouldValidate: true });
    }
  }, [managedSystems, initialManagedSystemId, selectedMs, form]);

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
    title !== initialTitle ||
    (errorReport ? JSON.stringify(description) !== JSON.stringify(initialDoc) : !isTipTapDocBlank(description)) ||
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
    ...(deniedIds.has(ms.id) ? { disabled: true, title: VOC_CREATE_COPY.createDenied } : {}),
  }));
  const selectedDenied = deniedIds.has(selectedMs);
  // Another selection ends that failure; so does a targets answer newer than the one after the 403 that lists the system as allowed.
  const recovered =
    deniedSubmit?.settledAt != null && targetsQuery.dataUpdatedAt > deniedSubmit.settledAt && targetsQuery.data !== undefined && !deniedIds.has(deniedSubmit.systemId);
  React.useEffect(() => {
    if (deniedSubmit !== null && (selectedMs !== deniedSubmit.systemId || recovered)) setDeniedSubmit(null);
  }, [deniedSubmit, selectedMs, recovered]);
  const showCreateDenied = selectedDenied || (selectedMs !== '' && deniedSubmit?.systemId === selectedMs && !recovered);
  const hasDeniedOption = deniedIds.size > 0;
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
    submittedMs.current = body.primary_managed_system_id;
    mutation.mutate({
      ...body,
      description_rich_content: appendContextBlock(doc, contextBlock),
      attachment_ids: mergedIds,
      ...(errorReport?.traceId ? { trace_id: errorReport.traceId } : {}),
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
    selectedDenied,
    showCreateDenied,
    hasDeniedOption,
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
