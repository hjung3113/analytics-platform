import { GLOSSARY } from '../../../lib/copy/glossary';
import { ManagedSystemPicker, type PickerOption } from '../../../ui/index';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldLabel,
  FormField,
  Input,
  useImeEnterGuard,
  useValidatedSubmit,
} from '@ap/ui';
import { useState } from 'react';

import type { AnalyticsAreaDto } from '../../../lib/api/registry-reads';
import type { UpdateAnalyticsAreaBody } from '../../../lib/api/registry-writes';
import { ArchiveConfirmButton } from '../lib/ArchiveConfirmButton';
import { ADMIN_REGISTRY_COPY } from '../../../lib/copy/admin-registry';
import { slugFormatError } from '../lib/fieldErrors';
import {
  useArchiveAnalyticsAreaMutation,
  useRegisterAnalyticsAreaMutation,
  useUpdateAnalyticsAreaMutation,
} from './useAnalyticsAreaMutations.js';

export function RegisterDialog({
  ctx,
  msOptions,
  onOpenChange,
  onSaved,
}: {
  ctx: { open: boolean; msId: string | null };
  msOptions: PickerOption[];
  onOpenChange: (v: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  return (
    <Dialog open={ctx.open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="aa-register-dialog">
        {ctx.open && (
          <RegisterForm
            key={ctx.msId ?? 'none'}
            msOptions={msOptions}
            initialMsId={ctx.msId}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RegisterForm({
  msOptions,
  initialMsId,
  onSaved,
}: {
  msOptions: PickerOption[];
  initialMsId: string | null;
  onSaved: () => Promise<void>;
}) {
  const ime = useImeEnterGuard();
  const [msId, setMsId] = useState<string | null>(initialMsId);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useRegisterAnalyticsAreaMutation({
    onSaved: async () => {
      setError(null);
      await onSaved();
    },
    onErrorMessage: (message, err) => {
      // A rejected slug format goes on the slug field, focused; anything else stays the dialog message (#3173, #2574 variant c).
      const badSlug = slugFormatError(err);
      create.setServerErrors(badSlug ? { slug: badSlug } : {});
      setError(badSlug ? null : message);
    },
  });
  const create = useValidatedSubmit<{ managedSystem: string | null; slug: string; name: string }>({
    validate: (values) => ({
      ...(values.managedSystem ? {} : { managedSystem: '시스템을 선택해 주세요.' }),
      ...(values.slug.trim() ? {} : { slug: ADMIN_REGISTRY_COPY.slugRequired }),
      ...(values.name.trim() ? {} : { name: ADMIN_REGISTRY_COPY.nameRequired }),
    }),
    onValid: ({ managedSystem, slug: nextSlug, name: nextName }) => {
      if (managedSystem) mutation.mutate({ managed_system_id: managedSystem, slug: nextSlug, name: nextName });
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>분석 영역 생성</DialogTitle>
        <DialogDescription>
          시스템 하위에 새 분석 영역을 등록합니다.
        </DialogDescription>
      </DialogHeader>
      <form onKeyDown={ime.onKeyDown} onCompositionStart={ime.onCompositionStart} onCompositionEnd={ime.onCompositionEnd}
        data-testid="create-analytics-area-form"
        className="space-y-3"
        noValidate
        onSubmit={(e) => {
          setError(null);
          create.handleSubmit({ managedSystem: msId, slug, name })(e);
        }}
      >
        {/* A fieldset (biome's useSemanticElements rejects a div with role="group"). The first-invalid focus lands on it (tabIndex
            -1) and it hands focus to the chosen system option (else the first), so the user can choose at once; the options stay the tab stops. */}
        <fieldset
          className="grid gap-1.5"
          tabIndex={-1}
          onFocus={(event) => {
            if (event.target !== event.currentTarget) return;
            const options = event.currentTarget;
            (options.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ?? options.querySelector<HTMLElement>('[role="radio"]'))?.focus();
          }}
          aria-labelledby="aa-create-managed-system-label"
          aria-describedby={create.errors.managedSystem ? 'aa-create-managed-system-error' : undefined}
          {...(create.errors.managedSystem ? { 'aria-invalid': true } : {})}
          aria-required="true"
        >
          <FieldLabel id="aa-create-managed-system-label" required requiredMark="text">
            시스템
          </FieldLabel>
          <ManagedSystemPicker
            options={msOptions}
            value={msId}
            onChange={(next) => {
              setMsId(next);
              create.clearError('managedSystem');
            }}
            testId="create-ms-picker"
          />
          {create.errors.managedSystem && (
            <p id="aa-create-managed-system-error" className="text-xs text-text-danger-label break-keep">
              {create.errors.managedSystem}
            </p>
          )}
        </fieldset>
        <FormField id="aa-create-slug" label="슬러그" required requiredMark="text" error={create.errors.slug}>
          {(control) => (
            <Input
              {...control}
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                create.clearError('slug');
              }}
              data-testid="create-aa-slug"
            />
          )}
        </FormField>
        <FormField id="aa-create-name" label="이름" required requiredMark="text" error={create.errors.name}>
          {(control) => (
            <Input
              {...control}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                create.clearError('name');
              }}
              data-testid="create-aa-name"
            />
          )}
        </FormField>
        {error && (
          <p data-testid="create-aa-error" className="text-sm text-accent-danger">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="submit" disabled={mutation.isPending} data-testid="create-aa-submit">
            등록
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function EditDialog({
  target,
  onOpenChange,
  onCloseAutoFocus,
  onSaved,
}: {
  target: AnalyticsAreaDto | null;
  onOpenChange: (v: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onSaved: () => Promise<void>;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="aa-edit-dialog"
        {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
      >
        {target && <EditForm key={target.id} target={target} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  target,
  onSaved,
}: {
  target: AnalyticsAreaDto;
  onSaved: () => Promise<void>;
}) {
  const ime = useImeEnterGuard();
  const [name, setName] = useState(target.name);
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useUpdateAnalyticsAreaMutation({
    targetId: target.id,
    onSaved: async () => {
      setError(null);
      await onSaved();
    },
    onErrorMessage: setError,
  });

  const archiveMutation = useArchiveAnalyticsAreaMutation({
    targetId: target.id,
    onSaved: async () => {
      setError(null);
      await onSaved();
    },
    onErrorMessage: setError,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{target.name} 편집</DialogTitle>
        <DialogDescription>
          <span className="font-mono text-xs">analytics-area/{target.slug}</span>
        </DialogDescription>
      </DialogHeader>
      <form onKeyDown={ime.onKeyDown} onCompositionStart={ime.onCompositionStart} onCompositionEnd={ime.onCompositionEnd}
        data-testid={`edit-analytics-area-form-${target.slug}`}
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const body: UpdateAnalyticsAreaBody = {};
          if (name !== target.name) body.name = name;
          updateMutation.mutate(body);
        }}
      >
        <div className="space-y-1">
          <FieldLabel htmlFor={`aa-edit-name-${target.slug}`} tone="secondary">
            이름
          </FieldLabel>
          <Input
            id={`aa-edit-name-${target.slug}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid={`aa-name-input-${target.slug}`}
          />
        </div>
        {error && (
          <p data-testid={`aa-row-error-${target.slug}`} className="text-sm text-accent-danger">
            {error}
          </p>
        )}
        <DialogFooter className="justify-between">
          {target.archived_at === null ? (
            <ArchiveConfirmButton
              name={target.name}
              disabled={archiveMutation.isPending}
              onConfirm={() => archiveMutation.mutate()}
              testId={`aa-archive-${target.slug}`}
            />
          ) : (
            <span className="text-sm text-text-muted">이미 보관됨</span>
          )}
          <Button
            type="submit"
            disabled={updateMutation.isPending}
            data-testid={`aa-save-${target.slug}`}
          >
            {GLOSSARY.save}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
