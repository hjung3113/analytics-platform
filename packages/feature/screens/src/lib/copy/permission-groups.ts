export const PERMISSION_GROUP_COPY = {
  title: '권한 그룹', create: '권한 그룹 만들기', personalCreate: '내 권한 그룹 만들기',
  catalog: '권한 그룹으로 신청', catalogLabel: '신청할 권한 그룹', edit: '고치기', share: '공유',
  name: '이름', description: '설명', capabilities: '권한', save: '저장', make: '만들기', cancel: '취소', archive: '보관',
  personalNotice: '개인 권한 그룹은 신청할 때 쓰는 묶음입니다. 민감 권한과 관리자 권한은 넣을 수 없습니다.',
  nonRetroactive: '권한 그룹을 고치거나 보관해도 기존 권한과 요청은 바뀌지 않습니다. 다음 신청·부여부터 적용됩니다.',
  loading: '권한 그룹을 불러오는 중입니다.', error: '권한 그룹을 불러오지 못했습니다.', empty: '표시할 권한 그룹이 없습니다.',
  retry: '다시 시도', unavailable: '이 권한 그룹을 열 수 없습니다. 공유 대상인지 확인하세요.',
  searchPeople: '사람 이름으로 추가', search: '이름 검색', link: '링크', copy: '복사', copied: '복사함', copyFailed: '링크를 복사하지 못했습니다.',
  shareNotice: '공유받은 사람만 이 권한 그룹을 열어 신청할 수 있습니다. 권한은 운영자가 승인해야 생깁니다.',
  close: '닫기', add: '추가', noPeople: '검색 결과가 없습니다.', peopleError: '사람 목록을 불러오지 못했습니다.',
  missing: '빠짐', held: '이미 가짐', unrequestable: '신청할 수 없음', grantMissing: '부여할 수 없음 · 빠짐',
  reasonRequired: '사유 · 필수', checklist: '승인할 권한', unchecked: '고르지 않은 권한은 거절됩니다',
  selectionRequired: '승인할 권한을 하나 이상 고르세요.',
  creator: '만든 사람', sharedWith: '공유 대상', grants: '부여', updated: '고친 날', none: '없음', unknown: '알 수 없음',
  origin: (name: string) => `권한 그룹 «${name}»`,
  grantCount: (count: number | null) => `부여 ${count ?? '알 수 없음'}건`,
  shareCount: (count: number) => `공유 ${count}명`,
  grantValue: (count: number | null) => `${count ?? '알 수 없음'}건`,
  unshare: (name: string) => `${name} 공유 해제`,
  shareLimit: (max: number) => `공유 대상은 ${max}명까지 추가할 수 있습니다.`,
  unavailableCapability: '현재 선택할 수 없는 권한입니다. 빼고 저장하세요.',
  remove: '빼기',
  requestTitle: '권한 요청', searchCapabilities: '권한 이름·설명 검색', noGrantCandidate: '이 대상에 부여할 수 없음', system: '시스템',
  batchFootnote: '승인한 권한은 한 줄씩 부여되고 이 권한 그룹이 출처로 남습니다.', source: '출처',
  batchAnswer: '추가 정보 보내기', answer: '추가 정보', answered: '추가 정보를 보냈습니다.',
  grantSystem: '권한 그룹에 적용할 시스템', selectSystem: '시스템 선택',
  kind: { operator: '운영자 권한 그룹', personal: '개인 권한 그룹' },
  tabs: { all: '전체', operator: '운영자', personal: '개인' },
  count: (n: number) => `권한 ${n}개`, approve: (n: number) => `고른 ${n}개 승인`,
  outcome: (approved: number, rejected: number) => `승인 ${approved} · 거절 ${rejected}`,
  decided: (approved: number, rejected: number) => `권한 ${approved}개를 부여하고 ${rejected}개를 거절했습니다.`,
} as const;

export function pickGroupCapabilities(capabilities: readonly string[], requestable: ReadonlySet<string>, held: ReadonlySet<string>) {
  const selected: string[] = [];
  const missing: { capability: string; reason: string }[] = [];
  for (const capability of capabilities) {
    if (held.has(capability)) missing.push({ capability, reason: PERMISSION_GROUP_COPY.held });
    else if (!requestable.has(capability)) missing.push({ capability, reason: PERMISSION_GROUP_COPY.unrequestable });
    else selected.push(capability);
  }
  return { selected, missing };
}

export function aggregatePermissionRequests<T extends { id: string; batch_id?: string | null | undefined; status: string }>(rows: readonly T[]): (T & { batchItems: T[] })[] {
  const grouped = new Map<string, T & { batchItems: T[] }>();
  for (const row of rows) {
    const key = row.batch_id ?? row.id;
    const existing = grouped.get(key);
    if (existing) existing.batchItems.push(row);
    else grouped.set(key, { ...row, batchItems: [row] });
  }
  return [...grouped.values()].map(row => {
    const statuses = row.batchItems.map(item => item.status);
    const status = ['pending', 'needs_more_info', 'approved', 'rejected'].find(value => statuses.includes(value)) ?? row.status;
    return { ...row, status };
  });
}
