// THROWAWAY #250 — never merge.
import { useMemo, useState } from 'react';
import { sortAndPage, type SpaceId } from '@ap/contracts';
import { PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { type PlatformColumn, PlatformDataTable, PlatformPage } from '@ap/components';
import { Button, StatusBadge } from '@ap/ui';

type Kind = 'voc' | 'task' | 'survey';
type Row = { id: string; title: string; status: string; owner: string; updated: string; spaceId: SpaceId; kind: Kind };

const OWNERS = ['kim.j', 'lee.s', 'park.h', 'choi.m', 'jung.y'];
const STATUS = [
  { ko: '접수', en: 'Open', tone: 'info' },
  { ko: '진행', en: 'Doing', tone: 'success' },
  { ko: '대기', en: 'Waiting', tone: 'warning' },
  { ko: '완료', en: 'Done', tone: 'neutral' },
] as const;

const TITLES: Record<SpaceId, Record<Kind, string[]>> = {
  productivity: { voc: ['P50이 어제보다 크게 벌어짐', '포토 구간의 체류 문의', '레시피 변경 후 처리량', '선택 설비가 비어 보임', '비교 구간이 어색함', '즐겨찾기 화면이 오래됨'], task: ['체류 상위 설비 확인', 'P95 기준선 재계산', '기간 프리셋 점검', '드릴 3단 라벨', '내보내기 열 확인', '주간 리포트 초안'], survey: ['분석 화면 만족도', '드릴 깊이', '차트 색 구분', '필터 위치', '용어 이해도', '로딩 체감'] },
  metrics: { voc: ['정의 문장이 버전과 다름', '발행 상태가 오래됨', '사용처가 비어 있음', '분자 설명이 부족', '카탈로그 정렬', '상세 탭이 안 열림'], task: ['버전 3 발행 확인', '사용처 연결', 'grain 표기', '폐기 지표 정리', '검색어 저장', '초안 리뷰'], survey: ['카탈로그 찾기', '버전 비교', '용어', '표 밀도', '필터', '권한 안내'] },
  logdev: { voc: ['Alpha 규칙이 원문과 다름', 'Round 2 결함 누락', '협력사 회신 지연', '모델 단계가 멈춤', 'XLSX 열이 부족', '검증 이력이 겹침'], task: ['규칙 오류 재분류', '결함 3건 재현', 'Beta 파라미터', '검토 요청 발송', '원문 위치 표시', '마감 일정 갱신'], survey: ['검증 화면', '결함 표', '협력사 양식', '단계 이름', '첨부', '알림'] },
  improvement: { voc: ['현장 적용 설비가 빠짐', '성과 입력이 안 됨', '전후 비교가 비어 있음', '담당이 바뀌었음', '일정이 과거임', '검증 기준이 없음'], task: ['대상 설비 확정', '성과 입력 마감', '적용 사진 첨부', '검증 회의', '이력 정리', '다음 과제 후보'], survey: ['과제 목록', '현장 입력', '성과 검증', '담당 표시', '일정', '용어'] },
  operations: { voc: ['감사 필터가 좁음', '역할 화면이 느림', '권한 이름이 김', '활용률이 0으로 보임', '레지스트리 정렬', '콘솔 진입 문의'], task: ['감사 보관 기간', '역할 설명 고치기', '활용률 표본', '레지스트리 열', '콘솔 홈 확인', '권한 문구'], survey: ['콘솔 탐색', '감사 표', '역할 화면', '용어', '속도', '도움말'] },
  common: { voc: ['공지 날짜가 오래됨', '설비 마스터 열 문의', '기준정보 검색', '내 공지가 안 보임', '상태 필터', '상세가 비어 있음'], task: ['공지 정리', '마스터 열 이름', '공정 설명', '검색 안내', '빈 상태 문구', '링크 확인'], survey: ['기준정보 찾기', '공지', '표', '검색', '용어', '이동'] },
  analytics: { voc: [], task: [], survey: [] },
  feedback: { voc: [], task: [], survey: [] },
  'collab-hub': { voc: [], task: [], survey: [] },
};

function rowsFor(spaceId: SpaceId, kind: Kind, lang: 'ko' | 'en'): Row[] {
  const titles = TITLES[spaceId]?.[kind] ?? [];
  return titles.map((title, index) => ({
    id: `${spaceId}-${kind}-${index + 1}`,
    title,
    status: STATUS[index % STATUS.length][lang],
    owner: OWNERS[index % OWNERS.length],
    updated: `2026-10-0${(index % 8) + 1}`,
    spaceId,
    kind,
  }));
}

export default function CollabPage() {
  const { route, registry, accessibleSpaces, linkTo } = usePlatform();
  const { tx, lang } = useI18n();
  const menu = route!.menu;
  const space = registry.spaceOf(menu);
  const hub = space.protoKind === 'hub';
  const kind: Kind = menu.path.endsWith('/task') ? 'task' : menu.path.endsWith('/survey') ? 'survey' : 'voc';
  const works = accessibleSpaces.filter(s => s.protoKind !== 'hub');
  const [only, setOnly] = useState<string>('all');
  const rows = useMemo(() => {
    if (!hub) return rowsFor(space.id, kind, lang);
    return works.filter(s => only === 'all' || s.id === only).flatMap(s => (['voc', 'task', 'survey'] as const).flatMap(k => rowsFor(s.id, k, lang)));
  }, [hub, space.id, kind, lang, works, only]);
  const toneOf = (status: string) => STATUS.find(s => s.ko === status || s.en === status)?.tone ?? 'neutral';
  const columns: PlatformColumn<Row>[] = [
    { id: 'id', header: lang === 'ko' ? '식별자' : 'Id', sortable: false },
    { id: 'title', header: lang === 'ko' ? '제목' : 'Title' },
    { id: 'status', header: lang === 'ko' ? '상태' : 'Status', cell: row => <StatusBadge tone={toneOf(row.status)}>{row.status}</StatusBadge> },
    { id: 'owner', header: lang === 'ko' ? '담당자' : 'Owner' },
    { id: 'updated', header: lang === 'ko' ? '갱신일' : 'Updated' },
  ];
  if (hub) columns.splice(1, 0, { id: 'spaceId', header: lang === 'ko' ? '대상 시스템' : 'System', cell: row => tx(registry.spaceById(row.spaceId).label), sortable: false });
  return <PlatformPage
    description={lang === 'ko' ? 'FeedbackOps 원본 · 시안 데이터' : 'FeedbackOps source · prototype data'}
    contextExtension={!hub ? <StatusBadge tone="info">{lang === 'ko' ? `관리 대상: ${tx(space.label)}` : `Managed system: ${tx(space.label)}`}</StatusBadge> : undefined}
  >
    {hub && <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={lang === 'ko' ? '시스템 필터' : 'System filter'}>
      <Button type="button" size="sm" variant={only === 'all' ? 'default' : 'secondary'} onClick={() => setOnly('all')}>{lang === 'ko' ? '전체' : 'All'}</Button>
      {works.map(s => <Button key={s.id} type="button" size="sm" variant={only === s.id ? 'default' : 'secondary'} onClick={() => setOnly(s.id)}>{tx(s.label)}</Button>)}
    </div>}
    <PlatformDataTable<Row>
      title={tx(menu.label)}
      subtitle={lang === 'ko' ? 'FeedbackOps 원본 · 시안 데이터' : 'FeedbackOps source · prototype data'}
      ariaLabel={tx(menu.label)}
      columns={columns}
      getRowId={row => row.id}
      filterKey={hub ? only : kind}
      preferenceKey={`proto-250:${menu.id}`}
      pageSize={20}
      loadPage={async query => ({ outcome: 'ok', data: sortAndPage(rows, query), assessments: [], trust: null, correlationId: 'proto-250' })}
      rowAction={hub ? row => <PlatformLink className="text-sm text-accent-primary" href={linkTo(`collab-${row.spaceId}-voc`)}>{lang === 'ko' ? '그 시스템에서 열기' : 'Open in that system'}</PlatformLink> : undefined}
    />
  </PlatformPage>;
}
