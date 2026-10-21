# 조회 초안은 칸에 두고 Apply 한 번으로 적용 주소를 확정한다

상태: **Decided (2026-10-21, 코디네이터 결정 — 사용자가 되돌릴 수 있음)**.
- 사용자 결정: #553 조회 바는 B 두 줄 + 접힌 C 요약으로 하고 모든 조건은 한 번에 적용한다. #554의 마지막 조회조건 복원은 초안만 복원하고 조회하지 않는다.
- 코디네이터 결정: #553 SDK 분리 작업의 선언·초안 수명·주소 기반 실행·서버 검증·완료 시각 정책. 실제 메뉴 도입과 조회 바 UI는 별도 PR이다.

즉시 적용 메뉴와 여러 조건을 모아서 실행하는 메뉴가 같은 Kernel을 사용해야 한다. 편집 값을 URL에 먼저 쓰면 다른 조회와 링크에도 적용되고, 세션의 실행 여부로 조회를 제어하면 새로고침·뒤로가기·저장된 보드 칸이 같은 주소를 다르게 실행한다. 따라서 메뉴별 `query.mode='apply'` opt-in과 칸별 초안을 제공하고 **URL은 적용된 조건만 소유**한다. 세부 계약 원본은 [06 §5·§6.3·§6.4·§11·§19](../06_platform_ui_contract.md)다.

## 결정

- 선언이 없는 메뉴는 live 모드다. 기존 `setGlobal`·`setPage`·드릴·링크는 즉시 적용 API로 유지하고, 새 `useQueryDraft`의 두 setter만 초안을 편집한다. live 모드에서는 초안이 적용값을 비추고 setter가 기존 API로 통과하며 Apply·되돌림·초기화는 no-op이다.
- 초안은 [ADR-0049](0049-analysis-context-belongs-to-a-pane.md)의 논리적 칸에 하나다. 보드 본문과 선택된 Context 바의 별도 Provider가 같은 수명 소유자의 저장소를 공유한다. 선택 변경·본문 접기 동안 유지하고 칸/시트 제거, 메뉴·경로 params·세션 교체 때 폐기한다. 모듈 화면 메타데이터도 같은 선택적 선언을 상속한다.
- Apply는 정규화·검증한 global/page와 기존 extras를 한 번에 push한다. 실제 global 변경이면 `contextResetKeys`를 초안 setter 시점부터 제거하고 최종 후보에서도 검사한다. 미지원 등록 Context는 보존한다. 의미가 같은 집합·Condition 순서 변경은 dirty가 아니다. Scope 선택은 즉시 적용하며 Site 경계 필드를 지운 뒤 초안을 rebase한다.
- 적용 주소의 실제 변경은 초안을 새 적용값으로 rebase한다. 동일 주소 이동은 초안을 유지한다. 자체 Apply의 지연된 주소 반영은 클릭 뒤 편집을 보존하며, 동기 중복 Apply는 같은 제안을 다시 보내지 않는다. `applying`은 커밋 전달 중(현재 turn 끝까지)이며 조회 loading과 별개다. 주소 확인 대기는 중복 억제용으로만 남고 무한 조회 스피너를 만들지 않는다.
- 실행 여부는 주소로만 판단한다. time을 apply하는 메뉴만 opt-in 가능하며 명시적 유효한 URL 기간과 선언 필수값이 필요하다. Scope가 필요한 요청은 현재 세션의 검증도 통과한다. bare route·v/extras·Scope만·page만·미지원 Context만 있는 주소는 조회하지 않는다. 시간 없는 Apply 메뉴는 재현 가능한 실행 표현이 없으므로 등록 오류로 거부하며 별도 실행 marker를 만들지 않는다.
- 기본 기간은 양쪽 기간이 없는 유효 주소의 **초안에만** 물질화한다. 부분·잘못된 기간은 보정하지 않는다. 지표 id-only 초기화 경로의 서버 발행 버전 확인은 계속하고, URL 버전 확인이 초안의 기본 기간을 적용하지는 않는다. 초안 지표는 Apply 전에 완전한 쌍으로 확인하며 미발행·미등록을 거부한다.
- 필수값은 UX 게이트이며 서버 검증을 대신하지 않는다. 메뉴의 `required.context/page`와 엔드포인트의 `requiredContext`를 검증한다. 집합 `[]`는 존재하는 값이며 기존 원천 조회 없는 empty 계약을 유지한다. [ADR-0019](0019-menu-query-endpoint-declaration.md)의 투영 필드 구조적 존재 규칙도 유지한다. 보조 엔드포인트의 작은 투영은 허용한다.
- 게이트는 메뉴 분석 요청(`useMenuQuery`, `useMenuFetch`, `ModuleHost.query`)에 적용한다. raw `usePlatformQuery`, 목적지/entity, 감사·주석 요청은 보조 요청으로 유지한다. idle은 이전 결과·완료시각을 즉시 숨기고 진행 요청을 취소한다. refetch나 invalidation으로 게이트를 열 수 없다.
- `completedAt`은 수락한 모든 종결 응답(오류·타임아웃·클라이언트 합성 오류 포함)의 클라이언트 epoch ms다. `trust.updatedAt`은 원천 갱신 시각으로 별개다. 동일 identity refresh는 이전 값과 시각을 유지하고, identity 교체·idle은 모두 숨긴다. 취소·늦은 응답은 시각을 찍지 않는다.
- QueryView idle은 중립적인 조회 전 상태와 번역된 누락 사유 목록이다. skeleton·empty·오류를 재사용하지 않는다. 첫 Apply 소비자는 cycle-time(#553)이며 최근 조회 이력은 #554와 06 §11의 계약을 따른다.

## Considered Options

- **URL에서 직접 편집**: 기존 live 메뉴에는 적합하지만 여러 조건의 단일 적용을 보장하지 못한다.
- **메뉴 로컬 초안**: 본문·셸 편집기·보드 칸별 수명과 게이트를 메뉴마다 중복 구현하게 한다.
- **세션의 hasApplied flag**: 같은 주소의 reload·history·보드 복원이 달라져 재현성을 깨뜨린다.
- **칸별 초안 + 적용 주소(채택)**: 기존 live API·링크·서버 요청 수명주기를 유지하면서 편집과 실행만 분리한다.
