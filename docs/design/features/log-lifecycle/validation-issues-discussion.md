# 사람이 등록하는 검증 항목과 토론 (#1808)

**Candidate · 미구현.** 논리 모델·권한 분리·후속 노드 설계이며 API/DDL/새 메뉴/역할 부여 승인이 아니다. **DDL은 이 설계 merge와 소유자 결정 뒤 별도 PR**로 작성한다. #1815는 [진단 출력·근거 읽기](diagnostic-report-parity.md), #1809는 Round 결과 탐색·Drawer를 소유한다. UI 문구는 정하지 않는다.

## 1. 도메인 경계

`ValidationIssue`는 사람이 규칙 밖 관찰·검토 필요 사항도 적을 수 있는 논리 객체 후보명이다. `ruleId`가 없어도 생성하며 정식 결함으로 확정하는 시점은 Open H1이다. 규칙 결과·작업자 의견·사람 등록 항목·Gate 결정은 별도 상태 축이다. 등록·댓글·상태 변경으로 RuleResult/verdict/opinion/Gate/Knowledge 상태·회귀 비교를 고치지 않는다. 이유: 사람이 토론했다는 사실은 기계 재실행이나 승인 근거가 아니다.

| 논리 객체 후보 | 필드와 관계 | 경계·이유 |
| --- | --- | --- |
| `ValidationIssue` | 안정 `issueId`, `workspaceId`, `projectId`, `firstRoundId`, 제목·자유 설명, 선택 기대/실제·재현 절차·영향 설명, 보고자/시각, 담당·심각도·상태 후보, 동시성 version | 한 개발 건 소유. 제목·본문에 규칙 존재를 요구하지 않음. 담당/심각도 값·필수 여부는 H3 |
| `IssueOccurrence` | 안정 occurrence 식별자, `issueId`, `roundId`, 선택 `attemptId`/`ruleResultId`/진단 참조, 고정 Revision/specPin/입력 manifest 참조, 연결자/시각 | 다음 Round 재발·재검증도 같은 issueId에 추가. 규칙 연결 시 attempt와 Round의 소속 일치 검증. 동일 rule의 FAIL 여러 건을 자동 Issue로 만들지 않음 |
| `LinkedEvidence` | occurrence와 공통 `EvidenceRef(fileRef,line,fileSha256)`, 선택 진단 `itemKey`·producer/version·attempt 참조, 연결자/시각 | 근거 위치 원본은 [기존 설계](README.md#rule_result). 설명/원문 복사가 아닌 참조. 다른 attempt의 같은 itemKey를 동일 진단으로 합치지 않음 |
| Round discussion | 안정 discussion 대상 `roundId`, 댓글 ID, 작성자·시각·내용, 정정 provenance | Round 전체 해석·검토 대화. Issue가 없어도 존재 |
| Issue thread | 안정 discussion 대상 `issueId`, 댓글과 상태/연결 이벤트의 타임라인 | 항목별 대화. Round discussion과 대상/목록/카운트를 섞지 않음 |

같은 규칙·위치를 두 사람이 등록해도 제목/해시 기반 자동 병합을 하지 않는다. 중복 가능성은 검토자가 기존 항목에 연결하는 선택으로 처리한다. 같은 issueId의 재발 이력은 추가 전용이고 재검증 결과는 새 occurrence로 연결한다. 다른 개발 건으로 이동·병합은 MVP 후보 밖 미구현이며 H1의 식별 범위가 넓어질 때 별도 설계로 다시 연다.

occurrence/근거 연결은 같은 workspace·개발 건의 읽을 수 있는 Round여야 한다. `attemptId`는 그 Round의 요청에, `ruleResultId`는 그 attempt에 속해야 한다. EvidenceRef의 fileRef는 해당 Round 샘플에 있어야 한다. hash mismatch는 참조 불일치 상태로 보존하고 해시를 고쳐 진짜 근거로 바꾸지 않는다. 진단 연결은 #1815의 안정 `(attemptId, producer, schemaVersion, itemKey)` 범위를 검증하며 사람 댓글을 진단 저장소로 사용하지 않는다.

## 2. 상태 기계 후보와 재검증

아래 전이는 **Candidate**이며 H1/H2/H3에서 단계·역할을 결정하기 전 구현하지 않는다. 단순 `open/resolved/reopened` 대안과 함께 비교한다.

| 사건 후보 | 전이 후보 | 조건·기록 |
| --- | --- | --- |
| 등록 | 없음 → `reported` | 규칙 없이 허용. 공식 결함 확정은 별도 H1 |
| 조사 시작 | `reported` → `investigating` | 담당/변경 권한을 다시 판정 |
| 수정 요청 | `investigating` → `change_requested` | 사람 판단 사유와 관련 근거 참조 |
| 재검증 요청 | `investigating|change_requested` → `revalidation_needed` | 기존 요청 등록 API와 별도 명시 동작. 상태 변경만으로 Worker 실행하지 않음 |
| 해결 확인 | `investigating|revalidation_needed` → `resolved` | 확인 사유·선택한 새 occurrence. PASS만으로 자동 해결하지 않음 |
| 검토 제외 | `reported|investigating` → `dismissed` | 오인/중복 등 사유. Rule FAIL을 지우지 않음 |
| 재발/재열기 | `resolved|dismissed` → `investigating` | 같은 issueId에 새 occurrence·재열기 사건. 과거 댓글·해결 기록 유지 |

재검증은 해당 Round의 기존 `lifecycle.round.manage`와 요청 등록 규칙을 그대로 따른다. Issue 상태를 바꿀 권한만으로 요청·Gate 권한을 얻지 않는다. 닫힌 Round에 댓글/Issue 등록을 허용할지는 H4이며 샘플·결과 불변 규칙은 어느 선택에서도 유지한다.

## 3. 권한 합성 후보

사람 경로는 로그인한 human Actor 세션으로 한정하는 추천안이다. `validation.worker`는 token-only scope이며 댓글·등록·상태·Gate 경로를 열지 않는다. 새 권한 이름/부여 역할은 H2에서 결정하고 아래는 **동작 구분**만 정의한다. 미확정 권한을 기존 `lifecycle.round.manage`에 묵시적으로 더하지 않는다.

| 동작 구분 | 함께 만족할 조건 후보 | 기존 권한과의 관계 |
| --- | --- | --- |
| read | `platform:view` + workspace + 현재 Model/Project/Round 객체 가시성. Issue의 소유 개발 건 가시성 확인 | manage 없이 읽을 수 있는 후보. Source 원문 권한은 별도 |
| comment | read + 토론 참여 권한 + 세션 | manage만 쓰면 일반 User 참여가 막히므로 좁은 contribute 권한을 H2에 추천 |
| register | read + 등록 권한 + 대상 Round 상태 정책 | comment와 분리해 승인 가능. `lifecycle.round.manage`의 자동 확장 금지 |
| change state | read + 처리 상태 변경 권한 + expectedVersion | 작성자라는 이유로 자동 허용하지 않음. Gate 권한과 무관 |
| link occurrence/evidence/진단 | Issue와 출처 Round 양쪽 read + 연결 권한. Source 유래 상세는 별도 ACL | 외부 EntityLink는 양 끝 도메인 API가 판정. 링크로 read 권한을 만들지 않음 |

여러 Round에 연결된 Issue라도 목록·카운트·직접 링크·댓글·최근 활동은 현재 읽을 수 있는 대상에 한정한다. 읽을 수 없는 occurrence의 존재/수/제목/작성자도 합산하지 않는다. Issue 자체가 보이지 않으면 댓글 수를 먼저 내보내지 않는다. Source 권한이 없어도 독립적으로 쓴 사람 설명을 읽게 할지, thread 전체를 숨길지는 H7에서 결정한다. **Source에서 가져온 발췌·진단 내용은 그 정책과 무관하게 매 접근 Source ACL**을 적용한다.

원본 텍스트를 댓글/자유 설명에 복사하지 않고 EvidenceRef로 연결하도록 저장 계약을 둔다. 서버 비밀 패턴 검사는 의미상 로그 본문 유입을 완전히 판별하지 못한다. 따라서 Source 유래 내용은 댓글과 분리된 보호 읽기로만 제공하고, 원본 접근 철회 시 기존 Drawer 캐시/발췌도 다시 노출하지 않는다. 토론 참여권은 Source 권한을 부여하지 않는다.

## 4. 저장·감사·멱등·페이지

논리 소유자는 `log-lifecycle`이다. 다른 모듈 테이블에 Issue/댓글을 끼워 넣지 않으며 새 전역 Discussion 엔진을 전제하지 않는다. 물리 테이블/인덱스/마이그레이션은 별도 PR이다.

- occurrence·근거 참조·상태 사건은 추가 전용 후보다. 동시 상태 변경/담당 변경은 expectedVersion으로 한 건만 성공하게 한다. 정정은 이전 기록을 가리키는 새 사건으로 남기는 안을 H5에 추천한다. 삭제/보관/관리자 정리는 H5 답 전 구현하지 않는다.
- 등록/댓글/상태/연결 각각 기존 menu-action 멱등 틀을 사용한다. `(workspace, actor, action, idempotencyKey)`로 동일 내용 재시도는 같은 결과·한 번의 감사, 다른 내용은 conflict다. 같은 위치 연결은 동일 occurrence/EvidenceRef 중복을 반환하고 새 행/중복 감사를 만들지 않는다. ABA 상태 변경도 새 키·version이 필요하다.
- 입력은 길이·제어 문자·비밀 패턴·허용 링크를 검증하며 상한 초과를 조용히 자르지 않는다. 본문은 텍스트로 시작하는 안을 H5에 추천한다. rich content를 선택하면 기존 rich editor의 허용 문서 구조와 서버 sanitization을 사용한다. HTML/스크립트 실행·임의 embed 금지, 세션 쓰기에는 기존 CSRF 적용.
- 제목/본문/댓글/근거 수/첨부 수·크기/멘션 수/요청 bytes·빈도는 유한 상한으로 정한다. 댓글 페이지 시작 후보는 50, 최대 100이며 본문·스레드 총량 수치는 H5 실사로 확정한다. 답 전 무제한 저장을 구현하지 않는다.
- Issue 목록은 `(lastActivityAt, issueId)`, 댓글·이력은 `(createdAt, id)`의 결정적 순서와 cursor 페이지 후보를 쓴다. cursor는 workspace·Actor·대상·필터에 묶고 페이지마다 권한을 재판정한다. 삭제/정정이 있어도 중복·누락/권한 카운트 유출을 시험한다. 최신 활동 순서 변화로 페이지가 흔들릴 때의 snapshot 여부는 구현 계약에서 명시한다.
- 도메인 쓰기·이력·감사는 한 트랜잭션으로 처리한다. 감사 후보는 안정 대상 ID, 행위자, 동작, 상태 전후 enum·version·개수뿐이다. 제목/댓글/설명/로그 본문·fileRef/경로·서명 URL·토큰은 넣지 않는다. 검색·알림·export에 자유 본문을 자동 복제하지 않는다.

## 5. API surface sketch와 재사용

다음은 **이름 후보만**이며 endpoint path·DTO·DDL 계약이 아니다. 실제 계약을 확정할 때 [API 소유 문서](../../../architecture/platform-api/api/log-lifecycle.md)를 갱신한다.

| 책임 | 이름 후보 |
| --- | --- |
| 항목 목록/상세 | `validationIssues`, `validationIssueDetail` |
| 등록/처리 | `validationIssueRegister`, `validationIssueChangeState`, `validationIssueAssign` |
| 재발·근거·진단 연결 | `validationIssueLinkOccurrence`, `validationIssueLinkEvidence`, `validationIssueLinkDiagnostic` |
| Round 전체 토론 | `roundDiscussion`, `roundDiscussionComment` |
| 항목별 토론/이력 | `validationIssueThread`, `validationIssueComment`, `validationIssueHistory` |

`ProgressNotesSection`은 댓글 작성/진행 메모·상태 사건 표시의 재사용 후보이며 현재 Finding/Task용 데이터 hook·권한을 그대로 호출하지 않는다. 어댑터로 토론 대상·읽기/쓰기 함수를 주입할 수 있는지 확인한다. domain-free 조각은 소비자 수와 관계없이 SDK에 두고, Issue 상태·저장·권한은 log-lifecycle에 둔다. rich editor는 H5, 첨부 upload는 H6 답 이후 연결한다. DetailDrawer·PlatformDataTable·EntityLink·Audit은 기존 부품/서비스를 재사용하고 새 전역 인증/포럼을 만들지 않는다.

**Finding을 저장 모델로 재사용하지 않는다.** Finding은 VOC·설문 등의 근거를 종합해 업무 실행으로 넘기는 객체이고 Primary Managed System이 필수다([GLOSSARY](../../../../GLOSSARY.md)). 검증 항목은 개발 건/Round가 소유하며 Source ACL로 근거를 읽으므로 소유권·Scope가 맞지 않는다. Finding 댓글 UX는 재사용해도 그 권한·테이블에 Issue를 저장하지 않는다. Task도 Managed System의 실행 업무이므로 검증 상태를 Task 상태로 바꾸지 않는다.

Task/VOC/Finding/지식 초안으로의 전달은 H8 답 뒤 사용자가 명시적으로 실행하고 기존 대상 도메인 API·EntityLink 허용 쌍을 사용한다. 등록되지 않은 링크 쌍이나 Managed System 없는 Finding을 만들지 않는다. 대상 API 실패는 항목을 자동 해결하거나 댓글을 잃게 하지 않는다. Discourse 연동은 Round 내부의 권한·직접 링크 정본을 대체하지 않는다.

## 6. #1815·#1809 경계와 구현 노드

결과 상세에서 규칙 없는 사람 항목 등록/기존 항목 연결로 이어지고 저장 뒤 해당 thread를 열 수 있어야 한다. Round 전체 대화와 두 개 이상의 항목 thread는 대상이 분명히 구별되어야 한다. 실제 배치·버튼 문구·URL 키는 #1809와 실제 앱 variant에서 확정한다. 의견 0건도 규칙 상세 탐색을 막지 않는다. 이 문서는 화면 시안 승인으로 간주하지 않는다.

| 노드 | 선행 / 게이트 | 위치·stack |
| --- | --- | --- |
| N0 도메인·권한 결정 | 이 설계 merge, H1–H8 관련 답·용어 검토 | 문서. 물리 저장 구현 없음 |
| N1 저장·이력·멱등 | N0의 모델/상태/댓글 정책 확정 | **후속 DDL PR**, backend only. #1809 미접촉 |
| N2 사람 API/가시성/감사 | N1 + 역할/Source 정책 확정 | backend only. #1809보다 먼저 가능. service token 부정 테스트 포함 |
| N3 Round 토론/항목 목록·상세 | N2 + **#1809 merge** + 실제 앱 variant/Artifact 승인 | `RoundScreen.tsx`·thread/Drawer 연결, #1809 뒤 stack |
| N4 진단/근거 연결 UI | N3 + #1815 A3, B 진단 연결은 B1 이후 | `RoundScreen.tsx` 연결 가능. 공통 EvidenceRef 유지 |
| N5 재검증/도메인 전달 | N2 + H8 및 기존 대상 API 권한·링크 쌍 확인, UI는 N3 | 요청 생성은 기존 API, 외부 도메인 쓰기 직접 금지 |
| N6 합성 수직 검증 | N2/N3/N4, 전달은 N5 뒤 | Round 전체 대화 + 두 항목 thread, 재발·권한 철회·직접 링크·충돌·긴 페이지 확인 |

수용 검증은 규칙 없이 등록→다른 허가자 댓글→상태 변경→다음 Round 연결을 포함한다. 자기/타인 댓글 정정, 중복 제출, 동시 처리, 닫힌 Round, 보관/재열기, 외부 링크 실패, Source 철회·숨겨진 대상·카운트 누출도 확인한다. 모든 단계에서 기계 결과·Gate·의견·회귀 비교는 불변이어야 한다. H1–H8 답이 필요한 기능은 미구현으로 두고 해당 답으로만 다시 연다.

## 7. Open decisions (통합)

| ID / 상태 | 선택지·질문 | 추천과 이유 |
| --- | --- | --- |
| H1 Open | 보고 즉시 결함인가, 검토 후 확정인가? 관찰과 결함을 별도 종류로 둘까? 동일 항목의 식별 범위는 개발 건인가? | 중립 ValidationIssue로 등록하고 검토 후 결함 확인, 우선 개발 건 범위. 관찰을 공식 FAIL과 혼동하지 않음. 명칭도 용어 검토 필요 |
| H2 Open | read/comment/register/change state/link 각각 누가 하는가? round.manage만, 좁은 contribute, 별도 역할 중 선택 | User 참여용 comment/register와 처리·연결 권한 분리. 요청/Gate는 기존 권한 유지 |
| H3 Open | 단순 open/resolved/reopened 또는 조사·수정요청·재검증 포함 다단계? 담당·심각도 필수/값은? | 실제 업무가 확인되면 위 다단계, 그 전 값/필수 여부 미확정. 자동 PASS 해결은 금지 |
| H4 Open | 열린 Round만 작성, 닫힌 Round도 토론/항목 등록 허용? | 과거 결과 검토를 위해 닫힌 Round도 사람 기록 허용 추천. 샘플/규칙 결과는 불변 |
| H5 Open | append-only 정정, 본인 시간제 수정, 관리자 삭제 중 정책은? plain text/rich content, 답글/멘션·본문/페이지 상한은? | 텍스트·추가 전용 정정·명시 대상의 평면 댓글과 페이지부터. provenance와 구현 범위를 줄임. 삭제·멘션·rich는 필요 확인 후 |
| H6 Open | 첨부 없음, 기존 수동 Round 첨부 참조, Issue/댓글 전용 첨부 중 어디까지? | 최초에는 안전한 기존 참조만. #1815 결과 아티팩트와 사람 첨부의 권한·보관을 혼합하지 않음 |
| H7 Open | 사람 prose와 AI 의견을 별도 영역/연결 타임라인 중 어떻게 보여줄까? Source 권한 없는 thread 독자는 사람 글만 볼까, 전체 숨길까? | 축을 분리하고 명시 참조로 연결. Source 유래 본문은 보호 읽기만 허용해 철회 후 유출 방지 |
| H8 Open | 어느 시점에 Task Request/VOC/Finding/지식 초안으로 넘기는가? | 사용자가 처리 목적·대상·권한을 확인한 명시 동작. Issue 상태에서 자동 변환하면 소유권과 업무 의미가 바뀜 |
