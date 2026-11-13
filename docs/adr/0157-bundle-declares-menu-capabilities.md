# 선언 묶음이 자기 capability 행과 메타를 선언한다: 메뉴 권한이 닫힌 목록의 별칭이 아니게 한다

상태: **Decided (2026-11-13)** — 설계. 세부 모양(문법, 읽기 응답의 자리)은 구현 노드가 정한다.
- 결정자: 사용자(소유자) — 2026-11-13 [#1902](https://github.com/hjung3113/analytics-platform/issues/1902) 질문 «니추천대로»(방향 (a)와 두 조건: 가장 닫힌 기본값, 플랫폼 이름 충돌은 기동 실패). 고문 리뷰(2026-11-13, #1902 댓글)의 변경 R1–R9를 반영했고, 그중 «범위 종류 메타 없음»(R3)과 `sessionOnly` 기본 `true`(R2)는 소유자 결정 (a)보다 좁히는 방향이라 팀장이 승인했다. 구현 노드가 되돌릴 수 있다.
- Amends: [ADR-0146](0146-core-server-loads-in-house-declarations-from-deployment-config.md) 결정 3(capability 목록은 코드에 닫혀 있다), [ADR-0068](0068-permission-scope-and-business-system-link.md) 결정 2(capability 어휘 원천은 «플랫폼 ∪ 선언»이 된다).
- Scope: [#1902](https://github.com/hjung3113/analytics-platform/issues/1902). 관련: [ADR-0116](0116-platform-api-tokens-personal-and-service.md), [ADR-0154](0154-site-and-room-grants-are-platform-owned.md), [ADR-0156](0156-core-server-checks-the-bundle-against-a-built-menu-snapshot.md), #1844, #1846.

## 맥락

ADR-0146 결정 3은 메뉴 권한을 `permission → capability` 행으로 두고 capability는 «지금의 부여 체계»가 정한다고 했다. 그 capability 목록(`CAPABILITIES`)은 코드에 닫혀 있다. 저장소 밖 조립은 플랫폼 코드와 마이그레이션을 고칠 수 없으므로 시스템별·동작별 권한(예: 보기와 표시하기를 따로)은 기존 capability에 얹을 수밖에 없고, 그러면 서로 다른 메뉴 권한이 같은 부여 하나가 된다(`widget:view`와 `widget:annotate`가 모두 `workspace.read`).

capability 이름이 닫힌 목록에 묶인 곳은 아래보다 많다. 구현 노드가 `rg`로 다시 센다.
- 목록과 메타: `packages/feature-shared/src/enums/capabilities.ts`(`CAPABILITIES`, `CAPABILITY_META`), `supported-scope-policy.ts`의 손 목록(`NOT_FOR_USER_ROLE`, `supportedScopeCandidates`).
- 공유 wire 스키마: `packages/feature-shared/src/permissions/admin.ts`(직접 부여 입력, 부여 목록 응답의 `z.enum(CAPABILITIES)`), `audit/permission.ts`(`permission_granted` 감사 상세). 그대로면 선언 capability는 직접 부여가 안 되고 부여 목록 응답의 클라이언트 파싱이 통째로 실패한다.
- 서버 판정 입구: `permissions/routes.ts`, `request-service.ts`, `decision-service.ts`, `selected-read-service.ts`, `api-tokens/service.ts`, `menu-dispatch/declarations-file.ts`, `declared-endpoints.ts`.
- 감사 읽기 투영(`core.platform_audit_events`, `SECURITY DEFINER`)이 SQL에 하드코딩한 비민감 capability 목록.
- 화면: 권한 신청 결정 폼의 민감 사유 요구, `permission-selection.ts`, `InboxPanel`, 권한 신청 화면의 신청 가능 목록, 문구 표(`apps/feature-screens/src/lib/copy/capabilities.ts`).

기존 손 목록은 모르는 이름을 **열린 쪽**으로 답한다(`NOT_FOR_USER_ROLE.has(x)`는 `false`, `supportedScopeCandidates`의 마지막 가지는 Managed System별 후보). `CAPABILITY_META[x]`를 직접 읽는 함수는 예외를 던진다. 선언 capability가 한 곳이라도 옛 경로를 타면 닫힌 기본값이 깨진다.

## 결정

1. **묶음이 capability를 선언한다.** 선언 묶음(ADR-0146 결정 2)에 `capabilities` 행을 둔다. 한 행은 `id`와 메타다: `sensitive`, `adminModuleBypass`, `sessionOnly`, 받을 수 있는 Role Level의 **허용 목록**, 표시 이름. 메뉴 권한 행의 `capability`는 플랫폼 capability 또는 이 묶음이 선언한 capability여야 하고, 둘 다 아니면 기동 실패다. 권한 행이 `scope.read`를 가리키면 기동 실패다(`scope.read`는 workspace 단일 부여가 없어 영원히 열리지 않는 대응이다). **쓰이지 않는 선언 capability는 기동 실패가 아니다**(전환·은퇴 순서에 필요하다, 결정 7).
2. **선언 capability의 기본은 가장 닫힌 쪽이다.** 메타를 적지 않으면 `sensitive: true`, `adminModuleBypass: 'none'`, `sessionOnly: true`, 받을 수 있는 Role Level은 `admin`·`developer`, 표시 이름은 `id`다. 완화는 묶음이 필드마다 명시할 때만 일어난다. `tokenOnly`는 스키마가 거부한다. 메타는 **발급·부여 시점이 아니라 판정 시점**에 읽는다. 그래서 나중에 `sessionOnly`가 되거나 선언에서 빠진 capability를 실은 기존 API 토큰은 다음 호출부터 거부된다.
   - `adminModuleBypass`가 `none`이 아닌데 허용 목록에 `admin`이 없으면 기동 실패다.
   - `adminModuleBypass: 'none'`은 ADR-0154 결정 2와 같은 뜻이다: Admin을 막는 경계가 아니라 «기본은 못 열고, 열 때는 감사 기록이 남는다». `permission_self_approval`이 `allowed`면 Admin은 자기에게 부여할 수 있고 `self_grant` 감사가 남는다. 승인자는 지금처럼 `workspace.admin`이고 선언 capability별 승인자는 없다(ADR-0068 결정 2).
   - 명시 거부(deny)는 선언 capability에도 그대로 동작하고 `unless_denied`와 맞물린다.
3. **이름은 예약 접두어 아래에만 둔다.** 선언 `id`는 고정된 예약 접두어(문법은 구현 노드, 예: `ext.<module>.<action>`)로 시작하고, 문자 집합(소문자·숫자·`_`·`.`)과 길이 상한을 지킨다. 아니면 기동 실패다. 플랫폼 쪽 시험이 `CAPABILITIES`와 `TOKEN_ONLY_SCOPES`(`validation.worker`가 토큰 범위에서 같은 이름 공간을 쓴다)에 이 접두어가 없음을 고정한다. 이유: 접두어가 플랫폼이 쓰지 않는 영역이어야 다음 릴리스의 새 플랫폼 이름이 업그레이드한 배포의 기동을 깨지 않고, 선언만 지웠을 때 부여 행이 같은 이름의 플랫폼 capability 부여로 읽히는 권한 이월이 생기지 않는다. 묶음마다 접두어를 하나로 묶지 않는다(시스템별 권한 `ext.sysa.view`·`ext.sysb.view`를 막을 이유가 없다). `id`가 `CAPABILITIES`에 있으면 기동 실패라는 규칙은 최종 판정으로 그대로 둔다(덮어쓰기도 보태기도 없다).
4. **부여는 별개이고 선언은 부여가 아니다.** 선언 capability는 부여 표(ADR-0068)의 ordinary capability처럼 신청·승인·부여된다. `widget.annotate` 부여가 `widget.view`나 `workspace.read`를 주지 않는다. 부여받지 못한 사람은 선언 capability로 열리는 메뉴 권한에 접근하지 못한다. 한 capability의 판정은 그 capability의 부여만 본다.
5. **부여 범위는 workspace 하나뿐이다.** 선언 capability의 후보는 항상 `[{ managed_system_id: null }]`이다. Managed System·site·room 범위의 신청·승인·직접 부여는 `validation.failed`다. 이유: 메뉴 권한 판정은 Managed System 없이 `{ workspace_id }`로만 capability를 묻는다. Managed System 범위 부여는 메뉴를 열지 못하는 죽은 부여가 되거나, «아무 시스템 부여나 있으면 연다»로 구현하면 한 시스템 부여가 메뉴 전체를 여는 누출이 된다. 데이터 범위는 Scope(`requiresScope` + `scope.read`, ADR-0154)가 따로 좁힌다. `scope.read`와 선언 capability는 서로를 주지 않는다. `requiresScope` 엔드포인트를 API 토큰으로 부르려면 선언 capability(`sessionOnly: false`)와 `scope.read`가 둘 다 토큰 범위에 있어야 한다(ADR-0154 결정 4). Managed System별 선언 권한은 Deferred.
6. **Role Level은 허용 목록이고 쓰기와 판정 양쪽에서 현재 Role Level로 본다.** 목록에 없는 Role Level은 신청·승인·직접 부여가 거부되고, 판정 때 부여 행을 버리며, 신청 가능으로 나오지 않는다. 받는 쪽 검증(`validateSupportedScope`의 `recipientRole`)과 판정 시점의 현재 역할(`check-service.ts`의 `withRoleExclusion`)을 모두 같은 메타로 옮긴다. 허용 목록이어야 새 Role Level이 생겼을 때 닫힌 쪽이다.
7. **저장 어휘는 «플랫폼 ∪ 선언» 레지스트리 하나이고 서버 인스턴스에 속한다.** 서버는 기동 때 묶음의 선언 capability를 검증하고 레지스트리를 만든다. 부여·신청·API 토큰 범위·확인 서비스는 `isCapability`(닫힌 목록) 대신 이 레지스트리를 쓰고, **메타 조회는 레지스트리 한 곳이며 등록되지 않은 이름은 예외 또는 거부다**(손 목록의 «모르면 연다»를 선언 capability가 타지 않는다). 레지스트리는 `createPlatformPermissionResolver`와 같은 이유로 인스턴스에 속한다: 한 프로세스의 두 서버가 서로의 선언을 읽지 않는다. `@ap/feature-shared`의 모듈 전역 상수를 바꾸는 방식은 쓰지 않는다. 레지스트리는 배포 하나에 하나이고 모든 workspace가 같이 쓴다.
   - 선언에서 빠진 capability의 부여 행은 남기되 판정에서 거부한다. 같은 이름이 다시 선언되면 옛 부여가 되살아나므로 ADR-0154 결정 3과 같은 장치를 둔다: 운영 콘솔의 부여 목록은 그런 행(부여·거부·대기 신청)을 «선언에 없음»으로 표시하고 회수할 수 있게 한다. 기동 때 레지스트리 밖을 가리키는 활성 부여·거부·대기 신청·토큰 범위의 수를 경고 로그로 남긴다(기동 실패 아님). 승인은 그 순간의 레지스트리와 메타로 다시 판정한다.
   - 이름을 빼거나 바꾸기 전에 그 capability의 부여를 먼저 회수한다. 전환 순서는 «먼저 선언 → 사람에게 부여 → 메뉴 권한 행을 새 capability로 바꿈», 은퇴 순서는 «권한 행에서 뺌 → 회수 → 선언 삭제»다. 선언 없이 권한 행부터 바꾸면 전원이 막히고, 묶음을 이전으로 되돌리면 이전의 넓은 대응(`workspace.read`)으로 돌아간다. 이 절차를 `in-house-rollout.md`에 적는다.
8. **감사 투영: 플랫폼 목록은 SQL에 그대로 두고 표는 선언 capability를 더하기만 한다.** 마이그레이션 하나. 플랫폼 비민감 capability 목록은 함수(`core.platform_audit_events`) 안에 그대로 있다. 새 표 `core.declared_capabilities`(`capability`, `sensitive`)는 `OR` 가지 하나로 비민감 선언 capability를 더할 뿐이다. 이유: 함수는 `SECURITY DEFINER`이고 앱 역할은 EXECUTE만 가진다. 목록 전체를 앱이 쓰는 표로 바꾸면 앱 역할이 `workspace.admin` 같은 플랫폼 민감 이름을 `sensitive = false`로 넣어 그 권한 행을 풀 수 있다. 그래서:
   - 표에 예약 접두어 CHECK를 걸고 함수도 접두어를 다시 확인한다. 플랫폼 이름은 표에 들어가도 풀리지 않는다.
   - 함수 서명은 바꾸지 않는다. 마이그레이션 뒤 앱만 이전 버전으로 되돌려도 동작한다(표가 비어 있으면 지금과 같은 결과).
   - 기동 동기화는 한 트랜잭션에서 묶음에 없는 행을 지우고 있는 행을 맞춘다. 표를 읽는 권한은 함수 소유 역할에만 준다.
   - 마이그레이션 머리에 되돌리기 줄을 적는다(0127 형식): 이전 함수 본문 복원과 표 삭제이고, 선언 capability 이름의 부여·신청 행은 지우지 않으며 판정에서 읽히지 않는다.
   - `sensitive: true → false`로 바꾸면 그 capability의 지난 권한 행도 투영에 나온다(신청 행은 `detail.sensitive`가 있어 계속 빠지고, 뒤의 행은 표식이 없다). ADR과 `in-house-rollout.md`에 적는다.
9. **클라이언트는 서버가 낸 읽기로 레지스트리를 받는다.** 서버가 인증된 workspace 구성원에게 선언 capability의 `id`·표시 이름·`sensitive`·내 Role Level로 신청할 수 있는지를 내는 읽기를 둔다(어느 응답에 싣는지는 구현 노드). 프론트엔드 값은 표시용이고 사유 요구·Role Level·토큰 판정은 서버가 한다. 노출 판단(ADR-0154 결정 5와 같은 형식): 선언 capability의 이름과 표시 이름은 구성원 모두에게 보이는 조직 값이고 누가 받았는지는 여기에 들지 않는다. 표시 이름은 길이 상한을 두고 평문으로만 그린다. 승인·직접 부여·부여 목록 화면은 표시 이름 옆에 `id`를 같이 보인다. 화면에 선언 capability 행이 더해지는 것은 새 화면·새 공개 컴포넌트가 아니므로 루트 AGENTS §UI 시험 A·B에 걸리지 않는다(시안 없이 가고 PR 본문 Decisions에 적는다). 이 읽기는 #1844 (a)(메뉴 권한 없음 화면의 권한 요청 진입)의 «메뉴 권한 → capability» 대응이 쓰는 길이다.
10. **메타·대응 변경의 기록은 배포 설정의 변경 이력이다.** `adminModuleBypass`나 권한 행의 대응을 바꾸는 일은 부여 사건 없이 접근을 넓힐 수 있지만 플랫폼 감사에 행을 남기지 않는다. 묶음은 운영자가 놓는 파일이라는 ADR-0156 «신뢰 한계»와 같은 전제다. 기동은 선언 capability 수와, 기본값보다 완화된 필드가 있는 capability 수를 로그로 남긴다.
11. **공개 시험은 합성 선언만 쓴다**(ADR-0146 결정 6).

## 수용 기준(음성 시험 포함)

- 예약 접두어가 아닌 `id`, `CAPABILITIES`·`TOKEN_ONLY_SCOPES`와 같은 `id`는 기동 실패. 플랫폼 쪽 시험이 두 목록에 예약 접두어가 없음을 고정한다.
- 부여받지 않은 사람은 선언 capability로 열리는 메뉴 권한에 접근할 수 없다. 세션 스냅샷의 권한 목록과 조회 판정 두 경로 모두에서 확인한다. 기본에서 Admin도 우회로 열지 못한다(`self_grant`가 가능한 설정에서는 감사가 남는다).
- 합성 `widget.annotate` 부여가 `widget.view`(다른 선언 capability)나 `workspace.read`를 주지 않는다.
- 메타를 비운 선언 capability는 토큰 범위로 발급할 수 없고(`session_only`) 토큰 호출은 `session_required`다. `workspace.read`만 실은 토큰은 선언 capability로 옮긴 메뉴 권한을 열지 못한다.
- 선언 capability 부여만 있고 `scope.read` site 부여가 없으면 `requiresScope` 엔드포인트는 `forbidden`이다. 반대도 같다.
- 선언 capability의 Managed System·site 범위 부여·신청은 `validation.failed`.
- 메타를 비운 선언 capability는 User Role Level에 부여할 수 없다. 부여를 가진 채 허용 목록 밖 Role Level로 바뀐 사용자는 다음 요청부터 거부된다.
- 선언에서 빠진 capability: 판정 거부, 대기 신청 승인 거부, 부여 목록에 «선언에 없음», 기동 경고 수.
- 선언 capability가 `NOT_FOR_USER_ROLE`·`supportedScopeCandidates`의 손 목록 가지에 닿지 않는다.
- 감사 투영(`platform_app`으로 실행): 메타를 비운 선언 capability의 권한 행은 나오지 않는다. 표에 플랫폼 민감 capability 이름을 넣어도 그 행은 나오지 않는다.
- 다른 묶음으로 만든 두 서버가 한 프로세스에서 서로의 선언 capability를 받아들이지 않는다.
- 이 변경이 손대는 낡은 문장·시험을 같은 PR에서 고친다: ADR-0146 Deferred의 «각 `capability`는 플랫폼 capability여야 한다»와 `permissions-vocabulary.test.ts`, `05-permission-policy.md`, `real-server-checklist.md`, `in-house-rollout.md`, `GLOSSARY.md`(«선언 capability»).

## Considered Options

- **(a, 채택) 묶음이 capability 행과 메타를 선언한다.** «선언하면 끝»에 가장 가깝다.
- **(b) 메뉴 권한을 Managed System 단위로 부여한다**(권한 = 시스템 × 기존 capability). 같은 capability를 시스템으로만 나누므로 «보기와 표시하기를 따로»는 해결하지 못한다.
- **(c) 지금대로 두고 가이드에 한계를 적는다.** 한계가 남고 권한 선언과 판정 단위가 계속 어긋난다. 이 ADR의 구현 전 임시 안내로만 쓴다.

## Deferred (구현 안 함)

- 선언 capability 이름 바꾸기·합치기의 자동 이행. 이유: 회수 → 삭제 순서(결정 7)로 충분하다. 다시 여는 조건: 사내 파일럿이 이름을 자주 바꿔야 할 때.
- `tokenOnly` 선언 capability. 다시 여는 조건: 토큰만 쓰는 사내 엔드포인트가 생길 때.
- Managed System별 선언 권한. 다시 여는 조건: 판정에 Managed System을 싣는 선언 엔드포인트가 생길 때.
- 메타·대응 변경을 플랫폼 감사 사건으로 남기기. 다시 여는 조건: 묶음을 운영자 한 사람이 아니라 여러 팀이 바꾸게 될 때.
- 플랫폼 capability의 손 목록 두 개를 메타 플래그 하나로 합치기. 이유: `.planning/backlog.md`가 이미 따로 기록한다.

## 결과

- 저장소 밖 조립이 플랫폼 코드와 마이그레이션 없이 자기 권한 단위를 선언한다. 판정은 여전히 코어 서버 한 곳이다.
- 선언 capability는 기본에서 토큰에 실리지 않고, User에게 주어지지 않고, 감사 투영에 나오지 않으며, workspace 범위로만 부여된다.
