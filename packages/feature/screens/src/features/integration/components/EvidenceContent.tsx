import { FieldList, FieldRow } from '@ap/ui';
import { FeatureTimestamp } from '../../../components/FeatureTimestamp';
import { OriginalDisclosure } from '../../../components/OriginalDisclosure';
import {
  EVIDENCE_IMPORTANCE_LABELS,
  EVIDENCE_SENTIMENT_LABELS,
  EVIDENCE_SOURCE_TYPE_LABELS,
  SURVEY_TYPE_LABELS,
} from '../../../lib/copy/enum-labels';
import { EVIDENCE_COPY, EVIDENCE_SNAPSHOT_TEXT as COPY } from '../../../lib/copy/evidence';
import { HostLink, useHostSeam } from '../../../lib/host/host-seam';
import type { EvidenceInventoryItem } from '@ap/feature-shared';

export function EvidenceSource({
  item,
  linked = false,
}: { item: EvidenceInventoryItem; linked?: boolean }) {
  const { canLink } = useHostSeam();
  if (item.content_state === 'withheld') return null;
  if (item.source_type === 'voc' && item.source) {
    if (linked && canLink(item.source.route))
      return (
        <HostLink to={item.source.route} className="underline underline-offset-2">
          {item.source.display_id} · {item.source.title}
        </HostLink>
      );
    return (
      <span>
        {item.source.display_id} · {item.source.title}
      </span>
    );
  }
  if (item.source_type === 'survey_response' && item.source) {
    return (
      <span>
        {item.source.survey_display_id} · {SURVEY_TYPE_LABELS[item.source.survey_type]} ·{' '}
        {item.source.question_label}
        {item.source.identity_protected ? ` · ${EVIDENCE_COPY.identityProtected}` : ''}
      </span>
    );
  }
  return null;
}
export function EvidenceContent({ item }: { item: EvidenceInventoryItem }) {
  const { lang = 'ko' } = useHostSeam();
  const available = item.content_state === 'available';
  const sourceTypes = lang === 'ko' ? EVIDENCE_SOURCE_TYPE_LABELS : COPY.sourceType;
  const sentiments = lang === 'ko' ? EVIDENCE_SENTIMENT_LABELS : COPY.sentimentValue;
  const importance = lang === 'ko' ? EVIDENCE_IMPORTANCE_LABELS : COPY.importanceValue;
  return <>
    <FieldList className="break-keep">
      <FieldRow label={COPY.finding[lang]} inset="none">{item.finding.display_id} · {item.finding.title}</FieldRow>
      <FieldRow label={COPY.source[lang]} inset="none">
        {sourceTypes[item.source_type]}
        {available && item.source_type !== 'note' && item.source && <> · <EvidenceSource item={item} linked /></>}
      </FieldRow>
      <FieldRow label={COPY.summary[lang]} inset="none">
        {available ? <span className="whitespace-pre-wrap break-words">{item.quote_or_summary}</span> : COPY.withheld[lang]}
      </FieldRow>
      <FieldRow label={COPY.sentiment[lang]} inset="none">{item.sentiment ? sentiments[item.sentiment] : '—'}</FieldRow>
      <FieldRow label={COPY.importance[lang]} inset="none">{item.importance ? importance[item.importance] : '—'}</FieldRow>
      <FieldRow label={COPY.recordedAt[lang]} inset="none">
        <FeatureTimestamp at={item.created_at} notation="summary" className="tabular-nums break-keep" />
      </FieldRow>
    </FieldList>
    {available && <OriginalDisclosure>
      <pre className="whitespace-pre-wrap break-all font-mono">{JSON.stringify(item, null, 2)}</pre>
    </OriginalDisclosure>}
  </>;
}

export function EvidenceMetadata({
  item,
  linked = false,
}: { item: EvidenceInventoryItem; linked?: boolean }) {
  const { lang = 'ko' } = useHostSeam();
  const sourceTypes = lang === 'ko' ? EVIDENCE_SOURCE_TYPE_LABELS : COPY.sourceType;
  const sentiments = lang === 'ko' ? EVIDENCE_SENTIMENT_LABELS : COPY.sentimentValue;
  const importance = lang === 'ko' ? EVIDENCE_IMPORTANCE_LABELS : COPY.importanceValue;
  return (
    <span className="text-xs text-text-muted">
      <span>{sourceTypes[item.source_type]}</span>
      {item.content_state === 'available' && item.source_type !== 'note' && item.source && (
        <>
          {' '}
          · <EvidenceSource item={item} linked={linked} />
        </>
      )}
      {item.sentiment && <span> · {sentiments[item.sentiment]}</span>}
      {item.importance && <span> · {importance[item.importance]}</span>}
    </span>
  );
}
