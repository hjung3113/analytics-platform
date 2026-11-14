# 들어오는 연결 — 목적지 메뉴가 받을 객체 종류를 선언하고, 출발 화면은 목록을 얻는다

상태: **Decided (2026-11-14)**
- 결정자: 소유자 위임 Opus 리뷰, 되돌릴 수 있음.
- Scope: 메뉴 선언 `opensObject`·`subjectLinks`, Kernel `objectLinks`, 본문 `ObjectLinks`와 페이지 머리 목록. 계약 원천은 [§22](../contract/cross-menu-links.md#22-cross-menu-context-link), 선언 표는 [kernel.md §5](../contract/kernel.md#5-menu-extension-contract), UI 조각은 [components.md §13](../contract/components.md#13-shared-component-layers)이다. 관련: [ADR-0158](0158-unregistered-link-destinations-and-declared-link-targets.md).

## 맥락

출발 메뉴가 목적지 id를 하나씩 적으면 같은 객체를 여는 메뉴가 늘 때 출발 화면과 시험도 바뀐다. `subjectPageKeys`는 현재 화면의 대상을 분석 동작에 넘기는 선언이므로, 이를 목적지 선언으로 겸하면 기존 메뉴의 뜻과 기본 동작이 말없이 넓어진다.

## 결정

1. 목적지는 별도 선택 필드 `opensObject`로 객체 종류마다 경로 `param` 또는 단일값 `pageKey` 하나를 선언한다. Registry가 조립 때 검증하고 종류별 목적지를 한 번 색인한다. 선언은 표시용이며 서버 스냅샷·권한·`linkTargets`를 바꾸지 않는다. 모듈 선언은 보류한다.
2. 출발 메뉴의 머리 목록은 `subjectLinks`로 종류별 선택한다. `true`는 기존 `subjectPageKeys`의 현재 값을 읽고 `{ param }`은 경로 값을 읽는다. 기본은 꺼짐이다. 셸만 머리 묶음을 그리며 묶음은 기존 분석 동작과 같이 본 화면에만 나온다.
3. 경로 목적지는 id 하나로 경로를 채울 수 있어야 한다. page 목적지는 반복·숨김·복귀·carry set·전역 Context 키를 쓰지 않는다. page 목적지는 열린 객체 또는 기존 범위 밖 상태를 표시해야 한다. CLAS의 기존 «선택 없음»은 #2187에서 고친다.
4. Kernel 목록은 `resolveLink`를 재사용한다. `returnTo`·`page`·`global`을 모든 목적지에 적용하며 객체의 site는 `global.scopeId`로 명시한다. Registry 순서를 유지하고 현재 메뉴와 `none`만 제외한다. 개수 상한은 없고 권한 없는 목적지는 남긴다.
5. 본문은 공통 `ObjectLinks`를 배치한다. 0개는 없음, 1개는 한 번에 여는 `RowAction`, 여러 개는 같은 모양의 «다른 화면» 트리거다. 머리는 자체 동작 뒤 구분선과 `<mono>id</mono> 다른 화면에서 열기` 제목을 둔다. 행은 `HeaderOverflowItem`의 기존 disabled + `menuDenied` 사유를 쓴다. `HeaderOverflowGroup`은 내부 조각이다.
6. 종류는 공통 어휘이나 선언한 메뉴 저자가 ID 공간을 책임진다. 시스템 안에서만 유일한 id는 `clasEquipment`처럼 한정한 종류를 쓴다. Kernel은 종류별 표시 이름을 알지 않는다. 목적지 manifest label은 그대로 표시하고, 같은 목록에서 라벨이 겹치면 팔레트 행 모양의 둘째 줄에 공간 이름을 표시한다.
7. 목록을 채택한 화면은 목록과 겹치는 손 링크를 제거한다. 목적지별 의도가 있는 링크는 유지한다. 감사의 audit/history 탭·site 링크와 생산성의 Selection 변경 링크는 그 예다. 생산성의 머리는 opt-in하지 않는다.

## Considered Options

- **새 목적지 선언 + 본문/머리 두 자리(채택):** 객체 행과 화면 대상의 자리가 다르며, 각 자리에는 한 방식만 둔다. 기존 기본 동작은 유지한다.
- **`subjectPageKeys` 재사용:** 출발/목적지 의미가 섞이고 경로 값을 받지 못한다.
- **앱의 종류 → 메뉴 표:** 메뉴가 아는 입력 경로를 앱에 다시 적어 두 곳이 어긋날 수 있다.
- **본문만 / 머리만:** 전자는 공통 머리를 메뉴마다 만들고, 후자는 행 객체를 넘기지 못한다.

## 결과

선택 선언을 더한 메뉴만 새 목록에 참여한다. 새 URL 키나 저장 상태는 없다. 기본 머리·disabled 동작은 유지한다. 모듈 선언, 항상 공간 표시, 출발 시험의 Kernel mock, 모든 ⋯의 aria-disabled(#2186), CLAS 범위 밖 표시(#2187)는 [백로그](../../.planning/backlog.md#작은-후속-확인된-것)에 미구현 사유와 재개 조건을 기록한다.
