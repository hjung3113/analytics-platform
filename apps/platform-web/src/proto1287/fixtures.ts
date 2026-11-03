/** #1288/#1290 THROWAWAY PROTOTYPE fixtures (no server call). */
export type ProtoVoc = { id: string; display: string; system: string; title: string; body: string; status: '접수됨' | '검토 중' | '처리 중' | '해결됨'; mine: boolean; replies: number; at: string; reporter: string };
export const SYSTEM_TONE: Record<string, 'info' | 'neutral' | 'success' | 'warning'> = { 플랫폼: 'info', MARS: 'neutral', BRAVO: 'neutral', CLAS: 'neutral' };
export const STATUS_TONE = { 접수됨: 'neutral', '검토 중': 'info', '처리 중': 'warning', 해결됨: 'success' } as const;

export const VOCS: ProtoVoc[] = [
  { id: 'v1', display: 'VOC-1042', system: '플랫폼', title: '즐겨찾기한 화면이 시스템을 바꾸면 사라집니다', body: 'MARS에서 즐겨찾기한 화면을 CLAS로 옮겨 간 뒤 홈에 돌아오면 목록에서 빠져 있습니다.', status: '처리 중', mine: true, replies: 2, at: '오늘 09:12', reporter: '김현수' },
  { id: 'v2', display: 'VOC-1039', system: 'MARS', title: '사이클타임 차트에서 라인별 비교가 느립니다', body: '라인 4개 이상을 고르면 비교 차트가 10초 넘게 걸립니다.', status: '검토 중', mine: false, replies: 1, at: '어제 17:40', reporter: '박지은' },
  { id: 'v3', display: 'VOC-1037', system: '플랫폼', title: '공지 알림이 두 번 옵니다', body: '같은 공지에 대해 알림 종과 메일이 각각 두 번씩 옵니다.', status: '해결됨', mine: false, replies: 3, at: '11/01', reporter: '이도윤' },
  { id: 'v4', display: 'VOC-1031', system: 'BRAVO', title: '지표 정의 버전 비교에서 단위가 빠집니다', body: '버전 비교 표의 값 옆에 단위가 표시되지 않습니다.', status: '접수됨', mine: true, replies: 0, at: '10/31', reporter: '김현수' },
  { id: 'v5', display: 'VOC-1028', system: 'CLAS', title: '동작시간 분석 기간을 일주일 넘게 고를 수 없습니다', body: '기간 선택에서 7일을 넘기면 조회 버튼이 꺼집니다.', status: '검토 중', mine: false, replies: 1, at: '10/30', reporter: '최서연' },
  { id: 'v6', display: 'VOC-1022', system: 'MARS', title: '설비 목록 엑셀 내보내기에 설비명이 비어 있음', body: '내보낸 파일의 설비명 열이 모두 비어 있습니다.', status: '해결됨', mine: false, replies: 2, at: '10/28', reporter: '정하준' },
];

export const THREAD = [
  { kind: '신고자', who: '김현수', at: '오늘 09:12', text: 'MARS에서 즐겨찾기한 화면을 CLAS로 옮겨 간 뒤 홈에 돌아오면 목록에서 빠져 있습니다. 브라우저를 새로 고쳐도 같습니다.' },
  { kind: '담당자 답변', who: '플랫폼 담당 · 오지민', at: '오늘 10:05', text: '재현했습니다. 시스템 전환 때 즐겨찾기 저장소를 다시 읽는 순서 문제로 보입니다. 이번 주 안에 고쳐서 알려 드리겠습니다.' },
  { kind: '신고자 답글', who: '김현수', at: '오늘 10:20', text: '감사합니다. 최근 방문도 같이 확인 부탁드립니다.' },
  { kind: '담당자 답변', who: '플랫폼 담당 · 오지민', at: '오늘 13:40', text: '최근 방문도 같은 원인이었습니다. 수정본을 검토 중입니다.' },
];

export type ProtoNotice = { id: string; title: string; body: string; at: string; until: string | null; pinned: boolean; expired: boolean; system: string };
export const NOTICES: ProtoNotice[] = [
  { id: 'n1', title: '11/08(토) 02:00–04:00 정기 점검', body: '점검 중에는 모든 시스템에 접속할 수 없습니다. 진행 중인 저장은 점검 전에 마쳐 주세요.', at: '11/03', until: '11/08', pinned: true, expired: false, system: '플랫폼' },
  { id: 'n2', title: 'VOC를 이제 누구나 볼 수 있습니다', body: '플랫폼에 대한 VOC는 로그인한 모든 사람이, 시스템별 VOC는 권한을 받은 사람이 봅니다.', at: '11/03', until: null, pinned: false, expired: false, system: '플랫폼' },
  { id: 'n3', title: 'MARS 사이클타임 기준 변경 안내', body: '11월부터 사이클타임은 설비 정지 시간을 뺀 값으로 계산합니다.', at: '10/30', until: null, pinned: false, expired: false, system: 'MARS' },
  { id: 'n4', title: 'BRAVO 지표 발행 일정', body: '10월 지표는 11/05에 발행합니다.', at: '10/25', until: '11/05', pinned: false, expired: false, system: 'BRAVO' },
  { id: 'n5', title: '10/26 점검 완료', body: '10/26 점검이 끝났습니다.', at: '10/24', until: '10/26', pinned: false, expired: true, system: '플랫폼' },
  { id: 'n6', title: '추석 연휴 지원 안내', body: '연휴 기간 VOC 답변이 늦어질 수 있습니다.', at: '10/01', until: '10/09', pinned: false, expired: true, system: '플랫폼' },
];
