/** Synthetic read data. The grade/mark labels have no domain meaning. */
import type { RuleResult } from '../endpoints';
import { fixtureId, rules } from './fixtures';
export const opinionScale = { grades: [1, 2, 3, 4].map(n => ({ key: `g${n}`, label: `등급 ${n}` })), marks: [1, 2].map(n => ({ key: `m${n}`, label: `표식 ${n}` })) };
const at = '2026-11-07T00:35:00Z';
type Summary = NonNullable<RuleResult['opinion']>;
function summary(gradeIndex: number, markIndex: number | null, hasNote: boolean, count = 1): Summary {
  return { grade: opinionScale.grades[gradeIndex]!, mark: markIndex === null ? null : opinionScale.marks[markIndex]!, hasNote, at, count };
}
export const opinionRules: RuleResult[] = Array.from({ length: 5 }, (_, i) => ({
  ...structuredClone(rules[i === 0 ? 0 : 2]!), id: fixtureId(177801 + i), ruleId: `RULE-00${i + 1}`,
  ...(i === 4 ? { result: 'FAIL', observed: '순서 불일치' } : {}),
  ...(i === 2 ? { evidence: [rules[2]!.evidence[0]!, { ...rules[2]!.evidence[0]!, line: 191 }] } : {}),
  opinion: i === 0 ? null : i === 1 ? summary(0, null, false) : i === 2 ? summary(1, 0, true, 2) : i === 3 ? { ...summary(0, null, false), grade: { key: 'g_retired', label: null }, mark: { key: 'm_retired', label: null } } : summary(3, 1, true),
}));
export const unlinkedOpinions = [
  { id: fixtureId(1778601), itemKey: 'ITEM-006', ...summary(2, 0, true) },
  { id: fixtureId(1778602), itemKey: 'ITEM-007', ...summary(0, null, false) },
];
// Only the item-specific history read includes note bodies and producer references.
export const opinionHistory = [...opinionRules.filter(r => r.opinion).map(r => ({ id: r.id, itemKey: r.ruleId, ruleResultId: r.id, opinion: r.opinion!, evidence: r.evidence })), ...unlinkedOpinions.map(row => ({ id: row.id, itemKey: row.itemKey, ruleResultId: null, opinion: row, evidence: [rules[2]!.evidence[0]!] }))].flatMap(item => {
  const latest = { id: `${item.id}-2`, itemKey: item.itemKey, ruleResultId: item.ruleResultId, ...item.opinion, inputRevision: 'r12', producer: 'model-x/p3', author: { id: fixtureId(52), displayName: '평가 작업자 2' }, note: item.opinion.hasNote ? '근거 1과 근거 2의 이벤트 순서를 다시 확인해 주세요.\n<sample> 표기는 질의 텍스트입니다.' : null, evidence: item.evidence.map(({ fileRef, line, fileSha256 }) => ({ fileRef, line, fileSha256 })) };
  return item.opinion.count === 1 ? [latest] : [latest, { ...latest, id: `${item.id}-1`, grade: opinionScale.grades[2]!, mark: null, author: { id: fixtureId(51), displayName: '평가 작업자 1' }, at: '2026-11-07T00:31:00Z', inputRevision: 'r11', producer: 'model-x/p2', note: '근거 1의 해석 형식을 확인했습니다.', evidence: latest.evidence.slice(0, 1) }];
}).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
