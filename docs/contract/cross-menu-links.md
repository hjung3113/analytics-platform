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

을 공통 처리한다. 구현은 Kernel `resolveLink(menuId, options)`다. 목적지가 Registry에 있으면(`kind: 'link'`) 결과는 세 가지다.

- `href`: 전역 Context는 목적지 지원 여부와 무관하게 실어 보낸다(미지원 표시는 목적지 화면 몫). 목적지가 다른 Scope(site)면 이전 site에 묶인 값(room_name·Line·PRC 그룹·Condition·Selection·Lot·Recipe·PPID)은 비우고 호출자가 명시한 값만 남긴다. page key는 목적지 manifest `pageKeys`에 있는 것만 싣는다.
- `allowed`: 목적지 메뉴 권한과 공간 진입 권한을 링크가 안다. 표시용이며 서버가 다시 검사한다. 등록된 목적지가 `false`면 호출자는 링크 대신 사유를 보인다(임의로 숨기지 않는다).
- `droppedPageKeys`: 목적지가 받지 않아 버려진 page key.

**목적지가 Registry에 없을 때 (Decided, 2026-11-13, [ADR-0158](../adr/0158-unregistered-link-destinations-and-declared-link-targets.md), #1903; 필드명 Candidate):** `resolveLink`는 던지지 않고 `kind: 'none'`을 돌려준다(`href`는 `null`, `allowed`는 `false`, `droppedPageKeys`는 빈 목록). `canOpen`도 등록되지 않은 id에 `false`다. 이유: 조립마다 메뉴 묶음이 다르고, 저장된 기록과 서버 응답의 메뉴 id는 지금 없는 메뉴를 가리킬 수 있다. 호출자는 `allowed`보다 `kind`를 먼저 본다. `none`이면 고정 진입점(버튼·동작)은 그리지 않고, 기록이 가리키는 목적지는 링크 없이 값만 글자로 보인다. 권한 사유로 표시하지 않으며(§17: 권한 없음과 구분), id나 다른 문자열로 URL을 대신 만들지 않는다. `linkTo`는 `resolveLink`의 `href`를 문자열로 돌려주는 줄임이고, 등록이 보증된 목적지(같은 패키지의 메뉴, 아래 `linkTargets.required`)에만 쓴다. 등록되지 않은 id에는 `RegistryError`를 던진다.

**목적지 선언 `linkTargets` (선택; Decided, 같은 ADR; 필드명 Candidate):** 메뉴 manifest는 다른 메뉴로 가는 링크의 목적지 메뉴 id를 `linkTargets: { required?, optional? }`로 적을 수 있다. `required`는 그 목적지가 없으면 이 메뉴의 주 흐름이 끊기는 경우에만 적고, `createRegistry`는 등록되지 않은 `required` 목적지를 `RegistryError`로 거부한다(조립 시점 오류). `optional`은 없어도 되는 목적지이고, 등록되지 않았으면 링크는 `none`이다. 선언됐지만 등록되지 않은 목적지는 `registry.missingLinkTargets`(`{ menuId, target, level }`)에 나온다. 자기 메뉴만 올리는 Registry(패키지 단위 시험, 다른 메뉴를 아직 붙이지 않은 시작 키트)는 `createRegistry({ linkTargetCheck: 'report' })`로 `required` 거부를 끄고 목록으로만 받는다. 배포하는 조립은 이 값을 쓰지 않는다. `linkTargets`를 적지 않은 메뉴는 검사하지 않는다. 모듈 메뉴(ADR-0053)는 `linkTargets`를 선언할 수 없다. 선언은 목적지 id만 담는다: Context·page 값·경로 값을 싣지 않고, 어떤 키도 이어받게 하지 않으며(이어받기는 carry set뿐), 권한을 주지 않고, 목적지로 들어오는 주소를 제한하지 않는다(직접 URL, `allowed`, 서버 재검사는 그대로). `required` 목적지는 다른 공간에 있어도 된다.

### 객체 종류로 다른 화면 열기 (Decided, 2026-11-14, #1930)

[ADR-0162](../adr/0162-inbound-links-destination-declares-object-kinds.md): 목적지는 선택 선언 `opensObject: { [kind]: { param } | { pageKey } }`로 객체 하나를 여는 입력을 적는다. 출발지는 머리 목록을 원하는 종류만 `subjectLinks: { [kind]: true | { param } }`로 선택한다. `true`는 `subjectPageKeys[kind]`의 현재 값, `{ param }`은 이 메뉴 경로의 현재 값이다. 두 필드 모두 없으면 기존 동작 그대로다. `subjectPageKeys`의 의미는 넓히지 않는다.

Registry는 조립 시 `RegistryError`로 다음을 거부한다: 종류가 `subjectPageKeys`와 같은 식별자(`/^[a-z][a-zA-Z0-9]*$/`)가 아님, 목적지 값이 `param`/`pageKey` 중 정확히 하나가 아님, `param`이 경로에 없거나 id 외에 채워야 할 경로 값이 남음, `pageKey`가 미선언·반복·숨김·`returnTo`·그 메뉴의 carry set 키·전역 Context 키임. page 목적지는 경로 값이 없어야 한다. 출발 `true`는 같은 종류의 `subjectPageKeys` 선언을, 출발 `{ param }`은 경로의 선언을 요구한다. 모듈 메뉴는 두 필드를 선언할 수 없다. 종류별 목적지 색인은 Registry당 한 번 만든다.

`objectLinks({ kind, id }, { returnTo?, page?, global? })`는 해당 종류의 등록 목적지마다 기존 `resolveLink` 결과(`href`·`allowed`·`droppedPageKeys`)에 `menuId`와 manifest `label`을 더해 돌려준다. Registry 순서, 개수 상한 없음, 현재 메뉴와 `none` 제외, 권한 없는 목적지는 유지한다. `page`는 목적지별로 걸러지며 객체의 site는 `global.scopeId`로 명시한다(EquipmentID에서 추정하지 않음). 목적지 id는 분석 Context와 분리한다. `pageKey` 목적지는 전달된 Context의 Selection 안에 없어도 열린 객체 또는 기존 «범위 밖» 상태를 보여야 한다. 목록 항목을 고르면 그 목적지는 도착 포커스(§26)를 받는다. 목적지가 출발 화면으로 돌아가는 길을 주려면 `pageKeys`에 `returnTo`를 선언하고 아래 «복귀 버튼»을 그린다(`navHidden` 상세 화면은 기존 `safeReturnTo` 규칙대로 복귀 출발지가 되지 않는다).

본문의 행·서랍은 `ObjectLinks`를 배치한다. 0개는 없음, 1개는 목적지 이름의 한 번 클릭 링크, 여러 개는 «다른 화면» 목록이다. 머리는 셸의 `PlatformPage`만 그린다: `subjectLinks` 선언 순서로 현재 값이 있는 종류마다, 메뉴 자체 ⋯ 동작 뒤 구분선 + mono id + «다른 화면에서 열기» 묶음을 둔다. 기존 `analysisActions`와 같은 본 화면 전용 gate를 따른다. 거부된 목적지는 기존 `HeaderOverflowItem`의 disabled와 `menuDenied` 사유를 쓴다. 목적지 label은 manifest 그대로이며 목록 안에서 겹치는 label은 공간 이름을 팔레트 모양의 둘째 줄에 더한다.

**의도 규칙:** 목록을 채택한 화면은 그 목록에 포함된 목적지의 손 링크를 제거한다(객체·화면당 목적지 하나). 특정 탭·Selection 변경 같은 목적지별 의도를 담은 연결은 유지한다. 감사 `auditDestination`과 생산성의 사이클타임 Selection 변경 링크는 목록으로 대체하지 않는다.

**종류 소유권:** [객체 종류](../../GLOSSARY.md)는 `subjectPageKeys`·`opensObject`·`subjectLinks`·개선 아이템 Target kind·감사 target type이 공유하는 이름 공간이다. 메뉴 저자가 id의 의미를 책임진다. 같은 이름은 조립 전체에서 같은 ID 공간을 뜻하며 시스템 로컬 id는 `clasEquipment`처럼 한정한 종류를 써야 한다. Kernel은 종류별 표시 이름을 갖지 않는다. 선언은 표시용이며 권한을 주지 않고 ADR-0156 서버 스냅샷에도 들어가지 않는다. 목록에 나타난 목적지를 출발 `linkTargets`에 추가하지 않는다.

상세에서 분석으로 복귀할 때는 §6.4에 따라 진입 전 Context를 그대로 복원하며, 목적지 ID로 출발 설비 선택을 변경하지 않는다. **CFG의 다른 메뉴와의 Context Link 연계는 Deferred**다. CFG 자체의 시각화·분석 범위와는 구분하며 이번 예시 경로에 CFG hop을 추가하지 않는다.

**운영 기능의 맥락·진입·복귀 경계 (Decided, 2026-10-29, [ADR-0100](../adr/0100-feature-navigation-and-independent-access.md), #1099c):** carry set `features`(`managedSystem`·`returnTo`)의 멤버는 모든 운영 기능 메뉴, 기능 관리 메뉴, 전역 내 Task이고 플랫폼 관리는 멤버가 아니다. 사이드바·레일·팔레트·화면 링크·직접 기능 항목은 같은 `resolveLink` 정책을 쓴다 — 멤버 사이에서 키를 이어받고, 명시적 page 값이 이기며 `null`은 지운다. 필터된 VOC → 내 Task → 다른 운영 메뉴로 가도 처음 채택한 출발지로 돌아온다. 홈·다른 업무 시스템·범위 없는 콘솔 진입(공간 진입·전환기·홈 카드)은 흐름을 끝내고 깨끗한 주소로 열린다. 개인 메뉴(내 VOC·알림·응답 설문·권한 요청)의 일반 진입은 다른 곳의 선택을 빌리지 않는다. 틀리거나 거부된 `managedSystem`은 보이게 거부하고 전체로 넓히지 않는다. 대상 허용 목록은 기능 Consumer 선언이 고르고 Kernel은 고르지 않는다.

**복귀 줄 (Decided, #760, [ADR-0081](../adr/0081-feedbackops-operator-screens-platform-frame.md)):** 메뉴가 속한 carry set(`CarrySetDef.pageKeys`, 공간과 무관, #1099b)이 `returnTo`를 나열하면 그 메뉴의 본 화면 본문 맨 위에 `PlatformPage`가 복귀 줄 한 줄(32px, `← <출발 메뉴>로 돌아가기` + `<출발 시스템>에서 왔습니다`)을 그린다. 판정은 Kernel `returnOrigin().accepted`(`safeReturnTo`와 `canOpen`을 통과한 `returnTo`만 true, parent·홈 fallback은 false)와 `spaceLabel`이고, 클릭 동작(반환 포커스·되돌린 Context 알림)은 `ReturnLink`와 같은 내부 훅이다. 그런 set 안의 같은 set 링크(공간이 달라도)는 `returnTo: true`여도 현재 값을 이어받기만 하고 새로 만들거나 덮어쓰지 않으며, 다른 set·set 밖 메뉴로 가는 링크는 현재 URL을 `returnTo`로 싣는 기존 규칙 그대로다. 공간 마지막 화면 복원과 최근 방문은 저장할 때 모든 메뉴에서 `returnTo`를 뺀다(복원이 줄을 되살리지 않는다). 그런 set이 아니면 줄은 없고 `ReturnLink`가 머리 동작에 그대로 있다.

**복귀 버튼 (Decided, [ADR-0025](../adr/0025-drilldown-level-page-keys-path-bar-layout.md); 이름 Candidate):** `returnTo`를 받는 목적지는 공통 `ReturnLink`로 돌아가는 버튼을 그린다. Kernel이 채택한 `returnTo`(§6.4)에서 출발 메뉴 이름과 그 메뉴의 드릴 단계 값을 읽어 `← 생산성 개요 (PHOTO › STG-PHOTO-A)`처럼 보이고, 누르면 출발 URL(단계 키 포함)로 돌아간다. `returnTo`가 없거나, 거부되거나, 현재 사용자가 그 메뉴나 공간을 열 수 없으면 parent 메뉴로 돌아간다. parent도 열 수 없으면 열 수 있는 홈(플랫폼 홈, 없으면 공간 홈)으로 돌아간다. 열 수 없는 출발 메뉴의 이름은 보이지 않는다. 표시용 판정이며 목적지가 다시 검사한다. 메뉴 이름은 manifest `label`이고 단계 값은 URL 값 그대로다(번역하지 않음, §23). 다른 메뉴로 넘길 때 단계 키는 목적지가 그 page key를 선언했을 때만 싣는다(`linkTo`의 기존 규칙).

기능으로 나가는 외부 hop은 `linkTo`가 아니라 [플랫폼 인바운드 링크 계약](../integration/platform-inbound-links.md)을 따른다(절대 URL · 새 탭 · phase-1 allowlist).

## 공유 링크와 VOC 재현 링크 (Decided, #961 노드 961f)

Context 바의 `현재 조건 공유`·`메뉴 주소 복사`와 VOC 재현 링크는 같은 직렬화기(셸 `buildShareLink`)를 쓴다. 입력은 호스트의 적용된 Context·page 쌍뿐이고 `returnTo`와 등록되지 않은 extras는 앱 밖으로 나가지 않는다. VOC는 칩을 지운 뒤 남은 상태를 넘기고(칩 제거 의미 유지), 공유는 길이 상한(4000자)을 두지만 VOC 재현 링크는 상한을 두지 않는다. 규칙은 kernel.md §11.
