import { ManagementLayout, PageKeyWarning, PlatformPage, QueryView, usePageKeyRules } from '@ap/components';
import { useMenuQuery, usePlatform, type PageProps } from '@ap/kernel';
import { Tabs, TabsList, TabsTrigger } from '@ap/ui';
import { catalogStatusEndpoint, isCatalogKey, isUuid } from '../endpoints';
import { CoverageTab } from './CoverageTab';
import { EmptyNote } from './presentation';
import { RuleDrawer, RuleSetHistory } from './RuleDrawer';
import { RulesTable } from './RulesTable';

const PAGE_RULES = [
  { key: 'tab', label: { ko: '탭', en: 'Tab' }, valid: (s: string) => s === 'rules' || s === 'coverage' },
  ...(['modelId', 'softwareId'] as const).map(key => ({ key, label: { ko: key, en: key }, valid: isUuid })),
  ...(['ruleSetKey', 'ruleKey'] as const).map(key => ({ key, label: { ko: key, en: key }, valid: isCatalogKey })),
  { key: 'focus', label: { ko: '명세 요구사항', en: 'Specification requirement' }, valid: (s: string) => s.length > 0 && !/[\u0000-\u001f\u007f-\u009f]/.test(s) },
  ...(['q', 'targetQ'] as const).map(key => ({ key, label: { ko: key, en: key }, valid: (s: string) => s.length <= 200 && !s.includes('\u0000') })),
];
export default function RulesScreen({ params = {} }: PageProps) {
  const { pageParam, setPage, navigate, linkTo } = usePlatform();
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
      {query.response?.outcome === 'ok' && query.response.data && <p className="min-w-0 break-all text-xs text-text-secondary">Validator {query.response.data.sourceSystem ?? '미수신'} · 마지막 보고 {query.response.data.lastReportedAt ?? '없음'}{query.response.data.validatorVersion ? ` · ${query.response.data.validatorVersion}` : ''}</p>}
      <Tabs value={tab} onValueChange={next => setPage({ tab: next, q: null, targetQ: null, filter: null, sort: null, page: null, ruleSetKey: null, ruleKey: null, focus: null })}>
        <TabsList aria-label="검증 규칙 탭"><TabsTrigger value="rules">규칙</TabsTrigger><TabsTrigger value="coverage">명세 커버리지</TabsTrigger></TabsList>
      </Tabs>
      <QueryView query={query}>{status => <div className="grid min-w-0 gap-3">
        <ManagementLayout table={tab === 'coverage' ? <CoverageTab modelId={modelId} softwareId={softwareId} /> : !status.received ? <EmptyNote title="카탈로그를 아직 받지 못했습니다" body="규칙 카탈로그를 보려면 Validator의 보고가 필요합니다." /> : <RulesTable />}
          drawer={tab === 'rules' && status.received && ruleSetKey ? ruleKey ? <RuleDrawer key={JSON.stringify([ruleSetKey, ruleKey])} ruleSetKey={ruleSetKey} ruleKey={ruleKey} modelId={modelId} softwareId={softwareId} onClose={close} /> : <RuleSetHistory ruleSetKey={ruleSetKey} onClose={close} /> : undefined} />
      </div>}</QueryView>
    </>}
  </div></PlatformPage>;
}
