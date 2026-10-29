# 메뉴간 연결

> Scope: Cross-menu Context Link, 목적지 ID와 분석 Context의 분리.  
> 포함 절: §22  
> 색인과 「절 → 문서」 대응표: [06. Platform UI Contract](platform-ui-contract.md)  
> 상태 표기(Decided / Candidate / Open / Deferred): [문서 소유권과 결정 상태](platform-ui-contract.md#문서-소유권과-결정-상태)

## 22. Cross-menu Context Link

플랫폼의 핵심 가치는 메뉴 수가 아니라 **메뉴 사이를 문맥과 함께 이동할 수 있는 것**이다.

예:

```text
Cycle Time P95
   ↓
Slow executions
   ↓
Execution detail
   ↓
Wafer / XFR·FNC·PRC timeline
   ↓
Create VOC with current context
```

각 메뉴가 서로의 URL 문자열을 직접 조립하지 않는다.

가능하면 Platform Context Link helper를 통해:

- destination
- transferable context
- unsupported context
- permission

을 공통 처리한다. 구현은 Kernel `resolveLink(menuId, options)`이며(`linkTo`는 그 `href`), 결과는 세 가지다.

- `href`: 전역 Context는 목적지 지원 여부와 무관하게 실어 보낸다(미지원 표시는 목적지 화면 몫). 목적지가 다른 Scope(site)면 이전 site에 묶인 값(room_name·Condition·Selection·Lot·Recipe·PPID)은 비우고 호출자가 명시한 값만 남긴다. page key는 목적지 manifest `pageKeys`에 있는 것만 싣는다.
- `allowed`: 목적지 메뉴 권한과 공간 진입 권한을 링크가 안다. 표시용이며 서버가 다시 검사한다. 호출자는 `false`면 링크 대신 사유를 보인다(임의로 숨기지 않는다).
- `droppedPageKeys`: 목적지가 받지 않아 버려진 page key.

상세에서 분석으로 복귀할 때는 §6.4에 따라 진입 전 Context를 그대로 복원하며, 목적지 ID로 출발 설비 선택을 변경하지 않는다. **CFG의 다른 메뉴와의 Context Link 연계는 Deferred**다. CFG 자체의 시각화·분석 범위와는 구분하며 이번 예시 경로에 CFG hop을 추가하지 않는다.

**운영 기능의 맥락·진입·복귀 경계 (Decided, 2026-10-29, [ADR-0100](../adr/0100-feature-navigation-and-independent-access.md), #1099c):** carry set `features`(`managedSystem`·`returnTo`)의 멤버는 모든 운영 기능 메뉴, 기능 관리 메뉴, 전역 내 Task이고 플랫폼 관리는 멤버가 아니다. 사이드바·레일·팔레트·화면 링크·직접 기능 항목은 같은 `resolveLink` 정책을 쓴다 — 멤버 사이에서 키를 이어받고, 명시적 page 값이 이기며 `null`은 지운다. 필터된 VOC → 내 Task → 다른 운영 메뉴로 가도 처음 채택한 출발지로 돌아온다. 홈·다른 업무 시스템·범위 없는 콘솔 진입(공간 진입·전환기·홈 카드)은 흐름을 끝내고 깨끗한 주소로 열린다. 개인 메뉴(내 VOC·알림·응답 설문·권한 요청)의 일반 진입은 다른 곳의 선택을 빌리지 않는다. 틀리거나 거부된 `managedSystem`은 보이게 거부하고 전체로 넓히지 않는다. 대상 허용 목록은 기능 Consumer 선언이 고르고 Kernel은 고르지 않는다.

**복귀 줄 (Decided, #760, [ADR-0081](../adr/0081-feedbackops-operator-screens-platform-frame.md)):** 메뉴가 속한 carry set(`CarrySetDef.pageKeys`, 공간과 무관, #1099b)이 `returnTo`를 나열하면 그 메뉴의 본 화면 본문 맨 위에 `PlatformPage`가 복귀 줄 한 줄(32px, `← <출발 메뉴>로 돌아가기` + `<출발 시스템>에서 왔습니다`)을 그린다. 판정은 Kernel `returnOrigin().accepted`(`safeReturnTo`와 `canOpen`을 통과한 `returnTo`만 true, parent·홈 fallback은 false)와 `spaceLabel`이고, 클릭 동작(반환 포커스·되돌린 Context 알림)은 `ReturnLink`와 같은 내부 훅이다. 그런 set 안의 같은 set 링크(공간이 달라도)는 `returnTo: true`여도 현재 값을 이어받기만 하고 새로 만들거나 덮어쓰지 않으며, 다른 set·set 밖 메뉴로 가는 링크는 현재 URL을 `returnTo`로 싣는 기존 규칙 그대로다. 공간 마지막 화면 복원과 최근 방문은 저장할 때 모든 메뉴에서 `returnTo`를 뺀다(복원이 줄을 되살리지 않는다). 그런 set이 아니면 줄은 없고 `ReturnLink`가 머리 동작에 그대로 있다.

**복귀 버튼 (Decided, [ADR-0025](../adr/0025-drilldown-level-page-keys-path-bar-layout.md); 이름 Candidate):** `returnTo`를 받는 목적지는 공통 `ReturnLink`로 돌아가는 버튼을 그린다. Kernel이 채택한 `returnTo`(§6.4)에서 출발 메뉴 이름과 그 메뉴의 드릴 단계 값을 읽어 `← 생산성 개요 (PHOTO › STG-PHOTO-A)`처럼 보이고, 누르면 출발 URL(단계 키 포함)로 돌아간다. `returnTo`가 없거나, 거부되거나, 현재 사용자가 그 메뉴나 공간을 열 수 없으면 parent 메뉴로 돌아간다. parent도 열 수 없으면 열 수 있는 홈(플랫폼 홈, 없으면 공간 홈)으로 돌아간다. 열 수 없는 출발 메뉴의 이름은 보이지 않는다. 표시용 판정이며 목적지가 다시 검사한다. 메뉴 이름은 manifest `label`이고 단계 값은 URL 값 그대로다(번역하지 않음, §23). 다른 메뉴로 넘길 때 단계 키는 목적지가 그 page key를 선언했을 때만 싣는다(`linkTo`의 기존 규칙).

기능으로 나가는 외부 hop은 `linkTo`가 아니라 [플랫폼 인바운드 링크 계약](../integration/platform-inbound-links.md)을 따른다(절대 URL · 새 탭 · phase-1 allowlist).

## 공유 링크와 VOC 재현 링크 (Decided, #961 노드 961f)

Context 바의 `현재 조건 공유`·`메뉴 주소 복사`와 VOC 재현 링크는 같은 직렬화기(셸 `buildShareLink`)를 쓴다. 입력은 호스트의 적용된 Context·page 쌍뿐이고 `returnTo`와 등록되지 않은 extras는 앱 밖으로 나가지 않는다. VOC는 칩을 지운 뒤 남은 상태를 넘기고(칩 제거 의미 유지), 공유는 길이 상한(4000자)을 두지만 VOC 재현 링크는 상한을 두지 않는다. 규칙은 kernel.md §11.
