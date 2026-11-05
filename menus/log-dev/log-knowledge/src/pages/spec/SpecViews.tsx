import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { PanelRight, ChevronRight, ChevronDown } from 'lucide-react';
import { sortAndPage, type TableQuery } from '@ap/contracts';
import { usePlatform } from '@ap/kernel';
import { DetailDrawer, PlatformDataTable, RowAction, type PlatformColumn } from '@ap/components';
import { Button, StatusBadge } from '@ap/ui';
import type { SpecChangeKind, SpecChangeRow } from '../../endpoints';
import { eventIdentity, eventsOf, modulePath, modulesOf, targetOf, type Spec } from './specModel';
import { useSpecWords } from './SpecControls';
import { ChangeComparison } from './ChangeComparison';
export function ChangeMark({ kind }: { kind: SpecChangeKind }) {
  const w = useSpecWords();
  return <StatusBadge tone={kind === 'added' ? 'info' : kind === 'removed' ? 'danger' : 'warning'}>{({ added: w('추가', 'Added'), removed: w('제거', 'Removed'), changed: w('변경', 'Changed'), behavior: w('동작 메모', 'Behavior note') })[kind]}</StatusBadge>;
}
export function SpecBody({ spec, modelId, freshness, onOpenEvent }: { spec: Spec; modelId: string; freshness: number; onOpenEvent: (identity: string) => void }) {
  const w = useSpecWords(), { pageParam, setPage } = usePlatform();
  const selected = pageParam('module') ?? '', [collapsed, setCollapsed] = useState(false), [closed, setClosed] = useState<Set<string>>(new Set());
  const modules = modulesOf(spec), path = modulePath(spec, selected);
  const rows = useMemo(() => {
    const tree = modulesOf(spec), descendants = new Set<string>();
    const collect = (key: string) => { if (descendants.has(key)) return; descendants.add(key); tree.filter(m => m.parentKey === key).forEach(m => collect(m.moduleKey)); };
    if (selected) collect(selected);
    return eventsOf(spec).filter(e => !selected || descendants.has(e.moduleKey));
  }, [spec, selected]);
  const loadPage = useCallback(async (query: TableQuery) => ({ outcome: 'ok' as const, data: sortAndPage(rows, query), assessments: [], trust: null, correlationId: 'local-spec-table' }), [rows]);
  const open = onOpenEvent; // the screen's guarded transition: a dirty editor asks before it is replaced
  const columns: PlatformColumn<(typeof rows)[number]>[] = [
    { id: 'moduleKey', header: 'Module', size: 120, cell: e => <span className="t-mono">{e.moduleKey}</span> },
    { id: 'name', header: 'Event', size: 150, cell: e => <Button size="sm" variant="link" onClick={() => open(eventIdentity(e))}>{e.name}</Button> },
    { id: 'triggerRule', header: w('발생 조건', 'Trigger'), size: 180, cell: e => e.triggerRule ?? '—' },
    { id: 'changed', header: w('SW 차이', 'SW changes'), size: 150, sortable: false, cell: e => <div className="flex flex-wrap gap-1">{e.changed.length ? [...new Set(e.changed.map(m => m.changeKind))].map(kind => <ChangeMark key={kind} kind={kind} />) : w('모델 기준', 'Model basis')}{e.needsRevalidation && <StatusBadge tone="warning">{w('재검토 필요', 'Needs revalidation')}</StatusBadge>}</div> },
  ];
  function branch(parent: string | null, ancestors = new Set<string>()): React.ReactNode {
    return <ul className={parent === null ? 'grid gap-1' : 'ml-3 grid gap-1 border-l border-border-subtle pl-2'}>{modules.filter(m => m.parentKey === parent && !ancestors.has(m.moduleKey)).map(m => {
      const children = modules.some(c => c.parentKey === m.moduleKey), expanded = !closed.has(m.moduleKey);
      return <li key={m.moduleKey}><div className="flex min-h-8 items-center gap-1">
        {children && <Button size="icon-sm" variant="ghost" aria-label={`${m.name} ${expanded ? w('접기', 'Collapse') : w('펼치기', 'Expand')}`} aria-expanded={expanded} onClick={() => setClosed(current => { const next = new Set(current); if (expanded) next.add(m.moduleKey); else next.delete(m.moduleKey); return next; })}>{expanded ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}</Button>}
        <Button size="sm" variant={selected === m.moduleKey ? 'secondary' : 'ghost'} aria-pressed={selected === m.moduleKey} onClick={() => setPage({ module: m.moduleKey })}>{m.name}</Button>
        {'changed' in m && m.changed.map(mark => <ChangeMark key={mark.changeId} kind={mark.changeKind} />)}
      </div>{children && expanded && branch(m.moduleKey, new Set([...ancestors, m.moduleKey]))}</li>;
    })}</ul>;
  }
  return <div className="grid min-w-0 gap-3">
    <div className="flex flex-wrap items-center gap-3"><Button size="sm" variant="secondary" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>{collapsed ? w('Module 트리 펼치기', 'Expand Module tree') : w('Module 트리 접기', 'Collapse Module tree')}</Button><p className="min-w-0 break-words text-sm text-text-secondary">{path.join(' / ') || w('모든 Module', 'All Modules')}</p>{selected && <Button size="sm" variant="ghost" onClick={() => setPage({ module: null })}>{w('모든 Module', 'All Modules')}</Button>}</div>
    <div className={collapsed ? 'grid min-w-0 gap-3' : 'grid min-w-0 grid-cols-[minmax(9rem,1fr)_minmax(0,4fr)] items-start gap-3'}>
      {!collapsed && <nav aria-label={w('Module 계층', 'Module hierarchy')} className="min-w-0 overflow-x-auto rounded-md border border-border-subtle bg-surface-card p-3">{branch(null)}</nav>}
      <div role="region" aria-label={w('Event 표 영역', 'Event table region')} tabIndex={0} className="min-w-0 max-w-full overflow-x-auto">
      <PlatformDataTable title="Event" ariaLabel={w('명세 Event 목록', 'Specification events')} columns={columns} getRowId={eventIdentity} loadPage={loadPage} pageSize={20} filterKey={`${modelId}:${spec.revision.id}:${pageParam('software')}:${selected}:${freshness}`} preferenceKey="log-spec-events"
        rowAction={(row, { compact }) => <RowAction compact={compact} icon={PanelRight} label={`${row.name} ${w('상세', 'details')}`} text={w('상세', 'Details')} onClick={() => open(eventIdentity(row))} />} />
      </div>
    </div>
    {'effective' in spec && spec.effective && <>
      {spec.removed.map(c => <p key={c.changeId} className="flex min-h-8 items-center gap-2 text-sm"><ChangeMark kind="removed" /><span className="t-mono">{c.targetKey}</span>{c.needsRevalidation && w('재검토 필요', 'Needs revalidation')}</p>)}
      {spec.stale.map(c => <p key={c.changeId} role="status" className="min-h-8 rounded-md bg-accent-warn-soft p-2 text-sm text-text-warning-label">{w('적용되지 않은 대상', 'Unapplied target')}: {c.targetKey} · {({ exists: w('이미 있는 대상', 'Target already exists'), gone: w('사라진 대상', 'Target is gone'), before_mismatch: w('변경 전 값 불일치', 'Before value differs'), parent_missing: w('상위 대상 없음', 'Parent missing'), malformed: w('내용 형식 확인 필요', 'Content needs correction') })[c.reason]}{c.needsRevalidation && ` · ${w('재검토 필요', 'Needs revalidation')}`}</p>)}
    </>}
  </div>;
}
/** Include Event/field changes and relations at either endpoint; decode escaped stable keys before matching. */
export function ConnectedChanges({ rows, spec, identity, onChange }: { rows: SpecChangeRow[]; spec: Spec; identity: string; onChange: (id: string) => void }) {
  const w = useSpecWords(), event = eventsOf(spec).find(e => eventIdentity(e) === identity);
  const relevant = event ? rows.filter(row => {
    const target = targetOf(row);
    return 'sourceModule' in target
      ? target.sourceModule === event.moduleKey && target.sourceEvent === event.eventKey || target.targetModule === event.moduleKey && target.targetEvent === event.eventKey
      : 'event' in target && target.module === event.moduleKey && target.event === event.eventKey;
  }) : [];
  return relevant.length ? <div className="grid gap-3">{relevant.map(row => <article key={row.id} className="grid gap-2 border-b border-border-subtle pb-3">
    <div className="flex flex-wrap items-center gap-2"><span>{row.softwareLabel}{w('부터', ' onward')}</span><ChangeMark kind={row.changeKind} />{row.needsRevalidation && <StatusBadge tone="warning">{w('재검토 필요', 'Needs revalidation')}</StatusBadge>}{row.retiredAt && <StatusBadge tone="neutral">{w('닫힘', 'Retired')}</StatusBadge>}</div>
    <ChangeComparison row={row} />
    <Button size="sm" variant="link" onClick={() => onChange(row.id)}>{w('변경점 보기', 'View change')}: {row.id}</Button>
  </article>)}</div> : <p className="text-text-secondary">{w('연결된 변경점이 없습니다.', 'No connected changes.')}</p>;
}
export function EventDrawer({ spec, identity, onClose, connectedChanges }: { spec: Spec; identity: string; onClose: () => void; connectedChanges: ReactNode }) {
  const w = useSpecWords(), e = eventsOf(spec).find(e => eventIdentity(e) === identity);
  const fields = e && Array.isArray(e.fields) ? e.fields as { name: string; type: string; unit?: string | null; description: string; allowedValues?: string[] }[] : [];
  const relations = e ? spec.relations.filter(r => 'sourceModuleKey' in r ? r.sourceModuleKey === e.moduleKey && r.sourceEventKey === e.eventKey || r.targetModuleKey === e.moduleKey && r.targetEventKey === e.eventKey : r.sourceEventId === e.id || r.targetEventId === e.id) : [];
  return <DetailDrawer title={e?.name ?? w('Event를 찾을 수 없습니다', 'Event not found')} subtitle={identity} onClose={onClose} tabs={[{ id: 'event', label: 'Event', content: e ? <div className="grid min-w-0 gap-4 text-sm">
    <div className="flex flex-wrap items-center gap-2"><span>{'origin' in e && e.origin === 'change' ? w('SW 변경점에서 추가됨', 'Added by an SW change') : w('모델 기준', 'Model basis')} · r{spec.revision.revisionNo}</span>{[...new Set(e.changed.map(mark => mark.changeKind))].map(kind => <ChangeMark key={kind} kind={kind} />)}{e.needsRevalidation && <StatusBadge tone="warning">{w('재검토 필요', 'Needs revalidation')}</StatusBadge>}</div>
    <p className="t-mono break-all">{e.moduleKey} / {e.eventKey}</p><p className="break-words">{w('발생 조건', 'Trigger')}: {e.triggerRule ?? w('등록된 발생 조건이 없습니다.', 'No trigger is recorded.')}</p><p className="break-words">{w('문서 참조', 'Document reference')}: {e.detailDocRef ?? w('등록된 문서 참조가 없습니다.', 'No document reference is recorded.')}</p>
    <section aria-label={w('필드', 'Fields')} className="grid gap-2"><h3 className="font-semibold">{w('필드', 'Fields')}</h3>
      {fields.length ? fields.map(field => <dl key={field.name} className="grid gap-1 border-b border-border-subtle pb-2"><dt className="t-mono break-all">{field.name}</dt><dd className="break-words">{field.type} · {field.unit ?? w('단위 없음', 'No unit')}</dd><dd className="break-words text-text-secondary">{field.description}</dd>{field.allowedValues && field.allowedValues.length > 0 && <dd className="break-words">{w('허용값', 'Allowed values')}: {field.allowedValues.join(', ')}</dd>}</dl>) : <p className="text-text-secondary">{w('정의된 필드가 없습니다.', 'No fields are defined.')}</p>}
    </section>
    <section aria-label={w('관계', 'Relations')} className="grid gap-2"><h3 className="font-semibold">{w('관계', 'Relations')}</h3>
      {relations.length ? <ul>{relations.map((r, i) => <li key={r.id ?? i} className="min-h-8 break-words">{'sourceModuleKey' in r ? `${r.sourceModuleKey}/${r.sourceEventKey} → ${r.targetModuleKey}/${r.targetEventKey}` : `${spec.events.find(e => e.id === r.sourceEventId)?.name ?? r.sourceEventId} → ${spec.events.find(e => e.id === r.targetEventId)?.name ?? r.targetEventId}`} · {r.predicate} · {r.ruleRef ?? w('등록된 근거 없음', 'No reference recorded')}{'changed' in r && r.changed.map(mark => <ChangeMark key={mark.changeId} kind={mark.changeKind} />)}{'needsRevalidation' in r && r.needsRevalidation && <StatusBadge tone="warning">{w('재검토 필요', 'Needs revalidation')}</StatusBadge>}</li>)}</ul> : <p className="text-text-secondary">{w('정의된 관계가 없습니다.', 'No relations are defined.')}</p>}
    </section>
    <section aria-label={w('연결된 변경점', 'Connected changes')} className="grid gap-2"><h3 className="font-semibold">{w('연결된 변경점', 'Connected changes')}</h3>{connectedChanges}</section>
  </div> : <p role="status">{w('주소의 대상이 현재 실효 명세에 없습니다.', 'The URL target is absent from the current effective specification.')}</p> }]} />;
}
