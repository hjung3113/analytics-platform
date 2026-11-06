import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { isAppRelativePath } from '@ap/contracts';
import { PlatformLink, usePlatform } from '@ap/kernel';
import { Button, Input, StatusBadge } from '@ap/ui';
import { ITEM_PUBLISH_PERMISSION, type ItemSubject } from '../../endpoints';
import { SpecSelect, useSpecWords } from '../spec/SpecControls';
import { useSubjectPickerSpec } from './useSubjectData';
import { addPick, atSubjectLimit, buildPickerTree, pickId, removePick, searchPickerTree, setPickRelation, subjectChips, SUBJECT_LIMIT, SUBJECT_RELATION_LABEL, type PickerNode, type SubjectPick } from './subjectModel';

function SubjectText({ text, className }: { text: string; className: string }) {
  const ref = useRef<HTMLSpanElement>(null), [clipped, setClipped] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setClipped(node.scrollWidth > node.clientWidth);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node); window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [text]);
  return <span ref={ref} className={className} title={clipped ? text : undefined}>{text}</span>;
}

export function SubjectChips({ subjects }: { subjects: readonly ItemSubject[] | undefined }) {
  const { linkTo, location } = usePlatform(), w = useSpecWords();
  const chips = subjectChips(subjects);
  return <section aria-label={w('대상', 'Subjects')} className="grid gap-2"><h3 className="text-sm font-semibold">{w('대상', 'Subjects')}</h3>
    {chips.length === 0 ? <p className="text-sm text-text-muted">{w('연결된 대상이 없습니다.', 'No linked subjects.')}</p> : <ul className="grid gap-2">{chips.map(c => {
      const href = c.link ? linkTo(c.link.menuId, { params: c.link.params, page: c.link.page }) : null;
      // Raw module keys can contain #. A document link through the injected browser boundary (base path) preserves them when the SPA guard refuses them.
      return <li key={c.key} className="flex flex-wrap items-center gap-2 text-sm">
      {href ? isAppRelativePath(href) ? <PlatformLink href={href}>{c.modelName} · {c.label}</PlatformLink> : <a href={location.href(href)}>{c.modelName} · {c.label}</a> : <span>{c.modelName} · {c.label}</span>}
      <span className="text-xs text-text-secondary">{w(c.relation.ko, c.relation.en)}</span><StatusBadge tone={c.tone}>{w(c.state.ko, c.state.en)}</StatusBadge>
    </li>; })}</ul>}
  </section>;
}
export function SubjectPicker({ modelId, picks, onChange, disabled = false, subjects }: { modelId: string; picks: SubjectPick[]; onChange: (picks: SubjectPick[]) => void; disabled?: boolean; subjects?: readonly ItemSubject[] }) {
  const { can } = usePlatform(), w = useSpecWords(), uid = useId();
  const allowed = can(ITEM_PUBLISH_PERMISSION), query = useSubjectPickerSpec(modelId, allowed);
  const [search, setSearch] = useState('');
  const response = query.response, data = response?.outcome === 'ok' ? response.data : null;
  const malformed = !!data && (!Array.isArray(data.modules) || !Array.isArray(data.events));
  const spec = malformed ? null : data;
  const deferredSearch = useDeferredValue(search);
  const fullTree = useMemo(() => buildPickerTree(spec), [spec]);
  const tree = useMemo(() => searchPickerTree(fullTree, deferredSearch), [fullTree, deferredSearch]), capped = atSubjectLimit(picks);
  const nodes = useMemo(() => {
    const map = new Map<string, PickerNode>();
    const visit = (branch: PickerNode[]) => branch.forEach(n => { map.set(`${n.kind}|${n.key}`, n); visit(n.children); });
    visit(fullTree); return map;
  }, [fullTree]);
  const matches = useMemo(() => {
    const count = (branch: PickerNode[]): number => branch.reduce((sum, n) => sum + Number(n.matched) + count(n.children), 0);
    return count(tree);
  }, [tree]);
  const branch = (nodes: PickerNode[]): React.ReactNode => <ul className="grid gap-1">{nodes.map(n => <li key={pickId({ ...n, relation: 'about' })} className="grid gap-1">
    <div className="flex min-h-8 items-center gap-2"><span className="text-sm">{n.kind === 'module' ? w('모듈', 'Module') : 'Event'} · {n.name}</span><span className="t-mono break-all text-text-secondary">{n.key}</span>
      {n.matched && <Button type="button" size="sm" variant="secondary" aria-label={`${n.kind === 'module' ? w('모듈', 'Module') : 'Event'} · ${n.name} ${w('추가', 'Add')}`} disabled={disabled || capped || picks.some(p => pickId(p) === `${n.kind}|${n.key}`)} onClick={() => onChange(addPick(picks, n).picks)}>{w('추가', 'Add')}</Button>}</div>
    {n.children.length > 0 && <div className="ml-3 border-l border-border-subtle pl-3">{branch(n.children)}</div>}
  </li>)}</ul>;
  return <section aria-label={w('대상 선택', 'Select subjects')} className="grid gap-3 rounded-md border border-border-subtle p-3">
    <div className="flex items-center gap-3"><h3 className="text-sm font-semibold">{w('대상 선택', 'Select subjects')}</h3><span role="status" className="text-xs text-text-secondary">{picks.length} / {SUBJECT_LIMIT}</span></div>
    <section aria-label={w(`선택한 대상 ${picks.length}`, `Selected targets ${picks.length}`)} className="grid gap-2">
      <h4 className="text-sm font-semibold">{w(`선택한 대상 ${picks.length}`, `Selected targets ${picks.length}`)}</h4>
      <ul className="grid gap-2">{picks.map(p => {
        const node = nodes.get(pickId(p)), subject = subjects?.find(s => s.targetKind === p.kind && s.targetKey === p.key);
        const gone = subject?.state === 'gone' || !!spec && !node;
        return <li key={pickId(p)} className="grid gap-1">
          <div className="grid grid-cols-[minmax(0,5rem)_auto_minmax(0,1fr)_minmax(0,8rem)_auto] items-center gap-1">
          <SubjectText text={p.key} className="t-mono min-w-0 truncate" /><StatusBadge tone="neutral">{p.kind === 'module' ? w('모듈', 'Module') : 'Event'}</StatusBadge><SubjectText text={node?.name ?? subject?.targetName ?? '—'} className="min-w-0 truncate text-sm" />
          <SpecSelect hideLabel label={`${p.key} ${w('관계', 'relation')}`} value={p.relation} disabled={disabled || !allowed} options={Object.entries(SUBJECT_RELATION_LABEL).map(([value, label]) => ({ value, label: w(label.ko, label.en) }))} onChange={value => onChange(setPickRelation(picks, pickId(p), value === 'context' ? 'context' : 'about'))} />
          <Button type="button" size="sm" variant="secondary" disabled={disabled || !allowed} aria-label={`${p.key} ${w('빼기', 'Remove')}`} onClick={() => onChange(removePick(picks, pickId(p)))}>{w('빼기', 'Remove')}</Button>
          </div>
          {gone && <p className="flex flex-wrap items-center gap-1 text-xs text-text-secondary"><StatusBadge tone="warning">{w('대상 사라짐', 'Target gone')}</StatusBadge><span>{w('대상 목록을 바꾸려면 이 대상을 빼 주세요.', 'Remove this missing target before changing the list.')}</span></p>}
        </li>;
      })}</ul>
    </section>
    {!allowed ? <p role="status" className="text-sm text-text-secondary">{w('대상을 고르려면 Item 작성 권한을 관리자에게 요청하세요.', 'Ask an administrator for Item writing permission to select subjects.')}</p>
      : !modelId ? <p role="status" className="text-sm text-text-secondary">{w('먼저 소유 모델을 골라 주세요.', 'Select the owner model first.')}</p>
      : !response ? <p role="status">{w('대상을 불러오는 중…', 'Loading subjects…')}</p>
      : response.outcome === 'forbidden' ? <p role="status">{w('명세를 볼 수 없습니다. 조회 권한을 관리자에게 요청하세요.', 'Ask an administrator for read permission to read specifications.')}</p>
      : malformed || !['ok', 'empty'].includes(response.outcome) ? <div role="alert"><p>{w('대상을 불러오지 못했습니다.', 'Could not load subjects.')}</p><Button type="button" size="sm" variant="secondary" onClick={query.refetch}>{w('다시 시도', 'Retry')}</Button></div>
      : !spec ? <p role="status" className="text-sm text-text-secondary">{w('발행된 명세가 없습니다. 명세를 발행한 뒤 대상을 고를 수 있습니다.', 'Publish a specification before selecting subjects.')}</p>
      : <><label htmlFor={`${uid}-search`} className="text-sm">{w('대상 검색', 'Search subjects')}</label><Input id={`${uid}-search`} value={search} onChange={e => setSearch(e.target.value)} disabled={disabled} />
        <div className="max-h-64 overflow-auto">{tree.length ? branch(tree) : <p role="status" className="text-sm text-text-muted">{w('검색 결과가 없습니다.', 'No matches.')}</p>}</div></>}
    <p role="status" aria-live="polite" aria-label={w('검색 결과 수', 'Match count')} className="text-xs text-text-secondary">{spec ? w(`검색 결과 ${matches}개`, `${matches} matches`) : ''}</p>
    {capped && <p role="status" className="text-xs text-text-secondary">{w('대상은 20개까지 고를 수 있습니다. 새 대상을 추가하려면 하나를 빼세요.', 'Remove a subject before adding another; the limit is 20.')}</p>}

  </section>;
}
