import { ITEM_RELATION_LIMITS, type ItemRelation, type ItemRelationInput, type ItemRelationKind } from '../../endpoints';
import { decodeKey } from '../spec/specModel';

export type RelationRow = { kind: ItemRelationKind; source: string; target: string; predicate: 'before' | 'after' };
export const emptyRelation = (): RelationRow => ({ kind: 'observed', source: '', target: '', predicate: 'before' });
export const relationRowsOf = (relations: readonly ItemRelation[] = []): RelationRow[] => relations.map(({ kind, source, target, predicate }) => ({ kind, source, target, predicate }));
const eventInput = (key: string) => {
  const [module = '', event = ''] = key.trim().split('/').map(decodeKey);
  return { module, event };
};
export const relationInputs = (rows: readonly RelationRow[]): ItemRelationInput[] => rows.map(row => ({
  kind: row.kind, source: eventInput(row.source), target: eventInput(row.target), predicate: row.predicate,
}));

/** Client checks keep incomplete rows out of a write; the server owns key normalization and resolution. */
export function validateRelations(rows: readonly RelationRow[]): Record<string, string> {
  const errors: Record<string, string> = {}, seen = new Set<string>();
  if (rows.length > ITEM_RELATION_LIMITS.relations) errors['relations'] = 'Event 관계 기록은 20개까지 추가할 수 있습니다.';
  rows.forEach((row, i) => {
    const source = row.source.trim().normalize('NFKC').toUpperCase(), target = row.target.trim().normalize('NFKC').toUpperCase();
    const valid = (key: string) => key.split('/').length === 2 && key.split('/').every(part => part.trim() !== '') && key.length <= 1200;
    const signature = JSON.stringify([row.kind, ...(row.predicate === 'before' ? [source, target] : [target, source])]);
    if (!valid(source) || !valid(target)) errors[`relations.${i}`] = 'Event A와 Event B를 MODULE/EVENT 키로 입력하세요.';
    else if (source === target) errors[`relations.${i}`] = '관계의 양쪽이 같은 Event입니다.';
    else if (seen.has(signature)) errors[`relations.${i}`] = '같은 종류와 순서의 관계가 이미 있습니다.';
    seen.add(signature);
  });
  return errors;
}
