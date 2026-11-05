import { useId, useState } from 'react';
import { Button } from '@ap/ui';
import type { SpecChangeRow } from '../../endpoints';
import { useSpecWords } from './SpecControls';
/** The closed v1 change schema uses flat properties; keep unchanged context in the original JSON only. */
export function ChangeComparison({ row }: { row: SpecChangeRow }) {
  const w = useSpecWords(), id = useId(), [expanded, setExpanded] = useState(false);
  const before = row.change.before ?? {}, after = row.change.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  const labels: Record<string, string> = { name: w('이름', 'Name'), parentModule: w('상위 Module', 'Parent Module'), triggerRule: w('발생 조건', 'Trigger'), detailDocRef: w('문서 참조', 'Document reference'), type: w('자료형', 'Type'), unit: w('단위', 'Unit'), allowedValues: w('허용값', 'Allowed values'), description: w('설명', 'Description'), ruleRef: w('관계 근거', 'Relation reference') };
  const value = (v: unknown): string => v === undefined ? w('없음', 'Absent') : v === null ? w('미지정', 'Not set') : v === '' ? w('빈 값', 'Empty value') : Array.isArray(v) ? (v.length ? v.map(value).join(', ') : w('없음', 'None')) : typeof v === 'object' ? Object.entries(v).map(([key, item]) => `${labels[key] ?? key}: ${value(item)}`).join(' · ') : String(v);
  return <div className="grid min-w-0 gap-2 text-sm">
    <p><code className="t-mono rounded-sm border border-border-subtle bg-surface-sunken px-1.5 py-0.5 break-all">{row.targetKey}</code></p>
    {keys.length > 0 ? <dl className="grid gap-2">{keys.map(key => <div key={key} className="grid gap-1"><dt className="font-medium">{labels[key] ?? key}</dt><dd className="whitespace-pre-wrap break-words text-text-secondary">{w('전', 'Before')}: {value(before[key])} → {w('후', 'After')}: {value(after[key])}</dd></div>)}</dl> : <p className="text-text-secondary">{row.changeKind === 'behavior' ? w('속성 변경 없이 동작 메모만 기록합니다.', 'Records a behavior note without changing properties.') : w('변경 전후의 속성 값이 같습니다.', 'Property values are unchanged.')}</p>}
    {row.note && <p className="whitespace-pre-wrap break-words">{row.note}</p>}
    <p className="break-words text-xs text-text-secondary">{w('기준', 'Basis')} r{row.basedOnRevNo}{row.revalidationRevNo ? ` · ${w('재검토 기준', 'Revalidation basis')} r${row.revalidationRevNo}` : ''} · {w('근거', 'Evidence')}: {row.evidenceRef ?? w('등록된 근거가 없습니다.', 'No evidence reference recorded.')}</p>
    <div><Button size="sm" variant="link" aria-expanded={expanded} aria-controls={expanded ? id : undefined} onClick={() => setExpanded(!expanded)}>{w('원본 JSON 보기', 'View original JSON')}</Button></div>
    {expanded && <pre id={id} className="max-w-full overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(row.change, null, 2)}</pre>}
  </div>;
}
