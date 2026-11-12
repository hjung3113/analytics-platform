import { Button } from '@ap/ui';
import type { EvidenceStateRow, ExcerptState, RoundDetail, RuleResult, ScreenProps, SourceState } from './contracts';
import { ReadView, Section } from './presentation';

/** Two independent axes, each with its own wording: «원본 확인됨» and «삭제됨»/«만료» are never claimed (the server cannot know either). */
export const EXCERPT_LABEL: Record<ExcerptState, string> = { not_submitted: '발췌 미제출', not_loaded: '발췌 열람 전', no_permission: '발췌 열람 권한 없음', unknown: '발췌 상태 알 수 없음' };
export const SOURCE_LABEL: Record<SourceState, string> = { no_permission: '원본 열람 권한 없음', hash_mismatch: '해시 불일치', not_checked: '원본 미확인' };
const SOURCE_REASON: Partial<Record<SourceState, string>> = { no_permission: '원본 열람 권한이 없어 열 수 없습니다.', hash_mismatch: '샘플 목록의 해시와 달라 열 수 없습니다.' };

/** Mounted only while the rule drawer shows this rule, so every open re-runs the read; the page hook hides a cached prior result. */
export function RuleEvidence({ api, rule, round, onOpenSource, onExcerpt }: Pick<ScreenProps, 'api'> & { rule: RuleResult; round: RoundDetail; onOpenSource?: ((order: number, line: number) => void) | undefined; onExcerpt(index: number): void }) {
  const query = api.useRead<{ rows: EvidenceStateRow[] }>('evidenceStates', { ruleResultId: rule.id }, rule.evidence.length > 0);
  if (rule.evidence.length === 0) return <Section title="근거·원본 라인"><p role="status" className="text-xs text-text-secondary">근거 위치 없음 · 발췌 없음</p></Section>;
  return <Section title="근거·원본 라인"><ReadView query={query} empty="근거 상태를 읽을 수 없습니다. 규칙 결과가 보이지 않거나 열람 권한이 없습니다.">{data => data.rows.length === 0 ? <p role="status" className="text-xs text-text-secondary">근거 위치 없음 · 발췌 없음</p> : data.rows.map(row => {
    const { fileRef, line } = row.evidenceRef;
    const file = round.sampleSet.files.find(f => f.fileRef === fileRef);
    const sourceOpen = !!onOpenSource && !!file && row.sourceState === 'not_checked' && file.sha256 === row.evidenceRef.fileSha256;
    const reason = SOURCE_REASON[row.sourceState];
    return <div key={row.evidenceIndex} className="grid min-w-0 gap-2 text-xs"><p className="break-all font-mono">{fileRef}:{line}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2"><dt className="text-text-secondary">발췌</dt><dd>{EXCERPT_LABEL[row.excerptState]}</dd><dt className="text-text-secondary">원본</dt><dd className={row.sourceState === 'hash_mismatch' ? 'text-text-warning-label' : undefined}>{SOURCE_LABEL[row.sourceState]}</dd></dl>
      <div className="flex flex-wrap gap-2">{sourceOpen ? <Button variant="link" size="toolbar" aria-label={`${rule.ruleId} ${fileRef}:${line} 원본에서 보기`} onClick={() => onOpenSource(file.order, line)}>원본에서 보기</Button> : <><span className="text-text-muted">원본 확인 불가</span>{reason ? <span className="text-text-muted">{reason}</span> : null}</>}{row.excerptState === 'not_loaded' ? <Button variant="link" size="toolbar" onClick={() => onExcerpt(row.evidenceIndex)}>발췌 보기</Button> : null}</div></div>;
  })}</ReadView></Section>;
}
