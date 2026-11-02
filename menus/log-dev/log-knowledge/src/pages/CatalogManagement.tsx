import { useEffect, useRef, useState } from 'react';
import { usePlatform } from '@ap/kernel';
import { ManagementLayout, PageKeyWarning, PlatformPage, usePageKeyRules } from '@ap/components';
import { Button, Tabs, TabsList, TabsTrigger } from '@ap/ui';
import { CATALOG_TABS, TAB_LABEL, defaultFilterParams, isCatalogTab, isFocusValue, tabOf, tabPatch, type CatalogKind, type CatalogRow } from './catalogModel';
import { CatalogDrawer } from './CatalogDrawer';
import { CatalogTable } from './CatalogTable';
import { useCatalogOptions } from './useCatalogOptions';

const RULES = [
  { key: 'tab', label: { ko: '탭', en: 'Tab' }, valid: isCatalogTab },
  { key: 'focus', label: { ko: '열린 항목', en: 'Open row' }, valid: isFocusValue },
];
const NO_COUNTS: Partial<Record<CatalogKind, number>> = {};

/**
 * 로그 지식 허브 카탈로그 관리 (#1194, owner-confirmed variant A): four tabs (page key `tab`, default 모델), a server-paged table per tab
 * and one detail drawer (`focus` = row id or `new`) for create and edit. Every table condition is the hidden repeated key `filter`.
 */
export default function CatalogManagement() {
  const { pageParam, pageParams, setPage } = usePlatform();
  const keys = usePageKeyRules(RULES);
  const tab = tabOf(pageParam('tab'));
  const q = pageParam('q') ?? '', focus = pageParam('focus');
  const [counts, setCounts] = useState(NO_COUNTS);
  // Server reads are not refreshed by a write (backlog #502), so a write remounts the table, which reads its URL page again.
  const [revision, setRevision] = useState(0);
  const rowsRef = useRef(new Map<string, CatalogRow>());
  const kind = tab === 'invalid' ? null : tab;
  const options = useCatalogOptions({ vendors: kind === 'model', processes: kind === 'model', models: kind === 'software' });

  // A bare address opens the default tab with the 상태 filter at 활성; a later clear of the filter stays cleared (and in the URL).
  const entered = useRef(false);
  useEffect(() => {
    if (entered.current) return;
    entered.current = true;
    if (pageParam('tab') === null && pageParams('filter').length === 0 && pageParam('q') === null) setPage({ filter: defaultFilterParams() }, { replace: true });
    // Runs once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const body = keys.invalid || kind === null ? <PageKeyWarning sentences={keys.sentences} onRecover={keys.recover} /> : <div className="grid min-w-0 gap-3">
    <Tabs value={kind} onValueChange={next => { if (isCatalogTab(next)) setPage(tabPatch({ tab: next, filter: defaultFilterParams() })); }}>
      <TabsList aria-label="카탈로그 종류">
        {CATALOG_TABS.map(id => <TabsTrigger key={id} value={id}>{TAB_LABEL[id]}{counts[id] !== undefined && <span className="tabular ml-1.5 text-text-muted">{counts[id]}</span>}</TabsTrigger>)}
      </TabsList>
    </Tabs>
    <CatalogTable key={`${kind}:${revision}`} kind={kind} q={q} focus={focus} rowsRef={rowsRef} options={options}
      onTotal={(k, total) => setCounts(c => (c[k] === total ? c : { ...c, [k]: total }))} />
  </div>;
  return <PlatformPage description="제조사·공정·모델·SW 버전 기준 목록을 관리합니다. 비활성화해도 기존 연결은 그대로 남습니다."
    primaryAction={kind && <Button type="button" onClick={() => setPage({ focus: 'new' })}>{TAB_LABEL[kind]} 추가</Button>}>
    <ManagementLayout table={body}
      drawer={!keys.invalid && kind && focus && <CatalogDrawer kind={kind} focus={focus} rowsRef={rowsRef} options={options} onWritten={() => setRevision(n => n + 1)} />} />
  </PlatformPage>;
}
