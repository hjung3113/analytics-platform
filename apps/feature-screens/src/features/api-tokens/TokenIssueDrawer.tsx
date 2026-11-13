import { type FormEvent, type ReactNode, type RefObject, useId, useRef, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { type ActorListItem, visibleApiTokenScopeBundles } from '@ap/feature-shared';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, Callout, Checkbox, Input,
  Label, RadioGroup, RadioGroupItem,
} from '@ap/ui';
import { GroupedSelectionList } from '@ap/ui';
import { tokenSelectionGroups } from '@/lib/copy/permission-selection';
import { Copy } from 'lucide-react';
import { useHostUnsavedGuard } from '@/lib/host/host-seam';
import { issueApiToken } from '@/lib/api/api-tokens';
import { mapUnknownError } from '@/lib/api/errorMapper';
import { ApiError } from '@/lib/api/types';
import { API_TOKEN_COPY as COPY } from '@/lib/copy/api-tokens';
import { draftRecord, draftString, draftStrings, useSessionDraft } from '@/lib/session-draft/useSessionDraft';
import type { ApiTokenDrawerParts } from './ApiTokensScreen';

type Field = { path: string; message: string };
const EXPIRY_CHOICES = ['30', '90', 'custom', 'never'] as const;
function validationFields(error: unknown): Field[] {
  if (!(error instanceof ApiError) || error.code !== 'validation.failed' || !Array.isArray(error.detail?.fields)) return [];
  return error.detail.fields.flatMap((field: unknown) => {
    if (!field || typeof field !== 'object') return [];
    const value = field as Record<string, unknown>;
    const path = Array.isArray(value.path) ? value.path.join('.') : String(value.path ?? '');
    // A server code maps to existing copy; an unknown code is never printed raw.
    const mapped = typeof value.code === 'string' ? COPY.fieldCodes[value.code] : undefined;
    return [{ path, message: typeof value.message === 'string' ? value.message : (mapped ?? COPY.fieldInvalid) }];
  }).filter((field, index, all) => all.findIndex(other => other.path === field.path && other.message === field.message) === index);
}

export function TokenIssueDrawer({ service, actors, renderDrawer, onClose, onIssued, returnFocusRef }: {
  returnFocusRef: RefObject<HTMLElement | null>;
  service: boolean; actors: UseQueryResult<ActorListItem[], Error>;
  renderDrawer: (parts: ApiTokenDrawerParts) => ReactNode; onClose: () => void; onIssued: () => Promise<unknown>;
}) {
  const bundles = visibleApiTokenScopeBundles(undefined, { service });
  const formId = useId();
  const groups = tokenSelectionGroups(service);
  const [name, setName] = useState('');
  const [initialScopes] = useState<string[]>(() => [...(bundles.find(bundle => bundle.id === 'read')?.capabilities ?? [])]);
  const [selected, setSelected] = useState<string[]>(initialScopes);
  const [actorId, setActorId] = useState('');
  const [expiry, setExpiry] = useState('90');
  const [date, setDate] = useState('');
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [stored, setStored] = useState(false);
  useHostUnsavedGuard(secret !== null, { message: COPY.closeHint, onDiscard: () => setSecret(null) });
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  // Kept across a session expiry (#1887): only the typed name, the chosen scopes and expiry. The issued token value is never kept,
  // and once it is shown there is nothing to keep (the system Actor choice is not kept either).
  const { discard: discardDraft } = useSessionDraft({
    key: `api-token-issue:${service ? 'service' : 'personal'}`,
    read: () => secret !== null || (name === '' && expiry === '90' && date === '' && selected.join('\n') === initialScopes.join('\n'))
      ? null
      : { name, scopes: selected, expiry, date },
    parse: value => {
      const record = draftRecord(value);
      if (record === null) return null;
      const restoredExpiry = EXPIRY_CHOICES.find(choice => choice === draftString(record, 'expiry'));
      const scopes = draftStrings(record, 'scopes');
      const restoredName = draftString(record, 'name');
      return restoredExpiry === undefined || scopes === null || restoredName === null ? null : { name: restoredName, scopes, expiry: restoredExpiry, date: draftString(record, 'date') ?? '' };
    },
    restore: draft => { setName(draft.name); setSelected(draft.scopes); setExpiry(draft.expiry); setDate(draft.date); },
  });
  function requestClose() { if (pending) return; if (secret) setCloseConfirm(true); else { discardDraft(); onClose(); } }
  function closeSecret() { setSecret(null); setCopyMessage(''); setCloseConfirm(false); onClose(); }
  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopyMessage(COPY.copied);
    } catch { setCopyMessage(COPY.copyFailed); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || secret) return;
    const errors: Field[] = [];
    if (!name.trim()) errors.push({ path: 'name', message: COPY.requiredName });
    if (selected.length === 0) errors.push({ path: 'scopes', message: COPY.requiredScopes });
    if (service && !actors.data?.some(actor => actor.id === actorId && actor.actor_type === 'system')) errors.push({ path: 'actorId', message: COPY.requiredActor });
    const expiresAt = expiry === 'never' ? null : expiry === 'custom' ? `${date}T23:59:59+09:00` : new Date(Date.now() + Number(expiry) * 86400000).toISOString();
    if (expiresAt !== null && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())) errors.push({ path: 'expiresAt', message: COPY.invalidDate });
    setFields(errors); setError(null);
    if (errors.length) return;
    lock.current = true; setPending(true);
    try {
      const result = await issueApiToken(service, { name: name.trim(), scopes: selected, expiresAt, ...(service ? { actorId } : {}) });
      setSecret(result.token);
      discardDraft();
      // Only list metadata is invalidated. Never hand the issued response to a query/mutation cache or a toast.
      void onIssued();
    } catch (cause) { setError(mapUnknownError(cause).message); setFields(validationFields(cause)); }
    finally { lock.current = false; setPending(false); }
  }
  const fieldError = (path: string) => fields.filter(field => field.path === path || field.path.startsWith(`${path}.`));
  const errorsFor = (path: string) => <div id={`token-${path}-error`}>{fieldError(path).map(field => <p key={`${field.path}-${field.message}`} role="alert" className="text-xs text-text-danger-label">{field.message}</p>)}</div>;
  const body = secret ? <div className="space-y-4 break-keep pt-2">
    <Callout tone="blue" title={COPY.secretHint}>{null}</Callout>
    <div className="space-y-2"><Label htmlFor="token-secret">{COPY.secret}</Label><Input id="token-secret" inputFont="mono" value={secret} readOnly autoComplete="off" spellCheck={false} /></div>
    <Button variant="secondary" className="w-full" onClick={() => void copySecret()}><Copy className="size-4" />{COPY.copy}</Button>
    <p role="status" className="text-sm text-text-secondary">{copyMessage}</p>
    <label className="flex items-center gap-2 text-sm"><Checkbox checked={stored} onCheckedChange={checked => setStored(checked === true)} />{COPY.stored}</label>
    <Button variant="primary" className="w-full" disabled={!stored} onClick={requestClose}>완료 · 토큰 값 닫기</Button>
  </div> : <form id={formId} onSubmit={event => void submit(event)} className="space-y-5 break-keep">
    <p className="text-xs text-text-secondary">{COPY.session}</p>
    <div className="space-y-2"><Label htmlFor="token-name">{COPY.name}</Label><Input id="token-name" value={name} onChange={event => setName(event.target.value)} maxLength={100} autoComplete="off" disabled={pending} aria-invalid={fieldError('name').length > 0} aria-describedby="token-name-error" />{errorsFor('name')}</div>
    {service ? <fieldset className="space-y-2" disabled={pending}><legend className="text-sm font-medium">{COPY.actor}</legend>
      {actors.isPending ? <p role="status">{COPY.loading}</p> : actors.isError ? <Callout tone="red" title={mapUnknownError(actors.error).message} action={<Button type="button" variant="secondary" size="sm" onClick={() => void actors.refetch()}>{COPY.retry}</Button>}>{null}</Callout>
        : <RadioGroup value={actorId} onValueChange={setActorId} aria-label={COPY.actor} aria-describedby="token-actorId-error">
          {actors.data?.filter(actor => actor.actor_type === 'system').map(actor => <label key={actor.id} htmlFor={`token-actor-${actor.id}`} className="flex items-center gap-2 text-sm"><RadioGroupItem id={`token-actor-${actor.id}`} value={actor.id} />{actor.display_name}</label>)}
        </RadioGroup>}
      {actors.isSuccess && actors.data.length === 0 ? <p className="text-sm text-text-muted">{COPY.noActors}</p> : null}{errorsFor('actorId')}
    </fieldset> : null}
    <fieldset className="space-y-2" disabled={pending}><legend className="mb-2 text-sm font-medium">{COPY.expiry}</legend>
      <RadioGroup value={expiry} onValueChange={setExpiry} orientation="horizontal" appearance="segmented" aria-label={COPY.expiry}>
        {([['30', '30일'], ['90', '90일'], ['custom', '날짜 지정'], ['never', COPY.never]] as const).map(([value, label]) => <RadioGroupItem key={value} value={value} appearance="segmented">{label}</RadioGroupItem>)}
      </RadioGroup>
      {expiry === 'custom' ? <div className="space-y-2"><Label htmlFor="token-date">{COPY.customDate}</Label><Input id="token-date" type="date" value={date} onChange={event => setDate(event.target.value)} aria-invalid={fieldError('expiresAt').length > 0} aria-describedby="token-expiresAt-error" /></div> : null}
      {expiry === 'never' ? <Callout tone="amber" title={COPY.warning}>{null}</Callout> : null}{errorsFor('expiresAt')}
    </fieldset>
    <fieldset className="space-y-2" disabled={pending} aria-describedby="token-scopes-error"><legend className="mb-2 text-sm font-medium">권한</legend>
      <GroupedSelectionList mode="multiple" groups={groups} value={selected} onChange={setSelected} aria-label="권한" searchPlaceholder="권한 이름·설명 검색"
        presets={bundles.map(bundle => ({ id: bundle.id, label: bundle.label, description: bundle.description, itemIds: bundle.capabilities }))} />
      {errorsFor('scopes')}
    </fieldset>
    <p className="text-xs text-text-secondary">{service ? COPY.serviceIntersection : COPY.personalIntersection}</p>
    {error ? <p role="alert" className="text-sm text-text-danger-label">{error}</p> : null}
    {fields.filter(field => !['name', 'scopes', 'actorId', 'expiresAt'].some(path => field.path === path || field.path.startsWith(`${path}.`))).map(field => <p role="alert" key={`${field.path}-${field.message}`} className="text-xs text-text-danger-label">{field.message}</p>)}

  </form>;
  return <>{renderDrawer({ title: secret ? COPY.secretTitle : service ? COPY.serviceIssue : COPY.personalIssue, returnFocusRef, subtitle: secret ? COPY.secretSubtitle : service ? 'system Actor 귀속' : '내 계정에 귀속', body, footer: secret ? undefined : <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={pending} onClick={requestClose}>{COPY.cancel}</Button><Button type="submit" form={formId} variant="primary" disabled={pending || (service && !actors.isSuccess)}>{pending ? '발급 중…' : COPY.issue}</Button></div>, requestClose })}
    <AlertDialog open={closeConfirm} onOpenChange={setCloseConfirm}><AlertDialogContent className="break-keep"><AlertDialogHeader><AlertDialogTitle>{COPY.closeTitle}</AlertDialogTitle><AlertDialogDescription>{COPY.closeHint}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{COPY.keep}</AlertDialogCancel><AlertDialogAction onClick={closeSecret}>{COPY.close}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
