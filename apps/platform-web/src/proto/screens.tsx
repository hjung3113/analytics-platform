// THROWAWAY #595 — never merge.
// Static mock bodies of the FeedbackOps screens inside the platform shell. Column names and copy follow the FeedbackOps originals;
// rows are synthetic. Variant A: one 50px header (`FeedbackOps › 메뉴` + the screen's buttons), scope picker lives in the sidebar.
// Variant B: platform header (`FeedbackOps › 메뉴`) + FeedbackOps' own title line (title, count, buttons, scope picker), saved views in the filter row.
import { useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, Download, Link2, Paperclip, Plus, Save, Star } from 'lucide-react';
import { useI18n, usePlatform } from '@ap/kernel';
import {
  Button, cn, DetailPanelHeader, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, FieldRow, ListShell, ObjectRow, PageShell,
  PanelSectionTitle, PanelTitleBlock, SeverityIndicator, StatusBadge, UserAvatar, type SeverityEnum, type Tone,
} from '@ap/ui';
import { ScopeDropdown } from './Scope';
import { ALL_SYSTEMS, PROTO, setEntry, useEntry } from './state';

// ---------- frame ----------

function ReturnLine() {
  const { back } = useEntry();
  const { navigate } = usePlatform();
  if (back === null) return null;
  return <div className="flex h-8 shrink-0 items-center justify-between border-b border-border-subtle bg-surface-sunken px-4 text-xs">
    <button type="button" onClick={() => { setEntry({ back: null }); navigate(back.url); }} className="flex items-center gap-1 font-medium text-accent-primary hover:underline">
      <ArrowLeft className="size-3.5" aria-hidden />{back.label}로 돌아가기
    </button>
    <span className="text-text-muted">{back.system}에서 왔습니다</span>
  </div>;
}

/** The platform's page head as MARS draws it (PlatformPage): system › title, ☆ favourite, actions on the right. */
function PlatformHead({ menuId, count, actions }: { menuId: string; count?: string; actions?: ReactNode }) {
  const { registry, favorites, toggleFavorite } = usePlatform();
  const { t, tx } = useI18n();
  const menu = registry.menuById(menuId);
  const fav = favorites.includes(menuId);
  return <header className="flex h-[50px] shrink-0 items-center justify-between gap-3 overflow-x-auto border-b border-border-subtle bg-surface-canvas px-4">
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <nav aria-label={t('breadcrumb')} className="flex min-w-0 items-center gap-1 text-xs text-text-muted">
        <span className="min-w-0 truncate">FeedbackOps</span><ChevronRight className="size-3 shrink-0" aria-hidden />
      </nav>
      <h1 className="min-w-28 shrink truncate text-sm font-semibold text-text-primary">{tx(menu.label)}</h1>
      <button type="button" onClick={() => toggleFavorite(menuId)} aria-pressed={fav} aria-label={fav ? t('removeFavorite') : t('addFavorite')} title={fav ? t('removeFavorite') : t('addFavorite')}
        className="grid size-6 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover hover:text-accent-warn">
        <Star className={cn('size-3.5', fav && 'fill-accent-warn text-accent-warn')} aria-hidden />
      </button>
      {count && <span className="text-xs text-text-muted">{count}</span>}
    </div>
    {actions && <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">{actions}</div>}
  </header>;
}

function Frame({ menuId, title, count, actions, tabs, views, list, detail, children }: {
  menuId: string; title: string; count?: string; actions?: ReactNode; tabs?: ReactNode; views?: boolean; list?: ReactNode; detail?: ReactNode; children?: ReactNode;
}) {
  const a = PROTO.variant === 'A';
  const header = a ? undefined : { title, subtitle: count, actions: <>{actions}<ScopeDropdown layout="bar" /></> };
  const tabsRow = tabs === undefined && !views ? undefined : <div className="flex w-full items-center gap-2">{!a && views && <SavedViews />}{tabs}</div>;
  return <div className="flex h-full min-h-0 flex-col">
    <PlatformHead menuId={menuId} count={a ? count : undefined} actions={a ? actions : undefined} />
    <ReturnLine />
    {list !== undefined
      ? <ListShell toolbar={header} tabs={tabsRow} list={list} detailPanel={detail} />
      : <PageShell header={header} fluid>{tabsRow && <div className="mb-4 flex h-8 items-center">{tabsRow}</div>}{children}</PageShell>}
  </div>;
}

function SavedViews() {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="outline" size="toolbar">보기: 수신함<ChevronDown className="size-3" aria-hidden /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-56">
      <DropdownMenuItem>수신함</DropdownMenuItem><DropdownMenuItem>내가 맡은 높음 VOC</DropdownMenuItem><DropdownMenuItem>2주 넘은 미해결</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

function Chips({ items, active }: { items: string[]; active: string }) {
  return <div role="tablist" className="flex items-center gap-1">{items.map(label => <button key={label} type="button" role="tab" aria-selected={label === active}
    className={cn('h-7 rounded-pill px-3 text-xs', label === active ? 'bg-surface-row-selected font-semibold text-text-primary' : 'text-text-secondary hover:bg-surface-row-hover')}>{label}</button>)}</div>;
}

const HeaderButton = ({ icon, children, primary }: { icon?: ReactNode; children: ReactNode; primary?: boolean }) =>
  <Button variant={primary ? 'default' : 'outline'} size="toolbar">{icon}{children}</Button>;

// ---------- mock data ----------

const NAMES = ['박서연', '이도윤', '최민호', '정하은', '김지후'];
type Voc = { id: string; title: string; severity: SeverityEnum; status: [string, Tone]; system: string; area: string | null; at: string; owner: string | null; reporter: string; body: string };
const VOCS: Voc[] = [
  { id: 'VOC-1042', title: '사이클타임 상세 P95 툴팁의 단위가 초로 표시됩니다', severity: 'high', status: ['담당자 배정됨', 'warning'], system: 'MARS', area: '사이클타임 상세', at: '10분 전', owner: '박서연', reporter: '한지민', body: '툴팁에 표시되는 P95 값이 ms가 아니라 초 단위로 보입니다. 같은 기간의 표와 값이 1000배 차이가 나서 혼동했습니다.' },
  { id: 'VOC-1041', title: '생산성 개요 Excel 내보내기에서 공정명이 빠집니다', severity: 'medium', status: ['검토 중', 'info'], system: 'MARS', area: '생산성 개요', at: '1시간 전', owner: null, reporter: '오세훈', body: '내보내기 파일 두 번째 시트에 공정명 열이 없습니다. 화면 표에는 있습니다.' },
  { id: 'VOC-1040', title: '설비 동작 분석에서 공정 필터가 초기화됩니다', severity: 'high', status: ['접수됨', 'info'], system: 'CLAS', area: '동작시간 분석', at: '2시간 전', owner: null, reporter: '윤재석', body: '기간을 바꾸면 선택해 둔 공정 필터가 사라집니다.' },
  { id: 'VOC-1038', title: '지표 카탈로그 검색이 영문 약어를 찾지 못합니다', severity: 'low', status: ['검토 중', 'info'], system: 'BRAVO', area: '지표 카탈로그', at: '어제', owner: '이도윤', reporter: '강유진', body: 'CT, WIP 같은 약어로는 검색 결과가 비어 있습니다.' },
  { id: 'VOC-1036', title: '분석 보드에서 패널 순서가 저장되지 않습니다', severity: 'medium', status: ['처리 중', 'warning'], system: 'MARS', area: null, at: '어제', owner: '최민호', reporter: '배수민', body: '보드를 닫았다 열면 패널이 기본 순서로 돌아갑니다.' },
  { id: 'VOC-1033', title: '권한 요청 알림이 두 번 옵니다', severity: 'low', status: ['접수됨', 'info'], system: '표준 로그 개발', area: null, at: '2일 전', owner: null, reporter: '임채원', body: '승인 후 알림이 중복으로 도착합니다.' },
  { id: 'VOC-1030', title: '동작 흐름 차트 범례가 긴 설비명에서 잘립니다', severity: 'medium', status: ['담당자 배정됨', 'warning'], system: 'CLAS', area: '동작 흐름', at: '2일 전', owner: '정하은', reporter: '문성훈', body: '설비명이 20자를 넘으면 범례가 말줄임 처리되어 구분되지 않습니다.' },
  { id: 'VOC-1027', title: '지표 버전 발행 후 이전 버전 링크가 깨집니다', severity: 'critical', status: ['처리 중', 'warning'], system: 'BRAVO', area: '지표 정의', at: '3일 전', owner: '박서연', reporter: '송민아', body: '발행 직후 이전 버전 상세 링크가 404로 이동합니다.' },
  { id: 'VOC-1024', title: '홈 최근 방문에 삭제된 메뉴가 남아 있습니다', severity: 'low', status: ['해결됨', 'success'], system: 'MARS', area: '홈', at: '4일 전', owner: '김지후', reporter: '장도현', body: '최근 방문 정리 규칙을 바꿨습니다.' },
  { id: 'VOC-1019', title: '사이클타임 상세에서 설비 비교가 3개까지만 선택됩니다', severity: 'medium', status: ['검토 중', 'info'], system: 'MARS', area: '사이클타임 상세', at: '5일 전', owner: null, reporter: '신예린', body: '4개 이상 비교가 필요한 라인이 있습니다.' },
  { id: 'VOC-1015', title: '로그 규칙 검증 결과 표가 모바일 폭에서 겹칩니다', severity: 'low', status: ['접수됨', 'info'], system: '표준 로그 개발', area: '로그 규칙', at: '6일 전', owner: null, reporter: '조현우', body: '좁은 화면에서 열이 겹쳐 보입니다.' },
  { id: 'VOC-1011', title: 'CLAS 동작시간 합계가 표와 차트에서 다릅니다', severity: 'high', status: ['담당자 배정됨', 'warning'], system: 'CLAS', area: '동작시간 분석', at: '1주 전', owner: '이도윤', reporter: '백승아', body: '차트 합계가 표 합계보다 약 2% 큽니다.' },
];

// ---------- screens ----------

function Inbox({ menuId }: { menuId: string }) {
  const { ms } = useEntry();
  const { pageParam } = usePlatform();
  const [selected, setSelected] = useState<string | null>(null);
  const rows = VOCS.filter(v => ms === ALL_SYSTEMS || v.system === ms);
  const tab = pageParam('tab');
  const triage = menuId === 'fo-voc-triage';
  const tabs = triage
    ? <Chips items={['미분류', '높음', '미배정', '보류']} active={tab === 'high' ? '높음' : tab === 'unassigned' ? '미배정' : '미분류'} />
    : <Chips items={['전체', '연결 없음']} active={tab === 'no-link' ? '연결 없음' : '전체'} />;
  const voc = rows.find(v => v.id === selected);
  const filters = <div className="ml-auto flex items-center gap-2"><Button variant="outline" size="toolbar">필터</Button><Button variant="outline" size="toolbar">정렬</Button></div>;
  return <Frame menuId={menuId} title={triage ? 'Triage' : 'VOC 수신함'} count={`${rows.length * 4}건`}
    actions={<><HeaderButton icon={<Download className="size-3.5" aria-hidden />}>내보내기</HeaderButton><HeaderButton icon={<Save className="size-3.5" aria-hidden />}>보기 저장</HeaderButton></>}
    views={!triage} tabs={<>{tabs}{filters}</>}
    detail={voc ? <VocDetail voc={voc} onClose={() => setSelected(null)} /> : null}
    list={<div role="rowgroup" aria-label="VOC 목록">{rows.map(v => <ObjectRow key={v.id} severity={v.severity} selected={v.id === selected} onClick={() => setSelected(v.id)}
      title={<><span className="font-mono text-xs text-text-disabled">{v.id}</span> <span className="font-medium">{v.title}</span></>}
      badges={<StatusBadge tone={v.status[1]}>{v.status[0]}</StatusBadge>}
      meta={<span className="flex items-center gap-2 text-xs text-text-muted"><span className="font-medium text-text-secondary">{v.system}</span>
        {v.area ? <span>{v.area}</span> : <span className="text-text-warning-label">Analytics Area 없음</span>}<span>{v.at}</span></span>}
      trailing={<span className="flex items-center gap-1.5">{v.owner ? <UserAvatar user={{ display_name: v.owner }} size="sm" /> : <StatusBadge tone="danger">미배정</StatusBadge>}<UserAvatar user={{ display_name: v.reporter }} size="sm" /></span>} />)}</div>} />;
}

function VocDetail({ voc, onClose }: { voc: Voc; onClose: () => void }) {
  return <div className="flex h-full flex-col overflow-y-auto">
    <DetailPanelHeader kind="voc" id={voc.id} onClose={onClose} />
    <PanelTitleBlock title={voc.title} badges={<><StatusBadge tone={voc.status[1]}>{voc.status[0]}</StatusBadge><span className="flex items-center gap-1 text-xs"><SeverityIndicator severity={voc.severity} />{voc.severity === 'critical' ? '심각' : voc.severity === 'high' ? '높음' : voc.severity === 'medium' ? '중간' : '낮음'}</span></>} />
    <div className="space-y-3 px-4 pb-6">
      <FieldRow label="Triage" layout="property"><StatusBadge tone="info">미분류</StatusBadge></FieldRow>
      <FieldRow label="공개 상태" layout="property"><StatusBadge tone={voc.status[1]}>{voc.status[0]}</StatusBadge><span className="ml-2 text-xs text-text-muted">신고자에게 보이는 상태</span></FieldRow>
      <FieldRow label="Managed System" layout="property">{voc.system}</FieldRow>
      <FieldRow label="담당자" layout="property">{voc.owner ?? '미배정'}</FieldRow>
      <FieldRow label="신고자" layout="property">{voc.reporter}</FieldRow>
      <PanelSectionTitle>설명</PanelSectionTitle>
      <p className="text-sm text-text-secondary">{voc.body}</p>
      <p className="text-sm text-text-secondary">재현 경로: {voc.area ?? '지정되지 않음'} 화면에서 같은 조건으로 확인했습니다.</p>
      <PanelSectionTitle>연결</PanelSectionTitle>
      <p className="flex items-center gap-1.5 text-sm text-text-muted"><Link2 className="size-3.5" aria-hidden />연결된 Finding 없음</p>
      <p className="flex items-center gap-1.5 text-sm text-text-muted"><Paperclip className="size-3.5" aria-hidden />첨부 0개</p>
    </div>
  </div>;
}

const QUEUES: { title: string; count: number; detail: string; action: string; level: string; tone: Tone }[] = [
  { title: '미배정 VOC', count: 9, detail: '담당자가 지정되지 않은 VOC가 누적되어 있습니다. 우선 분류와 담당 배정이 필요합니다.', action: 'VOC 검토', level: '검토', tone: 'info' },
  { title: '높음 · 연결 없음', count: 4, detail: '높음·심각 VOC 중 Finding, Task Request, Task 연결이 없고, 소속 Cluster의 Finding 또는 Task Request 연결도 없는 항목입니다.', action: '높은 심각도 VOC 검토', level: '복구', tone: 'danger' },
  { title: '실행 계획 없는 Finding', count: 7, detail: '진행 중 상태의 Finding 중 Task Request 또는 Task 링크가 없는 항목입니다.', action: 'Finding 검토', level: '후속 조치', tone: 'warning' },
  { title: 'Released Task · 미해결 VOC', count: 3, detail: 'Task는 Released지만 연결된 공개 상태가 해결됨이 아닙니다.', action: '업데이트 검토', level: '후속 조치', tone: 'warning' },
  { title: '후속 조치 없는 부정 성과 Survey', count: 2, detail: '부정 성과 Survey 결과에 대한 후속 Finding/Task가 구성되어 있지 않습니다.', action: 'Survey 보기', level: '후속 조치', tone: 'warning' },
  { title: '검토 대기 중인 권한 요청', count: 5, detail: '워크스페이스 관리자 검토를 기다리는 상위 권한 요청입니다.', action: '요청 열기', level: '검토', tone: 'info' },
];

function Dashboard() {
  const { user } = usePlatform();
  return <Frame menuId="fo-dashboard" title={`안녕하세요, ${user.name}님`}>
    <p className="mb-4 text-sm text-text-secondary">오늘 확인할 운영 큐가 있습니다. 우선순위가 높은 큐부터 확인하세요.</p>
    <h3 className="mb-2 text-sm font-semibold">복구 · 후속 조치 큐</h3>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">{QUEUES.map(q => <section key={q.title} className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface-card p-4">
      <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">{q.title}</h4><StatusBadge tone={q.tone}>{q.level}</StatusBadge></div>
      <p className="text-2xl font-semibold tabular-nums">{q.count}</p>
      <p className="flex-1 text-xs leading-4 text-text-muted">{q.detail}</p>
      <div><Button variant="outline" size="toolbar">{q.action}</Button></div>
    </section>)}</div>
  </Frame>;
}

const FINDINGS: [string, string, string, Tone, string, string, string][] = [
  ['FND-231', '내보내기 파일에서 공정명이 누락되는 문제', '진행 중', 'warning', 'VOC Cluster', '박서연', 'TASK-118'],
  ['FND-230', '툴팁·표의 단위 표기가 화면마다 다름', '진행 중', 'warning', 'VOC', '이도윤', '없음'],
  ['FND-228', '공정 필터가 기간 변경 시 초기화됨', '초안', 'neutral', 'VOC', '정하은', '없음'],
  ['FND-226', '지표 버전 발행 직후 이전 버전 링크 오류', 'Task 전환됨', 'success', 'VOC', '박서연', 'TASK-112'],
  ['FND-224', 'Q3 만족도 조사의 낮은 점수 항목 정리', '진행 중', 'warning', 'Survey', '최민호', 'TASK-109'],
  ['FND-221', '분석 보드 패널 상태 저장 요구', '초안', 'neutral', '수동', '김지후', '없음'],
  ['FND-219', '긴 설비명 말줄임 처리 개선', 'Task 전환됨', 'success', 'VOC Cluster', '정하은', 'TASK-104'],
  ['FND-215', '권한 요청 알림 중복', '조치 불필요', 'neutral', 'VOC', '이도윤', '없음'],
];

function Findings() {
  return <Frame menuId="fo-findings" title="Findings" count="23건" actions={<><HeaderButton icon={<Download className="size-3.5" aria-hidden />}>내보내기</HeaderButton><HeaderButton icon={<Plus className="size-3.5" aria-hidden />} primary>Finding 생성</HeaderButton></>}
    tabs={<><Chips items={['전체', '진행 중', '초안', 'Task 전환됨']} active="전체" /><div className="ml-auto flex gap-2"><Button variant="outline" size="toolbar">필터</Button><Button variant="outline" size="toolbar">정렬</Button></div></>}
    list={<Table head={['ID', '제목', '상태', '출처', '담당자', '연결된 Task']} rows={FINDINGS.map(f => [<span key="i" className="font-mono text-xs">{f[0]}</span>, f[1], <StatusBadge key="s" tone={f[3]}>{f[2]}</StatusBadge>, f[4], f[5], f[6]])} />} />;
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return <table className="w-full border-collapse text-sm">
    <thead><tr className="border-b border-border-subtle bg-surface-sunken text-left text-xs text-text-muted">{head.map(h => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr></thead>
    <tbody>{rows.map((cells, i) => <tr key={i} className="min-h-row-default border-b border-border-subtle hover:bg-surface-row-hover">{cells.map((c, j) => <td key={j} className="px-4 py-2.5">{c}</td>)}</tr>)}</tbody>
  </table>;
}

const BOARD: [string, [string, string, string, string][]][] = [
  ['Backlog', [['TASK-121', '범례 말줄임 툴팁 추가', '정하은', '11월 릴리스'], ['TASK-120', 'Cluster 요약 문구 정리', '김지후', '없음']]],
  ['Todo', [['TASK-118', '내보내기 시트에 공정명 열 추가', '박서연', '10월 4주차'], ['TASK-117', '약어 검색 사전 연결', '이도윤', '11월 릴리스'], ['TASK-116', '알림 중복 제거', '이도윤', '없음']]],
  ['Doing', [['TASK-112', '이전 버전 링크 리다이렉트', '박서연', '10월 4주차'], ['TASK-109', '만족도 낮은 항목 후속 설문', '최민호', '10월 4주차']]],
  ['Review', [['TASK-104', '긴 설비명 범례 개선', '정하은', '10월 4주차']]],
  ['Done', [['TASK-099', '최근 방문 정리 규칙 변경', '김지후', '10월 3주차'], ['TASK-097', '툴팁 단위 표기 통일', '박서연', '10월 3주차']]],
  ['Released', [['TASK-090', '분석 보드 패널 상태 저장', '최민호', '10월 2주차']]],
];

function Tasks() {
  return <Frame menuId="fo-tasks" title="Tasks" count="12건" actions={<HeaderButton icon={<Plus className="size-3.5" aria-hidden />} primary>Task 생성</HeaderButton>}
    tabs={<><Chips items={['보드', '목록']} active="보드" /><div className="ml-auto flex gap-2"><Button variant="outline" size="toolbar">필터</Button><Button variant="outline" size="toolbar">Milestone</Button></div></>}>
    <div className="flex gap-3 overflow-x-auto pb-2">{BOARD.map(([status, cards]) => <section key={status} aria-label={status} className="w-40 shrink-0">
      <h3 className="mb-2 flex items-center justify-between text-xs font-semibold text-text-secondary">{status}<span className="rounded-pill bg-surface-row-selected px-1.5 text-caption">{cards.length}</span></h3>
      <ul className="space-y-2">{cards.map(([id, title, owner, ms]) => <li key={id} className="rounded-md border border-border-subtle bg-surface-card p-3">
        <p className="font-mono text-xs text-text-disabled">{id}</p><p className="mt-0.5 text-sm font-medium">{title}</p>
        <div className="mt-2 flex items-center justify-between"><span className="text-caption text-text-muted">{ms}</span><UserAvatar user={{ display_name: owner }} size="sm" /></div>
      </li>)}</ul>
    </section>)}</div>
  </Frame>;
}

const REQUESTS: [string, string, string, string, string][] = [
  ['한지민', 'VOC Triage', 'MARS', 'MARS 담당 VOC 분류를 맡게 되었습니다', '대기 중'],
  ['오세훈', 'Finding 관리', 'MARS', 'Finding 정리 담당으로 지정되었습니다', '대기 중'],
  ['윤재석', 'Survey 관리', 'CLAS', 'Q4 설문 운영', '대기 중'],
  ['강유진', 'VOC 조회', 'BRAVO', '지표 관련 VOC 확인이 필요합니다', '대기 중'],
  ['배수민', '워크스페이스 전체 읽기', '전체 (워크스페이스)', '운영 현황 보고서 작성', '추가 정보 필요'],
  ['임채원', 'Survey 데이터 내보내기', '표준 로그 개발', '설문 결과를 보고서에 첨부합니다', '대기 중'],
  ['문성훈', 'Finding 조회', 'CLAS', 'Cluster 근거 검토', '대기 중'],
];

function Permissions() {
  return <Frame menuId="fo-admin-permissions" title="권한 요청" count="5건 대기" tabs={<Chips items={['대기 중', '처리됨', '전체']} active="대기 중" />}
    list={<Table head={['요청자', '기능', 'Managed System', '사유', '상태', '']} rows={REQUESTS.map(r => [r[0], r[1], r[2], r[3], <StatusBadge key="s" tone={r[4] === '대기 중' ? 'warning' : 'info'}>{r[4]}</StatusBadge>,
      <span key="a" className="flex justify-end gap-1.5"><Button variant="outline" size="toolbar">승인</Button><Button variant="outline" size="toolbar">거부</Button></span>])} />} />;
}

function Placeholder({ menuId }: { menuId: string }) {
  const { registry } = usePlatform();
  const label = registry.menuById(menuId).label.ko;
  return <Frame menuId={menuId} title={label}><p className="text-sm text-text-muted">시안: 이 화면은 원본 그대로 옮깁니다</p></Frame>;
}

export function FoScreen({ menuId }: { menuId: string }) {
  if (menuId === 'fo-dashboard') return <Dashboard />;
  if (menuId === 'fo-voc-inbox' || menuId === 'fo-voc-triage') return <Inbox menuId={menuId} />;
  if (menuId === 'fo-findings') return <Findings />;
  if (menuId === 'fo-tasks') return <Tasks />;
  if (menuId === 'fo-admin-permissions') return <Permissions />;
  return <Placeholder menuId={menuId} />;
}
