import { useRef, useState } from 'react';
import type { LayoutDocument, Component } from '@eqv/core';
import type { RemovalImpact } from '@eqv/editor';
import type { FieldError } from '@ap/contracts';
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Button, Callout, FieldLabel, FieldList, FieldRow, Input,
} from '@ap/ui';
import { TEMPLATE_ID_PATTERN } from '../endpoints';
import { COLLECTIONS } from '../model/layout-changes';
import { shortHash, type PublishBaseline } from '../model/status';
import { errorFor, fieldErrorCode } from '../model/text';

const COLLECTION_LABELS: Record<string, string> = { levels: 'Level', components: 'Component', physicalInterfaces: 'Physical Interface', transferCapabilities: 'Transfer Capability', processRoutes: '공정 경로' };
const CHANGE_LABEL = { added: '추가', removed: '삭제', changed: '변경' } as const;

function ChangeList({ changes }: { changes: Extract<PublishBaseline, { kind: 'compared' }>['changes'] }) {
  const rows = [
    ...changes.header.map(name => ({ item: '머리 필드', id: name, change: CHANGE_LABEL.changed })),
    ...COLLECTIONS.flatMap(name => (['added', 'removed', 'changed'] as const).flatMap(kind => changes.collections[name][kind].map(id => ({ item: COLLECTION_LABELS[name]!, id, change: CHANGE_LABEL[kind] })))),
  ];
  if (rows.length === 0) return <p className="text-xs text-text-secondary">변경 없음</p>;
  const count = (change: string) => rows.filter(r => r.change === change).length;
  return <div className="space-y-2">
    <div className="max-h-64 overflow-y-auto"><table className="w-full text-left text-xs"><caption className="sr-only">Layout 변경 목록</caption>
      <thead><tr>{['항목', 'ID', '변경'].map(label => <th key={label} className="t-table-header border-b border-border-subtle bg-surface-sunken p-2 text-text-secondary">{label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={`${row.item}/${row.id}/${row.change}`}><td className="p-2">{row.item}</td><td className="p-2 font-mono">{row.id}</td><td className="p-2">{row.change}</td></tr>)}</tbody></table></div>
    <p className="text-xs">{Object.values(CHANGE_LABEL).map(change => `${change} ${count(change)}`).join(' · ')}</p>
  </div>;
}

function BaselineSummary({ baseline, layout }: { baseline: PublishBaseline; layout: LayoutDocument }) {
  switch (baseline.kind) {
    case 'identical':
      return <Callout tone="blue" title={`이 내용은 이미 ${shortHash(baseline.revision)}로 게시되어 있습니다`}>게시해도 새 Revision이 만들어지지 않습니다.</Callout>;
    case 'first':
      return <div className="space-y-2"><Callout tone="blue" title="첫 Revision">이 Layout의 첫 게시입니다. 비교할 이전 Revision이 없습니다.</Callout>
        <FieldList><FieldRow layout="property" label="Component">{layout.components.length}</FieldRow><FieldRow layout="property" label="Physical Interface">{layout.physicalInterfaces.length}</FieldRow><FieldRow layout="property" label="Transfer Capability">{layout.transferCapabilities.length}</FieldRow></FieldList></div>;
    case 'unpinned':
      return <Callout tone="amber" title={`기존 Revision ${baseline.count}개`}>이 Layout의 Revision을 가리키는 Binding이 없어 비교 기준이 없습니다.</Callout>;
    case 'compared':
      return <div className="space-y-2"><p className="text-xs">비교 기준: <code className="font-mono">{shortHash(baseline.revision)}</code> · 가장 최근 Revision</p><ChangeList changes={baseline.changes} /></div>;
  }
}

/** Confirm step of the Revision publish: what the click adds, then the write. The base is the one the screen read; the server judges the draft again. */
export function PublishDialog({ layout, baseline, baselineError, onRetryBaseline, submitting, error, onPublish, onCancel }: {
  layout: LayoutDocument; baseline: PublishBaseline | null; baselineError: boolean; onRetryBaseline(): void; submitting: boolean; error: string | null; onPublish(): void; onCancel(): void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  return <AlertDialog open onOpenChange={open => { if (!open && !submitting) onCancel(); }}>
    <AlertDialogContent className="break-keep" onOpenAutoFocus={event => { event.preventDefault(); cancel.current?.focus(); }}>
      <AlertDialogHeader>
        <AlertDialogTitle>Layout Revision을 게시할까요?</AlertDialogTitle>
        <AlertDialogDescription>Layout <code className="font-mono">{layout.id}</code>의 저장된 초안을 확인한 뒤 게시합니다. 게시한 Revision은 바꿀 수 없습니다.</AlertDialogDescription>
      </AlertDialogHeader>
      <div className="space-y-3">
        {baselineError ? <Callout tone="red" title="비교 기준을 불러오지 못했습니다" action={<Button size="toolbar" variant="secondary" onClick={onRetryBaseline}>다시 시도</Button>}>{null}</Callout> : baseline === null ? <p className="text-xs text-text-muted">비교 기준을 확인하는 중…</p> : <BaselineSummary baseline={baseline} layout={layout} />}
        {error && <Callout tone="red" title="게시하지 못했습니다"><span role="alert">{error}</span></Callout>}
      </div>
      <AlertDialogFooter>
        <Button ref={cancel} size="toolbar" variant="secondary" disabled={submitting} onClick={onCancel}>취소</Button>
        <Button size="toolbar" disabled={baseline === null || submitting} onClick={onPublish}>게시</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

/** Template promotion: the id and name, the source and what the Template will contain. Client checks never replace the server's. */
export function PromoteDialog({ layoutId, revision, source, submitting, fieldErrors, message, onSubmit, onCancel }: {
  layoutId: string; revision: string; source: LayoutDocument; submitting: boolean; fieldErrors: readonly FieldError[]; message: string | null;
  onSubmit(input: { templateId: string; name: string }): void; onCancel(): void;
}) {
  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState('');
  const idInput = useRef<HTMLInputElement>(null);
  const idValid = TEMPLATE_ID_PATTERN.test(templateId);
  const nameValid = name.trim() !== '';
  const roles = Object.entries(source.components.reduce<Record<string, number>>((counts, c) => ({ ...counts, [c.role]: (counts[c.role] ?? 0) + 1 }), {}));
  const serverId = errorFor(fieldErrors, 'templateId');
  const serverName = errorFor(fieldErrors, 'name');
  const idError = templateId !== '' && !idValid ? '소문자로 시작하고 소문자·숫자를 하이픈(-) 하나로 이어 씁니다.' : serverId ? fieldErrorCode(serverId.code) : null;
  const other = fieldErrors.filter(e => e.path[0] !== 'templateId' && e.path[0] !== 'name');
  const reason = !idValid || !nameValid ? '고유한 ID와 이름을 입력하세요.' : null;
  return <AlertDialog open onOpenChange={open => { if (!open && !submitting) onCancel(); }}>
    <AlertDialogContent className="break-keep" onOpenAutoFocus={event => { event.preventDefault(); idInput.current?.focus(); }}>
      <AlertDialogHeader>
        <AlertDialogTitle>EV Template으로 승격할까요?</AlertDialogTitle>
        <AlertDialogDescription>게시된 Revision에서 EV Template을 만듭니다. 만든 EV Template은 삭제할 수 없습니다.</AlertDialogDescription>
      </AlertDialogHeader>
      <form noValidate className="space-y-3" id="promote-form" onSubmit={event => { event.preventDefault(); if (idValid && nameValid && !submitting) onSubmit({ templateId, name: name.trim() }); }}>
        <div className="space-y-1"><FieldLabel htmlFor="template-id" required>ID</FieldLabel>
          <Input ref={idInput} inputSize="toolbar" id="template-id" autoComplete="off" spellCheck={false} placeholder="sample-template" value={templateId} disabled={submitting} aria-invalid={idError ? true : undefined} aria-describedby={idError ? 'template-id-error' : 'template-id-hint'}
            onChange={e => setTemplateId(e.target.value)} />
          {idError ? <p id="template-id-error" role="alert" className="text-xs text-text-danger">{idError}</p> : <p id="template-id-hint" className="text-xs text-text-muted">소문자·숫자·하이픈으로 구성한 고유 ID</p>}</div>
        <div className="space-y-1"><FieldLabel htmlFor="template-name" required>이름</FieldLabel>
          <Input inputSize="toolbar" id="template-name" autoComplete="off" value={name} disabled={submitting} aria-invalid={serverName ? true : undefined} onChange={e => setName(e.target.value)} />
          {serverName && <p role="alert" className="text-xs text-text-danger">{fieldErrorCode(serverName.code)}</p>}</div>
        <FieldList>
          <FieldRow layout="property" label="원천 Revision" mono>{layoutId} / {shortHash(revision)}</FieldRow>
          <FieldRow layout="property" label="Role별 개수">{roles.map(([role, count]) => `${role} ${count}`).join(' · ')}</FieldRow>
        </FieldList>
        <p className="text-xs text-text-muted">승격한 EV Template은 Role마다 이 개수와 정확히 같은 설비에만 맞습니다.</p>
        {reason && <p id="promotion-fields-reason" className="text-xs text-text-muted">{reason}</p>}
        {(message || other.length > 0) && <Callout tone="red" title="승격하지 못했습니다"><span role="alert">{message ?? other.map(e => `${e.path.join('.')}: ${fieldErrorCode(e.code)}`).join(' · ')}</span></Callout>}
      </form>
      <AlertDialogFooter>
        <Button size="toolbar" variant="secondary" disabled={submitting} onClick={onCancel}>취소</Button>
        <Button size="toolbar" type="submit" form="promote-form" disabled={!!reason || submitting} aria-describedby={reason ? 'promotion-fields-reason' : undefined}>승격</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

export function DeleteDialog({ component, impact, onConfirm, onCancel }: { component: Component; impact: RemovalImpact; onConfirm(): void; onCancel(): void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  return <AlertDialog open onOpenChange={open => { if (!open) onCancel(); }}>
    <AlertDialogContent className="break-keep" onOpenAutoFocus={event => { event.preventDefault(); cancel.current?.focus(); }}>
      <AlertDialogHeader><AlertDialogTitle>Component를 삭제할까요?</AlertDialogTitle>
        <AlertDialogDescription>연결과 경로에 미치는 영향을 확인하세요. 실행 취소로 되돌릴 수 있습니다.</AlertDialogDescription></AlertDialogHeader>
      <FieldList>
        <FieldRow layout="property" label="Component" mono>{component.id}</FieldRow>
        <FieldRow layout="property" label="Physical Interface">{impact.physicalInterfaces}</FieldRow>
        <FieldRow layout="property" label="Holding Site">{component.holdingSites.length}</FieldRow>
        <FieldRow layout="property" label="Transfer Capability">{impact.transferCapabilities}</FieldRow>
        <FieldRow layout="property" label="경로 단계 / 삭제 경로">{impact.processRouteSteps} / {impact.processRoutes}</FieldRow>
      </FieldList>
      <AlertDialogFooter><Button ref={cancel} size="toolbar" variant="secondary" onClick={onCancel}>취소</Button><Button size="toolbar" variant="destructive" onClick={onConfirm}>삭제</Button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

/** Same-address discards the page-key guard does not see: a server-draft reload after a conflict, and an import over unsaved edits. */
export function DiscardDialog({ title, body, confirmLabel, onConfirm, onCancel }: { title: string; body: string; confirmLabel: string; onConfirm(): void; onCancel(): void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  return <AlertDialog open onOpenChange={open => { if (!open) onCancel(); }}>
    <AlertDialogContent className="break-keep" onOpenAutoFocus={event => { event.preventDefault(); cancel.current?.focus(); }}>
      <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{body}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><Button ref={cancel} size="toolbar" variant="secondary" onClick={onCancel}>유지</Button><Button size="toolbar" variant="destructive" onClick={onConfirm}>{confirmLabel}</Button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
