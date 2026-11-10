import { useRef } from 'react';
import type { QueryState } from '@ap/kernel';
import { QueryView } from '@ap/components';
import { Button, EmptyState, PanelSectionTitle, StatusBadge, cn } from '@ap/ui';
import type { LayoutRow, RevisionRow, TemplateRow } from '../endpoints';
import { formatPublished } from '../model/text';
import { shortHash } from '../model/status';
import { rowsOf } from '../model/query';

export type Mode = 'draft' | 'revision' | 'template';

/** Import and export of a Layout JSON file: small icon-less toolbar buttons, only for a person who can edit. */
export function ImportExport({ onFile, onExport, canExport }: { onFile(file: File): void; onExport(): void; canExport: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return <span className="flex shrink-0 items-center gap-1">
    <input ref={input} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-label="Layout JSON 파일 선택" data-testid="layout-import-input"
      onChange={event => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ''; }} />
    <Button size="toolbar" variant="secondary" onClick={() => input.current?.click()}>가져오기</Button>
    <Button size="toolbar" variant="secondary" disabled={!canExport} onClick={onExport}>내보내기</Button>
  </span>;
}

/** Empty state of the first Layout: the same two buttons, shown only to a person who can edit. */
export function NoLayouts({ canEdit, onFile }: { canEdit: boolean; onFile(file: File): void }) {
  return <EmptyState title="Layout이 없습니다" body={canEdit ? 'Layout JSON 파일을 가져와 초안으로 저장하세요.' : '저장된 Layout이 없습니다.'}
    action={canEdit ? <ImportExport onFile={onFile} onExport={() => undefined} canExport={false} /> : undefined} />;
}

const rowButton = (selected: boolean) => cn('rounded-md', selected && 'bg-surface-row-selected');

export function FilesPane({ layouts, layoutId, mode, revisionKey, templateKey, revisionsQuery, templatesQuery, canEdit, canExport, onLayout, onDraft, onRevision, onTemplate, onFile, onExport }: {
  layouts: readonly LayoutRow[]; layoutId: string; mode: Mode; revisionKey: string | null; templateKey: string | null;
  revisionsQuery: QueryState<{ rows: RevisionRow[] }>; templatesQuery: QueryState<{ rows: TemplateRow[] }>; canEdit: boolean; canExport: boolean;
  onLayout(id: string): void; onDraft(): void; onRevision(revision: string): void; onTemplate(id: string): void; onFile(file: File): void; onExport(): void;
}) {
  const revisions = rowsOf(revisionsQuery);
  const templates = rowsOf(templatesQuery);
  return <div className="space-y-4">
    <section className="space-y-2" aria-label="EV Templates">
      <PanelSectionTitle className="px-2">EV Templates</PanelSectionTitle>
      {templates === null ? <QueryView query={templatesQuery} compact skeletonRows={1} skeletonHeight={32}>{() => null}</QueryView>
        : templates.length === 0 && <EmptyState size="sm" density="compact" title="승격된 EV Template이 없습니다" />}
      {(templates ?? []).map(t => <div key={t.id} className={rowButton(mode === 'template' && templateKey === t.templateId)}>
        <Button size="toolbar" variant="navigation" className="w-full justify-start" title={t.templateId} aria-current={mode === 'template' && templateKey === t.templateId ? 'true' : undefined} onClick={() => onTemplate(t.templateId)}>
          <span className={cn('truncate font-mono text-xs', mode === 'template' && templateKey === t.templateId && 'font-semibold')}>{t.templateId}</span>
        </Button></div>)}
    </section>
    <section className="space-y-2" aria-label="Layouts">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PanelSectionTitle className="mb-0 px-2">Layouts</PanelSectionTitle>
        {canEdit && <ImportExport onFile={onFile} onExport={onExport} canExport={canExport} />}
      </div>
      {!layouts.some(row => row.layoutId === layoutId) && <div className="rounded-md"><Button size="toolbar" variant="navigation" className="w-full justify-start" aria-current="true" onClick={onDraft}><span className="truncate font-mono text-xs font-semibold">{layoutId}</span></Button></div>}
      {layouts.map(row => <div key={row.id} className="rounded-md">
        <Button size="toolbar" variant="navigation" className="w-full justify-start" aria-current={row.layoutId === layoutId ? 'true' : undefined} onClick={() => onLayout(row.layoutId)}>
          <span className={cn('truncate font-mono text-xs', row.layoutId === layoutId && 'font-semibold')}>{row.layoutId}</span>
        </Button></div>)}
      <section className="space-y-2" aria-label="Revision 이력">
        <PanelSectionTitle className="px-2">Revision 이력</PanelSectionTitle>
        <div className={rowButton(mode === 'draft')}><Button size="toolbar" variant="navigation" className="w-full justify-start" aria-current={mode === 'draft' ? 'true' : undefined} onClick={onDraft}><span className={cn(mode === 'draft' && 'font-semibold')}>초안</span></Button></div>
        {revisions === null ? <QueryView query={revisionsQuery} compact skeletonRows={1} skeletonHeight={32}>{() => null}</QueryView>
          : revisions.length === 0 && <EmptyState size="sm" density="compact" title="게시된 Revision이 없습니다" />}
        {(revisions ?? []).map(r => <div key={r.id} className={rowButton(mode === 'revision' && revisionKey === r.revision)}>
          <Button size="toolbar" variant="navigation" className="h-auto w-full justify-between" aria-current={mode === 'revision' && revisionKey === r.revision ? 'true' : undefined} onClick={() => onRevision(r.revision)}>
            <span className="flex min-w-0 flex-col items-start py-1"><span className={cn('font-mono text-xs', mode === 'revision' && revisionKey === r.revision && 'font-semibold')}>{shortHash(r.revision)}</span><span className="text-xs text-text-secondary">{formatPublished(r.publishedAt)}</span></span>
            <StatusBadge tone="success">게시됨</StatusBadge>
          </Button></div>)}
        <p className="px-2 text-xs text-text-muted">게시한 Revision은 바꿀 수 없습니다.</p>
      </section>
    </section>
  </div>;
}
