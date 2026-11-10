import { Trash2 } from 'lucide-react';
import type { Component } from '@eqv/core';
import { Button, EmptyState, FieldLabel, FieldList, FieldRow, Input, PanelSectionTitle } from '@ap/ui';

const KEYS = ['x', 'y', 'rotation'] as const;
const keyLabel = (key: typeof KEYS[number]) => (key === 'rotation' ? '회전 (°)' : key.toUpperCase());

/** The `속성` tab: read-only key-values, or inputs when the open document is an editable draft. */
export function Properties({ selected, writable, canDelete, deleteBlocked, readOnlyNote, onLabel, onTransform, onDelete }: {
  selected: Component | undefined; writable: boolean; canDelete: boolean; deleteBlocked: boolean; readOnlyNote: string;
  onLabel(label: string): void; onTransform(key: typeof KEYS[number], value: number): void; onDelete(): void;
}) {
  return <div className="space-y-3">
    <PanelSectionTitle>선택 항목</PanelSectionTitle>
    {selected ? <>
      <FieldList>
        <FieldRow layout="property" label="ID" mono>{selected.id}</FieldRow>
        <FieldRow layout="property" label="Role">{selected.role}</FieldRow>
        <FieldRow layout="property" label="부모" mono={selected.parentId != null}>{selected.parentId ?? '없음'}</FieldRow>
      </FieldList>
      {writable ? <>
        <div className="space-y-1"><FieldLabel tone="secondary" htmlFor="component-name">이름</FieldLabel>
          <Input id="component-name" inputSize="toolbar" value={selected.label} onChange={e => onLabel(e.target.value)} /></div>
        <div className="grid grid-cols-3 gap-2">{KEYS.map(key => <div key={key} className="space-y-1">
          <FieldLabel tone="secondary" htmlFor={`component-${key}`}>{keyLabel(key)}</FieldLabel>
          <Input id={`component-${key}`} inputSize="toolbar" type="number" value={selected.transform[key]}
            onChange={e => { if (e.target.value !== '' && Number.isFinite(Number(e.target.value))) onTransform(key, Number(e.target.value)); }} /></div>)}</div>
      </> : <FieldList>
        <FieldRow layout="property" label="이름">{selected.label}</FieldRow>
        {KEYS.map(key => <FieldRow key={key} layout="property" label={keyLabel(key)}>{selected.transform[key]}</FieldRow>)}
      </FieldList>}
      <FieldList>
        <FieldRow layout="property" label="크기">{selected.size ? `${selected.size.width} × ${selected.size.height}` : '선언 없음'}</FieldRow>
        <FieldRow layout="property" label="Port">{selected.ports.length}</FieldRow>
        <FieldRow layout="property" label="Holding Site">{selected.holdingSites.length}</FieldRow>
      </FieldList>
      {canDelete && <Button size="toolbar" variant="secondary" disabled={!writable || deleteBlocked} aria-describedby={deleteBlocked ? 'delete-reason' : undefined} onClick={onDelete}><Trash2 className="size-3.5" aria-hidden />삭제</Button>}
      {!writable && <p className="text-xs text-text-muted">{readOnlyNote}</p>}
    </> : <EmptyState size="sm" title="Component를 선택하세요" />}
  </div>;
}
