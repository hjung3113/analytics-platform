# Kernel이 미저장 변경이 있는 화면의 이동을 한 곳에서 보류하고 확인한다

상태: **Proposed (2026-11-06) — 소유자 결정 대기.** [06 §6.4](../contract/kernel.md)의 「뒤로가기 복원은 정확해야 한다」와 [§26](../contract/platform-ui-contract.md#26-accessibility-baseline)의 도착 포커스 규칙은 그대로이고, 메뉴가 가드를 켜지 않으면 기본 동작도 그대로다.
- 결정자: 소유자 — 답 전에는 이 ADR에 기대는 구현을 하지 않는다. 조사·초안: [#1388](https://github.com/hjung3113/analytics-platform/issues/1388), 상세 계획 `W-1388-PLAN.md`.

## 배경

저장하지 않은 편집이 있는 화면에서 브라우저 뒤로가기, 사이드바·레일·팔레트 이동, `navigate` 호출로 나가면 변경이 확인 없이 사라진다. 메뉴가 자기 `뒤로` 버튼이나 `beforeunload`만 막기 때문이다. #1196 노드 d(스펙 편집기)의 최종 리뷰(RF5 C3)가 이 틈을 지적했고, Survey 빌더([backlog](../../.planning/backlog.md) #764 p1)와 로그 지식 가져오기 마법사(#1195 c)도 같은 이유로 보류 중이며 둘 다 「Kernel/셸 이탈 가드가 생길 때」를 다시 여는 조건으로 적었다. 이동의 쓰기는 `MainScreenProvider.commit` 한 곳을 지나지만, 뒤로/앞으로(popstate)는 브라우저가 이미 주소를 옮긴 뒤에 오고, 탭 닫기·새로고침은 문서가 내려간다. 메뉴는 URL·history를 직접 만질 수 없으므로(06 §6.5) 메뉴 몫으로는 해결되지 않는다.

## 결정 (추천안)

1. **메뉴가 `useUnsavedGuard(dirty, { message?, leaves?, onDiscard? })`로 선언한다.** 훅 수명이 등록 수명이고(언마운트·`dirty=false`면 해제), 여러 등록은 하나라도 dirty면 보류하며 문구는 가장 안쪽(나중 등록) dirty의 것이다. Kernel은 headless이고 확인 대화상자는 셸이 `useLeaveRequest()`로 그린다(Kernel은 `@ap/ui`를 import하지 않는다).
2. **이동 보류는 `commit` 한 곳과 popstate 한 곳에서만 한다.** `commit`은 목적지 pathname이 현재와 다르면(기본 `leaves: 'path'`, 선택 `'address'`) 쓰기 전에 요청을 만들고 `false`를 돌려준다(호출자는 「이동하지 않음」으로 처리). 확인하면 같은 `via`·`focus`로 한 번 다시 커밋한다.
3. **같은 pathname의 `setPage`·`setGlobal`·드릴·`replace`, 도착 재작성(별칭·숨은 키·기간 물질화), Scope 변경, 세션 만료·강제 이동은 절대 보류하지 않는다.** 사용자를 가두지 않고 초안 키 입력을 막지 않기 위함이다.
4. **popstate는 history 항목에 단조 증가 `apIdx`를 찍고, 막으면 `history.go(-delta)`로 정확히 되돌린 뒤 확인한다.** 확인하면 `history.go(delta)`다. 항목을 더하지 않으므로 Forward 의미가 유지되고 해제 때 정리할 것이 없다. 번호 없는 항목·Safari 호출 제한 오류는 fail open(막지 않음)이며 식별 필드만 `reportError`로 보낸다.
5. **새로고침·탭 닫기는 `beforeunload`만 쓴다.** dirty 등록이 있는 동안 Kernel이 리스너 하나를 달고 브라우저 기본 대화상자만 보인다(문구 지정 불가).
6. **대화상자 기본 문구:** 「저장하지 않은 변경이 있습니다. 이동하면 변경이 사라집니다.」 버튼 `머무르기`(기본 포커스·Escape)·`이동`. 메뉴 `message`는 본문만 바꾼다. 어느 경로의 이동이든 같은 대화상자다.
7. **SDK 범용 조각으로 둔다**([ADR-0052](0052-rich-content-stays-in-the-sdk.md)). 첫 소비자는 #1196 노드 d, 이어 #1328 개선 항목·콘솔 편집 화면이다. 기존 메뉴의 `beforeunload`·자체 확인은 각 소비자 노드가 훅으로 옮기며 이 ADR이 옮기지 않는다.

## 대안과 버리는 이유

- **경고만 하고 막지 않기(토스트·`beforeunload`만):** 가장 싸지만 변경이 조용히 사라진다. 뒤로가기·메뉴 이동의 손실이 이 이슈의 원인이라 해결이 아니다.
- **메뉴마다 가드 직접 구현:** popstate 보정과 `commit` 가로채기는 메뉴가 URL·history를 못 만지므로 불가능하고, 가능해도 화면마다 늦은 응답·세션 변경·포커스 처리를 다르게 한다(ADR-0114와 같은 이유로 Kernel 한 곳).
- **popstate에 센티넬 항목 push(자주 쓰는 방식):** dirty가 되면 더미 항목을 쌓고 Back마다 다시 쌓는다. history 스택이 어긋나고 Forward가 깨지며 다단계 뒤로·`go(-n)`에서 항목이 남는다. `apIdx` 보정은 항목을 더하지 않는다.
- **Navigation API(`navigate` 이벤트 취소):** 더 깔끔하지만 지원 브라우저의 취소 가능한 traverse 범위를 이 조사에서 확인하지 못했다(미확인). 다시 여는 조건: 사내 지원 브라우저가 모두 지원할 때 점진 향상으로 추가.
- **모든 page 키 push를 이동으로 보기:** 탭·필터 변경마다 대화상자가 떠 쓸 수 없다. `leaves: 'address'`는 화면이 page 키에 초안을 묶을 때만 고르는 선택이다.
- **Scope 변경·세션 만료도 보류:** Scope 변경은 이미 Scope 묶인 상태를 지우고 알리며(`setGlobal`), 세션 만료를 막으면 사용자를 가둔다. 보류하지 않는다.

## 결과

- 공개 추가(선택·기본 동작 불변): 루트 `useUnsavedGuard`·`UnsavedGuardOptions`(`MenuPlatform`), 호스트 `useLeaveRequest`·`leaveRequest`, 선택적 `PlatformLocation.go`. 등록이 없으면 리스너·비용이 없다. `sdk:api` 스냅샷·버전·next-release 행 갱신.
- 계약 문서: [kernel.md](../contract/kernel.md) §4(책임 한 줄)·§6.4(「이동 가드」 문단, 복원 문장은 유지), [platform-ui-contract.md](../contract/platform-ui-contract.md) §26(확인 대화상자의 취소는 포커스를 옮기지 않음·Escape = 머무르기), [components.md](../contract/components.md)(셸 대화상자). 켜기 전에 소유자가 답할 항목: 확인 vs 경고만, 경로 단위 기본값, popstate fail open, 문구(`이동`/`머무르기` vs `그래도 이동`/`계속 편집`), 대화상자 시안(A 표준 모달 추천, B 메뉴가 담는 배너+모달 대체, C 누른 요소 옆 팝오버).
- 구현 시 주의: `useSavedViews`의 popstate 플래그는 취소된 Back에 반응하면 안 된다(받아들인 이동 신호로 교체). 시험 계획은 `W-1388-PLAN.md` §6.
