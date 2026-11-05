import { useId, useState } from 'react';
import { PlatformLink, usePlatform } from '@ap/kernel';
import { Button } from '@ap/ui';
import { SPEC_PUBLISH_PERMISSION, type ConceptMappingRow, type ConceptRelation } from '../../endpoints';
import { targetBodyOf, SUBJECT_RELATION_LABEL } from '../items/subjectModel';
import { conceptFieldErrors, CONCEPT_RELATION_LABEL, groupByConcept } from './conceptModel';
import { Pager, SpecField, SpecSelect, useSpecWords } from './SpecControls';
import { useConceptActions, useConceptMappings, useSpecSubjectItems } from './useConceptData';
export function EventRelatedItems({ modelId, identity }: { modelId: string; identity: string }) {
  const w = useSpecWords(), { linkTo } = usePlatform(), [page, setPage] = useState(0), query = useSpecSubjectItems(modelId, identity, true, page);
  const response = query.response, data = response?.outcome === 'ok' ? response.data : null;
  return <section className="grid gap-2"><h3 className="font-semibold">{w('관련 Item', 'Related Items')}</h3>
    {!response ? <p role="status">{w('관련 Item을 불러오는 중…', 'Loading related Items…')}</p>
      : response.outcome === 'forbidden' ? <p role="status">{w('관련 Item을 볼 수 없습니다. 조회 권한을 관리자에게 요청하세요.', 'Ask an administrator for read permission to read related Items.')}</p>
      : !['ok', 'empty'].includes(response.outcome) ? <div role="alert"><p>{w('관련 Item을 불러오지 못했습니다.', 'Could not load related Items.')}</p><Button size="sm" variant="secondary" onClick={query.refetch}>{w('다시 시도', 'Retry')}</Button></div>
      : !data?.rows.length ? <p role="status" className="text-text-secondary">{w('연결된 Item이 없습니다.', 'No related Items.')}</p>
      : <><ul className="grid gap-2">{data.rows.map(item => <li key={item.id} className="grid justify-items-start gap-1"><PlatformLink href={linkTo('log-knowledge-item', { params: { itemId: item.id } })}>KI-{item.itemNo} · {item.title}</PlatformLink><span className="text-xs text-text-secondary">{w(SUBJECT_RELATION_LABEL[item.subjectRelation].ko, SUBJECT_RELATION_LABEL[item.subjectRelation].en)}</span></li>)}</ul>{data.total > 200 && <Pager page={page} size={200} total={data.total} onChange={setPage} />}</>}
  </section>;
}
export function EventConceptProposer({ modelId, identity, rows, reload, open, onClose }: { modelId: string; identity: string; rows: ConceptMappingRow[]; reload: () => void; open: boolean; onClose: () => void }) {
  const w = useSpecWords(), { can } = usePlatform(), uid = useId(), actions = useConceptActions();
  const [conceptId, setConceptId] = useState('new'), [label, setLabel] = useState(''), [relation, setRelation] = useState<ConceptRelation>('equivalent'), [message, setMessage] = useState(''), [errors, setErrors] = useState<Record<string, string>>({}), [conflict, setConflict] = useState(false);
  const concepts = useConceptMappings({ kind: 'event', page: 0, pageSize: 200 }, open && can(SPEC_PUBLISH_PERMISSION));
  if (!can(SPEC_PUBLISH_PERMISSION)) return null;
  const options = groupByConcept((concepts.response?.outcome === 'ok' ? concepts.response.data?.rows ?? rows : rows).filter(r => r.kind === 'event')).map(g => ({ value: g.conceptId, label: g.conceptLabel }));
  async function propose() {
    if (conceptId === 'new' && !label.trim()) { setErrors({ label: w('새 개념 이름을 써 주세요.', 'Name the new concept.') }); return; }
    try {
      const result = await actions.propose({ modelId, targetKind: 'event', target: targetBodyOf('event', identity), ...(conceptId === 'new' ? { canonicalLabel: label.trim() } : { conceptId }), relationKind: relation });
      if (result.outcome === 'ok') { setMessage(w('제안을 추가했습니다. 아직 확정되지 않았습니다.', 'Proposal added. It is not confirmed yet.')); setErrors({}); onClose(); setLabel(''); reload(); }
      else if (result.outcome === 'conflict') setConflict(true);
      else if (result.outcome === 'invalid') { const mapped = conceptFieldErrors(result.fieldErrors); setErrors(Object.fromEntries(Object.entries(mapped).map(([key, value]) => [key, w(value.ko, value.en)]))); }
      else setErrors({ form: result.outcome === 'forbidden' ? w('명세 관리 권한을 관리자에게 요청하세요.', 'Ask an administrator for specification management permission.') : w('제안을 저장하지 못했습니다. 다시 시도해 주세요.', 'Could not save the proposal. Retry.') });
    } catch { setErrors({ form: w('제안 결과를 확인하지 못했습니다. 최신 목록을 확인하세요.', 'Could not verify the proposal. Check the latest list.') }); }
  }
  return <div className="grid gap-2">
    <p role="status" aria-live="polite" className={message ? 'text-sm' : 'sr-only'}>{message}</p>
    <p role="alert" aria-live="assertive" className={conflict || Object.keys(errors).length ? 'text-sm text-text-danger-label' : 'sr-only'}>{[conflict ? w('다른 사람이 먼저 바꿨습니다. 입력은 유지됩니다.', 'Someone changed this first. Your input is preserved.') : '', ...Object.values(errors)].filter(Boolean).join(' ')}</p>
    {open && <section aria-label={w('개념 제안 양식', 'Concept proposal form')} className="grid gap-2"><h3 className="font-semibold">{w('개념 제안', 'Propose a concept')}</h3><SpecSelect label={w('기존 개념 또는 새 개념', 'Existing or new concept')} value={conceptId} options={[{ value: 'new', label: w('새 개념 이름 쓰기', 'Name a new concept') }, ...options]} onChange={setConceptId} disabled={actions.pending} />
      {conceptId === 'new' && <SpecField id={`${uid}-label`} label={w('새 개념 이름', 'New concept name')} value={label} onChange={setLabel} required disabled={actions.pending} error={errors['label']} />}
      <SpecSelect label={w('개념 관계', 'Concept relation')} value={relation} options={Object.entries(CONCEPT_RELATION_LABEL).map(([value, label]) => ({ value, label: w(label.ko, label.en) }))} onChange={value => setRelation(value as ConceptRelation)} disabled={actions.pending} />
      {conflict && <div className="text-sm"><Button size="sm" variant="secondary" onClick={() => { reload(); setConflict(false); }}>{w('최신 불러오기', 'Reload latest')}</Button></div>}
      <div className="flex gap-2"><Button size="sm" disabled={actions.pending || !actions.ready || conflict} onClick={() => void propose()}>{actions.pending ? w('저장 중…', 'Saving…') : w('제안 추가', 'Add proposal')}</Button>
      <Button size="sm" variant="secondary" disabled={actions.pending} onClick={() => { setErrors({}); onClose(); }}>{w('취소', 'Cancel')}</Button></div>
    </section>}
  </div>;
}
