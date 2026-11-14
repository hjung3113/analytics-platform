import { useCallback, useState } from 'react';
import { ManagementLayout, PageKeyWarning, PlatformPage, QueryView, usePageKeyRules } from '@ap/components';
import { useMenuQuery, usePlatform, type PageProps } from '@ap/kernel';
import { encodeFilterParams, parseFilterParams, formatInstant, formatWallClock } from '@ap/contracts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ap/ui';
import { catalogStatusEndpoint, isCatalogKey, isUuid, ruleFilterSpecs } from '../endpoints';
import { CoverageTab } from './CoverageTab';
import { EmptyNote } from './presentation';
import { RuleDrawer, RuleSetHistory } from './RuleDrawer';
import { RulesTable } from './RulesTable';

const PAGE_RULES = [
  { key: 'tab', label: { ko: '탭', en: 'Tab' }, valid: (s: string) => s === 'rules' || s === 'coverage' },
  ...(['modelId', 'softwareId'] as const).map(key => ({ key, label: { ko: key, en: key }, valid: isUuid })),
  ...(['ruleSetKey', 'ruleKey'] as const).map(key => ({ key, label: { ko: key, en: key }, valid: isCatalogKey })),
  { key: 'focus', label: { ko: '명세 요구사항', en: 'Specification requirement' }, valid: (s: string) => s.length > 0 && !/[\u0000-\u001f\u007f-\u009f]/.test(s) },
  ...(['q'] as const).map(key => ({ key, label: { ko: key, en: key }, valid: (s: string) => s.length <= 200 && !s.includes('\u0000') })),
];
export default function RulesScreen({ params = {} }: PageProps) {
  const { page, pageParam, pageParams, setPage, navigate, linkTo } = usePlatform();
  const [focusOnOpen, setFocusOnOpen] = useState(false);
  const onOpen = useCallback(() => setFocusOnOpen(true), []);
  const keys = usePageKeyRules(PAGE_RULES);
  const tab = pageParam('tab') ?? 'rules';
  // A path initializes the drawer; an explicit later selection (including history without a ruleKey) wins.
  const selectedSet = pageParam('ruleSetKey');
  const ruleSetKey = selectedSet ?? params.ruleSetKey ?? null;
  const ruleKey = selectedSet !== null ? pageParam('ruleKey') : params.ruleKey ?? pageParam('ruleKey');
  const modelId = pageParam('modelId')?.toLowerCase() ?? null, softwareId = pageParam('softwareId')?.toLowerCase() ?? null;
  const query = useMenuQuery(catalogStatusEndpoint, {}, !keys.invalid);
  const close = () => {
    if (params.ruleSetKey) navigate(linkTo('log-rules', { page: { tab: 'rules', ...(modelId ? { modelId } : {}), ...(softwareId ? { softwareId } : {}) } }));
    else setPage({ ruleSetKey: null, ruleKey: null });
  };
  return <PlatformPage description="Validator가 보고한 규칙과 명세 요구사항의 선언 구성을 봅니다."><div className="grid min-w-0 gap-3 break-keep">
    {keys.invalid ? <PageKeyWarning sentences={keys.sentences} onRecover={keys.recover} /> : <>
      {query.response?.outcome === 'ok' && query.response.data && <p className="min-w-0 break-words text-xs text-text-secondary">Validator {query.response.data.sourceSystem ?? '미수신'} · 마지막 보고 {reportTime(query.response.data.lastReportedAt)}{query.response.data.validatorVersion ? ` · ${query.response.data.validatorVersion}` : ''}</p>}
      <Tabs value={tab} onValueChange={next => setPage({ tab: next, q: null, filter: null, sort: null, page: null, ruleSetKey: null, ruleKey: null, focus: null })}>
        <TabsList aria-label="검증 규칙 탭"><TabsTrigger value="rules">규칙</TabsTrigger><TabsTrigger value="coverage">명세 커버리지</TabsTrigger></TabsList>
        {(['rules', 'coverage'] as const).map(value => <TabsContent key={value} value={value}>
          <QueryView query={query}>{status => <div className="grid min-w-0 gap-3">
            <ManagementLayout table={value === 'coverage' ? <CoverageTab onOpenRule={onOpen} modelId={modelId} softwareId={softwareId} /> : !status.received ? <EmptyNote title="카탈로그를 아직 받지 못했습니다" body="규칙 카탈로그를 보려면 Validator의 보고가 필요합니다." /> : <RulesTable onOpen={onOpen} />}
              drawer={value === 'rules' && status.received && ruleSetKey ? ruleKey ? <RuleDrawer key={JSON.stringify([ruleSetKey, ruleKey])} focusOnOpen={focusOnOpen} ruleSetKey={ruleSetKey} ruleKey={ruleKey} modelId={modelId} softwareId={softwareId} onClose={close} /> : <RuleSetHistory focusOnOpen={focusOnOpen} ruleSetKey={ruleSetKey} onClose={close} onViewRules={() => {
                const parsed = parseFilterParams(pageParams('filter'), ruleFilterSpecs);
                const filters = parsed.ok ? parsed.filters.filter(filter => filter.id !== 'ruleSetKey') : [];
                const patch = { tab: 'rules', ruleSetKey: null, ruleKey: null, page: null, filter: encodeFilterParams([...filters, { id: 'ruleSetKey', op: 'in' as const, value: [ruleSetKey] }]) };
                if (params.ruleSetKey) navigate(linkTo('log-rules', { page: { ...Object.fromEntries(page), ...patch } }));
                else setPage(patch);
              }} /> : undefined} />
          </div>}</QueryView>
        </TabsContent>)}
      </Tabs>
    </>}
  </div></PlatformPage>;
}

/** Server report timestamps are instants; legacy synthetic wall-clock fixtures retain their written calendar digits. */
function reportTime(value: string | null): string {
  if (!value) return '없음';
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? formatInstant(value, 'ko') : formatWallClock(value);
}
