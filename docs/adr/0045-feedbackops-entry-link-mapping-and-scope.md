# FeedbackOps 진입 링크: 매핑은 앱 정적 표, 설문은 목록·상세까지, 복귀는 FeedbackOps에 요청, 전체 진입은 전용 권한

상태: **Decided (2026-10-19)**, 결정 1(매핑 원천)은 [ADR-0067](0067-permission-scope-and-business-system-link.md)이 서버 연결 표로 개정했다(2026-10-22, 서버가 생기기 전까지는 정적 표 그대로). #81의 결정 질문을 닫는다. 구현은 #251(링크 계약·매핑 연결)이 맡는다. 이 결정은 [ADR-0027](0027-feedbackops-stays-standalone-entry-links.md)의 "공간 → Managed System 매핑"과 "전체 링크 노출 권한(Candidate)"을 정한다.
- 결정자: 사용자 — 2026-10-19, 네 질문에 답함(매핑 원천 "앱 설정 정적 표", 설문 "목록·상세만", 복귀 "FeedbackOps에 복귀 요청", 전체 링크 "협업 담당자 권한"). 나머지 세 항목(VOC prefill, VOC 상세 view, 계약 버전)은 에이전트가 #81 권고대로 정했고 사용자가 같은 메시지에서 보고받았다.

#81은 phase-1 딥링크(#61)를 넓히려면 FeedbackOps 쪽 결정이 필요한 항목을 모은 이슈였다. 이슈를 쓴 뒤 FeedbackOps가 바뀌었다(서브모듈 `dc7638f`, 원본 develop에서 확인): VOC(`/vocs`)·Task(`/tasks`)·설문(`/surveys`) 목록이 모두 `managedSystem` 검색 키를 받고(Task·설문은 uuid 또는 `all`), 공개 설문 링크 ADR-0036은 Rejected(2026-10-13)이며 응답자는 AD 인증 내부 사용자다. FeedbackOps의 `returnTo`는 생겼지만 같은 앱 안 경로 세 개(`/home`·`/integration`·`/integration/coverage`)만 받는다. VOC 생성은 여전히 `managedSystem` 외의 미리 채움 키가 없다.

## 결정

- **매핑은 앱 조립 계층의 정적 표.** `apps/platform-web`이 업무 공간 id → Managed System uuid 표를 공급한다. 공간 하나에 시스템 하나. 행이 없거나 값이 uuid가 아니면 그 공간의 FeedbackOps 진입을 그리지 않는다 — 범위 없는 URL로 바꾸지 않고, Site·설비 id로 추정하지 않는다. Kernel·셸은 표의 원천을 모르고 앱이 주입한 값만 쓴다.
- **설문 진입은 목록과 상세까지.** 공간에서 `/surveys?managedSystem=<uuid>`(목록)와 기존 `survey-detail`만 연다. 참여 목록(`/surveys/participate`)과 응답 폼(`/surveys/$surveyId/respond`)으로는 링크하지 않는다 — 응답은 FeedbackOps 안에서 한다.
- **복귀는 FeedbackOps에 요청한다.** 플랫폼 → FeedbackOps는 계속 새 탭이고 플랫폼 탭은 그대로 남는다. FeedbackOps → 플랫폼 복귀(외부 origin allowlist + 새 복귀 파라미터)를 FeedbackOps 원본 저장소 이슈로 요청한다. 그쪽이 키와 허용 규칙을 공개하기 전에는 플랫폼이 FeedbackOps URL에 `returnTo`나 복귀용 키를 넣지 않는다.
- **범위 없는 "FeedbackOps 전체" 진입은 전용 권한.** 플랫폼에 명시적 권한(이름은 #251에서 `PERMISSIONS`에 더함, 예: `feedbackops:access`)을 두고 그 권한이 있는 사용자에게만 보인다. `console:access`로 대체하지 않는다. 보인 뒤 무엇을 볼 수 있는지는 FeedbackOps가 판정한다.
- **VOC 생성 미리 채움은 `managedSystem`만.** 기간·설비는 FeedbackOps가 키 이름과 저장 위치(설명 vs entity link)를 정하기 전까지 보내지 않는다.
- **VOC 상세 view는 `inbox`, 계약 버전은 문서의 `contract: 1`.** FeedbackOps strict 스키마가 `fo`를 받기 전에는 URL에 넣지 않는다.

## Considered Options

- **매핑 — 공간당 여러 시스템:** 한 공간이 여러 Managed System을 덮을 수 있지만, 진입마다 `all`이나 선택 UI가 필요해 #251 범위가 커진다. 실제 요구가 생기면 표의 값을 배열로 넓힌다.
- **매핑 — FeedbackOps API에서 조회:** 원천이 하나가 되지만 세션 공유(#150)가 먼저 있어야 하고, 플랫폼 화면이 FeedbackOps 가용성에 묶인다.
- **설문 — 참여 화면도 링크:** 응답까지 한 번에 가지만, 참여 경로의 검색 키를 확인해야 하고 플랫폼이 FeedbackOps의 응답 흐름을 진입점으로 고정하게 된다.
- **복귀 — 새 탭만, 요청 안 함:** 외부 작업이 없지만 FeedbackOps에서 작업을 마친 사용자가 원래 분석 화면으로 돌아갈 길이 탭 전환뿐이다. 사용자는 요청 쪽을 골랐다.
- **전체 진입 — 모든 로그인 사용자 / 진입 없음:** 전자는 권한 없는 사용자가 빈 화면이나 거부 화면을 보고, 후자는 여러 시스템을 함께 보는 담당자의 진입이 사라진다.

## 결과

- #81을 닫는다. #251의 Blocking 중 매핑·전체 링크 권한이 풀린다. 세션 공유(#150)는 여전히 남는다(그전에는 FeedbackOps 로그인이 한 번 더 있을 수 있음).
- [딥링크 문서](../integration/feedbackops-deeplink.md) §1·§5를 이 결정에 맞춘다. 새 목록 대상과 전체 진입 대상, 권한 키는 #251이 계약·코드와 함께 더한다.
- FeedbackOps 복귀 요청은 [FeedbackOps#1278](https://github.com/hjung3113/FeedbackOps/issues/1278)이다. 그쪽이 공개하면 딥링크 문서 §2·§4 절차로 allowlist에 더한다.
- ADR-0042의 "본문 맨 위 `← <출발 메뉴>로 돌아가기` 줄"은 FeedbackOps를 셸 안에서 열 때(ADR-0038)의 복귀이고, 이 결정은 독립 앱(새 탭) 기준이다. 둘은 겹치지 않는다.
