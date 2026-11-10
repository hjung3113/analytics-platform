# @ap/menu-topview-studio 변경 기록

내부 버전이며 발행하지 않는다. SDK 범위는 package.json의 ap.sdk를 따른다.

## 0.3.0 — 2026-11-11

- 설비 온보딩 화면(#1658): `도구 › Top View 작성 › 설비 온보딩`(`/tools/eqv-onboarding`, Management). Fleet 표(상태 컬럼 필터, 고정 `동작` 열) → 설비별 단계 탭(데이터·Inventory·Template·Mapping·검증·게시·Drift)과 Sample Window 선택기. page key `equipment`·`step`·`window`. Mapping Board(§4 단축키, 저장 범위, 실행 취소, 미저장 가드), 브라우저 dry-run과 충돌 강조, 게시 검토(diff·Revision·Binding 줄)와 `publishRevision` → `publishMapping`, Sample Window 교체·퇴역. 권한 `eqv-studio:rules-edit`·`eqv-studio:dictionary-global-edit`·`eqv-studio:mapping-publish`·`eqv-studio:window-import`. 서버가 없는 읽기·쓰기는 mock만(`docs/architecture/platform-api/api/eqv.md` «Pending server»).

### Not implemented

- 설비 등록과 Sample Window 가져오기: 플랫폼에 업로드 경로가 없어 EV 개발 도구(`apps/eqv-studio`)에 남는다(lead 2026-11-11). 범용 업로드 부품은 소유자가 승인해 #1741로 진행 중이다. 다시 열 조건: #1741 병합 뒤 가져오기 PR.
- Mapping Board 다중 선택(`Space`·`Shift`+이동·`⌘/Ctrl`+클릭)과 선택 행 일괄 확정·무시: 이번 화면은 `자동 일괄 확정`만 옮겼다. 다시 열 조건: 같은 Model 다설비 작업이 실제로 필요하다는 요청.
- 같은 Model 일괄 dry-run(ONBOARDING §6 D12)과 Type Dictionary·alias metadata 편집 화면(`eqv.saveTypeDictionary`는 선언만): 다른 설비의 inventory·초안을 한 번에 읽는 서버 읽기가 없다. 다시 열 조건: #1658 Sample Window·Fleet 서버 PR 병합.

## 0.2.1 — 2026-11-11

- 레이아웃 검토 수정(#1654): Revision·EV Template 주소의 Layout ID 고정, 목록·게시 비교 기준 오류와 재시도, 초안 로딩 표시, 구성 탐색·단축키·삭제 취소 포커스, 토스트와 패널 높이·표기 정리.

## 0.2.0 — 2026-11-10

- 레이아웃 화면(#1654): 상시 3패널 편집기(파일·구성 / 도면 / 속성·연결), 초안 저장, Revision 게시, EV Template 승격, JSON 가져오기·내보내기, 미저장 편집 가드. 권한 `eqv-studio:view`(진입)·`eqv-studio:layout-edit`·`eqv-studio:layout-publish`.

## 0.1.0 — 2026-11-10

- 초기 기록: 레이아웃 화면과 manifest 스켈레톤.
