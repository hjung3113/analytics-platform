// VocComposeScreen — the VOC form for the platform's `VOC 등록` drawer (platform ADR-0070 decisions 4–5, ADR-0071).
//
// One column for a 360–520px container (no viewport breakpoints). It is the only VOC creation screen: no router, no
// `@/lib/api` barrel, no reporter card and no similar/semantic panels. The host seam carries the toasts.

import { mapUnknownError } from '@/lib/api/errorMapper';
import { uploadRichEditorAttachment } from '@/lib/attachments/rich-editor-upload';
import { VOC_CREATE_COPY } from '@/lib/copy/voc';
import { Button, FieldLabel, Input, RichEditor, Skeleton, type TipTapDoc } from '@ap/ui';
import { createVocRequestSchema, isTipTapDocBlank } from '@fops/shared';
import { AnalyticsAreaPicker, ManagedSystemPicker } from '@fops/ui';
import type * as React from 'react';
import { Controller } from 'react-hook-form';
import { AttachmentDropzone } from '../create/AttachmentDropzone';
import { SourceContextSegmented } from '../create/SourceContextSegmented';
import { vocDescriptionToolbar } from '../create/VocDescriptionToolbar';
import type { VocComposeContextBlock } from './context-block';
import { type VocComposeSubmitted, useVocComposeController } from './useVocComposeController';

export interface VocComposeScreenProps {
  /** Frozen screen Context for the `화면 정보` block, read when the form is submitted. */
  contextBlock: VocComposeContextBlock;
  /** Preselected only when the fetched Managed System list holds it; null leaves the choice to the user. */
  initialManagedSystemId: string | null;
  onSubmitted: (result: VocComposeSubmitted) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

export function VocComposeScreen({
  contextBlock,
  initialManagedSystemId,
  onSubmitted,
  onCancel,
  onDirtyChange,
}: VocComposeScreenProps): React.ReactElement {
  const {
    form,
    msQuery,
    selectedMs,
    aaQuery,
    msOptions,
    aaOptions,
    isSubmitting,
    attachmentsUploading,
    hasAttachmentErrors,
    attachmentLimitExceeded,
    setAttachmentIds,
    setAttachmentsUploading,
    setAttachmentErrorCount,
    handleSubmit,
    handleAttachmentError,
    notifyError,
  } = useVocComposeController({ initialManagedSystemId, contextBlock, onSubmitted, onDirtyChange });

  const [title, description, managedSystemId] = form.watch([
    'title',
    'description_rich_content',
    'primary_managed_system_id',
  ]);
  const missingRequired = [
    ...(title.trim() === '' ? [VOC_CREATE_COPY.titleField] : []),
    ...(isTipTapDocBlank(description) ? [VOC_CREATE_COPY.descriptionField] : []),
    ...(managedSystemId === '' ? [VOC_CREATE_COPY.managedSystemField] : []),
  ];

  // Read from the values, not `formState.isValid`: the Managed System default arrives after the user may have typed, and
  // react-hook-form leaves `isValid` stale for a value set that way.
  const valid = createVocRequestSchema.safeParse(form.getValues()).success;

  return (
    <div className="flex h-full flex-col">
      <form
        className="flex flex-1 flex-col gap-4 overflow-auto px-4 py-4"
        onSubmit={form.handleSubmit(handleSubmit)}
        noValidate
        id="voc-compose-form"
      >
        <div className="flex flex-col gap-2">
          <FieldLabel required htmlFor="compose-title">
            {VOC_CREATE_COPY.titleField}
          </FieldLabel>
          <Input
            id="compose-title"
            placeholder="겪으신 문제를 한 줄로 요약해 주세요"
            {...form.register('title')}
            aria-invalid={Boolean(form.formState.errors.title)}
          />
          {form.formState.errors.title?.message && (
            <p className="text-xs text-text-danger">{form.formState.errors.title.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <FieldLabel
            required
            htmlFor="description_rich_content"
            tip="겪으신 일을 시간 순서대로 적어주시면 도움이 됩니다"
          >
            {VOC_CREATE_COPY.descriptionField}
          </FieldLabel>
          <Controller
            control={form.control}
            name="description_rich_content"
            render={({ field }) => (
              <RichEditor
                surface="voc-description"
                value={field.value as TipTapDoc}
                onChange={(doc) => field.onChange(doc)}
                placeholder="VOC 내용을 자세히 적어주세요"
                minHeight={160}
                toolbar={vocDescriptionToolbar({ onAttachError: handleAttachmentError })}
                onAttach={uploadRichEditorAttachment}
              />
            )}
          />
          {form.formState.errors.description_rich_content?.message && (
            <p className="text-xs text-text-danger">
              {form.formState.errors.description_rich_content.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <FieldLabel
            appearance="section"
            tip="기본은 직접 사용. 다른 팀원·고객사 경험을 대신 등록할 때는 대신 보고."
          >
            <span id="compose-source-context-label">출처</span>
          </FieldLabel>
          {/* The options wrap onto a second row in a narrow drawer instead of scrolling or clipping. */}
          <Controller
            control={form.control}
            name="source_context"
            render={({ field }) => (
              <SourceContextSegmented
                value={field.value}
                onChange={field.onChange}
                labelId="compose-source-context-label"
                testId="source-context-segmented"
                className="flex-wrap"
              />
            )}
          />
          <p className="text-xs text-text-muted">{VOC_CREATE_COPY.proxyReportHint}</p>
        </div>

        <div className="flex flex-col gap-2">
          <FieldLabel
            required
            htmlFor="primary_managed_system_id"
            appearance="section"
            tip="제출 후 변경할 수 없습니다. 어느 시스템에 대한 VOC인지 정확히 골라주세요."
          >
            {VOC_CREATE_COPY.managedSystemField}
          </FieldLabel>
          {msQuery.isLoading ? (
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-32" />
            </div>
          ) : msQuery.isError ? (
            <p className="text-sm text-text-danger">{mapUnknownError(msQuery.error).message}</p>
          ) : msOptions.length === 0 ? (
            <p className="text-sm text-text-muted">선택할 수 있는 Managed System이 없습니다</p>
          ) : (
            <Controller
              control={form.control}
              name="primary_managed_system_id"
              render={({ field }) => (
                <ManagedSystemPicker
                  options={msOptions}
                  value={field.value || null}
                  onChange={(id) => field.onChange(id ?? '')}
                  placeholder="Managed System 선택"
                  testId="ms-picker"
                />
              )}
            />
          )}
          {form.formState.errors.primary_managed_system_id?.message && (
            <p className="text-xs text-text-danger">
              {form.formState.errors.primary_managed_system_id.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <FieldLabel
            htmlFor="analytics_area_id"
            appearance="section"
            tip="선택사항. 선택한 Managed System 안의 Analytics Area만 고를 수 있어요."
          >
            ANALYTICS AREA
          </FieldLabel>
          {selectedMs && aaQuery.isLoading ? (
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-32" />
            </div>
          ) : (
            <Controller
              control={form.control}
              name="analytics_area_id"
              render={({ field }) => (
                <AnalyticsAreaPicker
                  options={aaOptions}
                  value={field.value ?? null}
                  onChange={(id) => field.onChange(id ?? undefined)}
                  disabled={!selectedMs}
                  placeholder="Analytics Area 선택"
                  testId="aa-picker"
                />
              )}
            />
          )}
          {form.formState.errors.analytics_area_id?.message && (
            <p className="text-xs text-text-danger">
              {form.formState.errors.analytics_area_id.message}
            </p>
          )}
          <p className="text-xs text-text-muted">{VOC_CREATE_COPY.analyticsAreaHint}</p>
        </div>

        <AttachmentDropzone
          testId="attachment-dropzone"
          onChange={setAttachmentIds}
          onUploadingChange={setAttachmentsUploading}
          onErrorCountChange={setAttachmentErrorCount}
          notifyError={notifyError}
        />
      </form>

      {hasAttachmentErrors && (
        <div
          role="alert"
          data-testid="attachment-submit-blocked-alert"
          className="mx-4 mb-2 rounded-md border border-border-subtle bg-surface-card px-3 py-2 text-sm text-text-danger shadow-sm"
        >
          첨부 파일에 오류가 있어 제출할 수 없습니다. 빨간색으로 표시된 파일을 제거하거나 다른
          파일로 교체해 주세요.
        </div>
      )}

      {attachmentLimitExceeded && (
        <div
          role="alert"
          data-testid="attachment-limit-alert"
          className="mx-4 mb-2 rounded-md border border-border-subtle bg-surface-card px-3 py-2 text-sm text-text-danger shadow-sm"
        >
          {VOC_CREATE_COPY.attachmentLimit}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border-subtle bg-surface-card px-4 py-3 shadow-sm">
        {missingRequired.length > 0 && (
          <span
            id="voc-compose-missing"
            data-testid="voc-submit-missing"
            className="text-xs text-text-muted"
          >
            {VOC_CREATE_COPY.requiredFieldsPrefix}
            {missingRequired.join(', ')}
          </span>
        )}
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="subtle" onClick={onCancel} disabled={isSubmitting}>
            취소
          </Button>
          <Button
            type="submit"
            form="voc-compose-form"
            {...(missingRequired.length > 0 ? { 'aria-describedby': 'voc-compose-missing' } : {})}
            disabled={!valid || isSubmitting || attachmentsUploading || hasAttachmentErrors}
          >
            VOC 제출
          </Button>
        </div>
      </div>
    </div>
  );
}
