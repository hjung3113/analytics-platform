# ADR-0069 — 플랫폼 포트는 FeedbackOps 백엔드의 `/api/v1/platform` 모듈로 두고, 그 접두사에만 플랫폼 전송 규약을 적용한다

- Status: Decided (2026-10-22) — 코디네이터 결정. 사용자가 합류 진행을 위임했다. 되돌릴 수 있다.
- Amended (2026-10-22, #623): 결정 9의 "provider `canRead`"를 "소유 모듈의 상세 읽기 판정(`resolveVocReference`·`getFinding`·`getTask`)"으로, 결정 6의 `entityAudit` 게이트도 같은 판정으로 바꿨다. `entityAudit`의 type은 voc·finding·task 셋으로 좁혔다.
- Scope: [#593](https://github.com/hjung3113/analytics-platform/issues/593)과 단위 이슈 [#620](https://github.com/hjung3113/analytics-platform/issues/620)–[#623](https://github.com/hjung3113/analytics-platform/issues/623). [합류 설계](../integration/feedbackops-merge-design.md) §4·§7의 O9·O10·O11·O13·O14·O16·O19·O20을 닫는다.
- 바탕: [ADR-0066](0066-feedbackops-merges-into-platform.md) 결정 6(실서버는 FeedbackOps 백엔드에서 출발), [ADR-0068](0068-permission-scope-and-business-system-link.md)(부여 체계 하나, `console:access`는 승인 권한이 아님), [HTTP 어댑터 계약](../integration/http-adapter-contract.md)(Candidate).

## 맥락

플랫폼 앱은 서버를 `PlatformAdapter` 하나로 만난다. 그 HTTP 전송 형식은 FastAPI 사내 백엔드를 가정한 초안이다. 실제 출발점인 FeedbackOps 백엔드는 Fastify 5 + zod이고 규약이 다르다.

| | FeedbackOps(FO ADR-0012) | 플랫폼 계약 |
| --- | --- | --- |
| 상태 코드 | 4xx로 실패를 알린다 | 판정 결과를 200 + `outcome` envelope로 준다 |
| 필드 이름 | snake_case | camelCase |
| CSRF | SameSite + JSON 강제 | `X-CSRF-Token` |

한 서버에서 두 규약을 어떻게 나눌지가 먼저 정해져야 #593을 작업 단위로 나눌 수 있다.

## 결정

1. **위치와 경계.**
   - 플랫폼 포트는 FeedbackOps 백엔드의 새 모듈 `platform-port`(`apps/backend/src/modules/platform-port`)에 둔다. Fastify 플러그인으로 `/api/v1/platform` 아래에 등록한다.
   - 이 모듈은 다른 모듈의 application service와 읽기 경계(provider, definer 함수)를 부르기만 한다. 다른 모듈의 표에 쓰지 않는다(FO 경계 규칙). 단, 자기 표(활용률, 클라이언트 오류, 차트 주석)는 직접 쓴다.
2. **규약은 접두사로 나눈다(O12 일부).**
   - `/api/v1/platform/**`에는 플랫폼 전송 규약만 적용한다.
     - camelCase, 판정 결과는 200 + envelope, fire-and-forget 메서드의 거부는 200 + `accepted: 0/false`.
     - 모든 응답에 `Cache-Control: no-store`.
     - 잘못된 요청 모양은 envelope 메서드면 200 + `error`, 아니면 계약 §2대로 처리한다.
     - 오류 처리기는 이 플러그인 범위에만 건다.
   - 기존 FeedbackOps 경로는 FO ADR-0012 규약을 그대로 쓴다.
   - 계약 문서의 FastAPI 가정을 고치는 일(O12의 나머지)은 #620에서 계약 문서를 고쳐 처리한다.
3. **FeedbackOps 도메인 API의 접두사(O13)는 지금 바꾸지 않는다.**
   - `/vocs` 같은 경로는 독립 앱의 dev proxy가 Accept 헤더로 화면 경로와 구분하고 있어서 지금은 동작한다.
   - 화면을 플랫폼 셸로 옮기는 #594·#595에서 `/api/fo/**`로 옮긴다.
   - **구현하지 않음.** 다시 볼 조건: #594 착수.
4. **CSRF(O14).**
   - 세션에 묶인 토큰을 `bootstrap`이 `csrfToken`으로 준다. 세션이 바뀌면 토큰도 바뀐다.
   - `/api/v1/platform`의 상태를 바꾸는 POST는 `X-CSRF-Token`을 요구한다. 대상은 `recordUsage`·`reportClientError`·주석 저장과 삭제·`menuAction`이다.
   - 읽기 POST(`*/search`·`entity`)는 JSON Content-Type 강제만 둔다(계약 §6).
   - 기존 FeedbackOps 경로는 지금 규약 그대로 두고, #594에서 다시 본다.
5. **Correlation ID(O20).**
   - 요청 헤더 `X-Correlation-Id`가 `^[A-Za-z0-9._-]{1,128}$`에 맞으면 그 값을 Fastify `reqId`로 쓴다. 맞지 않거나 없으면 서버가 만든다.
   - 모든 응답 헤더와 플랫폼 envelope `correlationId`에 같은 값을 싣는다.
   - 로그 필드 `request_id`(FO ADR-0013)도 같은 값이다. 이 규칙은 서버 전체에 적용한다. 로그와 화면을 한 id로 잇기 위해서다.
6. **감사 노출 범위(O16).**
   - 감사 읽기는 SECURITY DEFINER 투영 함수로만 한다. 앱 DB role에 `core.audit_log` SELECT를 주지 않는다(FO migration 0064 경계를 유지).
   - 투영은 `AuditEvent` 필드(시각, 행위자 표시, `AuditAction`, 대상 ref, 요약)만 낸다. 사유 원문, 개인 설문 응답, sensitive 상세는 내지 않는다.
   - 전역 `auditTrail`은 `console:access`가 있어야 하고, 단건 `entityAudit`은 `getEntity`와 같은 게이트(결정 9: 소유 모듈의 상세 읽기 판정)를 통과해야 한다. provider `canRead`는 FeedbackOps 상세 엔드포인트보다 느슨해서(Finding·Task가 상위 역할을 요구하지 않고 Task는 `finding.read`만 본다) 포트가 상세 엔드포인트가 거절하는 것을 내주게 되기 때문이다.
   - `console:access`로 FeedbackOps 감사 상세가 열리지 않는다(ADR-0068 결정 3).
7. **권한 이름 대응(O9).** FeedbackOps 판정 결과에서 플랫폼 `PERMISSIONS`를 계산한다. 표 하나로 두고, 계약 테스트로 `PERMISSIONS` 전체가 표에 있는지 확인한다(ADR-0068 결정 2의 "어휘 원천 하나").

   | 플랫폼 권한 | 부여 조건(FeedbackOps) |
   | --- | --- |
   | `platform:view`, `notice:view`, `voc:view` | 로그인한 모든 Actor(`workspace.read`) |
   | `feedbackops:access` | Role Level `developer` 이상, 또는 `voc.triage`·`finding.read`·`survey.manage` 중 하나라도 유효 |
   | `console:access` | `workspace.admin` 유효. 승인 동작은 서버가 따로 다시 확인한다 |
   | `equipment:view`, `master:view`, `analytics:view`, `metrics:view` | 아직 주지 않는다. site·room 부여(ADR-0068 `scope_kind`의 `site`·`site_room`, #98)가 생길 때 그 부여에서 계산한다 |

8. **부트스트랩 임시 값(O10·O11).**
   - `scopes`는 site·room 부여가 생길 때까지 `[]`이다. 그래서 Scope가 필요한 분석 메뉴는 열리지 않는다.
   - `publishedMetrics`는 지표 원천(O4)이 생길 때까지 `[]`이다.
   - `defaultRangeTo`는 서버의 KST wall-clock 현재 시각을 분 단위로 내린 값이다(06 §6.3 형식).
   - 세 값 모두 **임시**다. 다시 볼 조건: O4 분석 데이터 서버 결정, #98.
9. **FeedbackOps 엔티티의 `getEntity`(O19).**
   - VOC·Finding·Task를 `scopeId: null` type으로 받고, Managed System 판정은 서버 안에서 소유 모듈의 상세 읽기 판정(VOC `resolveVocReference`, Finding `getFinding`, Task `getTask`)으로 한다. provider `canRead`는 쓰지 않는다 — FeedbackOps 상세 엔드포인트보다 느슨해서 포트가 그 엔드포인트가 거절하는 것을 내주게 된다. `getEntity`는 type이 `voc`·`finding`·`task`뿐이고(`voc_cluster`·`task_request`는 `error`), 읽을 수 있으면 식별자·제목·상태 필드만 낸다.
   - 볼 수 없는 행과 없는 행은 둘 다 `forbidden`으로 답한다. 행이 있는지 드러내지 않기 위해서다. VOC의 지금 규칙에 맞춘 것이고, Finding의 404/403 차이는 이 포트에서 따르지 않는다.
   - `empty`는 type이 등록돼 있고 볼 수 있는 상태인데 결과가 비어 있을 때만 쓴다.

## Considered Options

- **FeedbackOps 전 경로를 플랫폼 규약으로 바꾼다:** 독립 앱 화면 전체와 FO ADR-0012 테스트를 지금 고쳐야 한다. 화면을 옮기는 #594 전에는 얻는 것이 없다.
- **플랫폼 포트를 별도 서버(프로세스)로 둔다:** 세션, 권한, 감사를 두 프로세스가 나눠 갖게 되고, ADR-0066 결정 6의 "서버 하나"와 맞지 않는다.
- **(채택) 한 서버, 접두사로 규약을 나눈다:** 규약이 섞이는 범위가 접두사 하나로 한정되고, #594에서 FeedbackOps 경로를 옮길 때 같은 방식을 쓸 수 있다.

## 결과

- [합류 설계](../integration/feedbackops-merge-design.md) §7의 O9·O10·O11·O13·O14·O16·O19·O20을 이 ADR로 닫고, O12는 일부 닫는다.
- 단위 이슈: #620 전송 기반·세션, #621 감사 읽기, #622 활용률·클라이언트 오류·주석, #623 accessDirectory·getEntity.
- 플랫폼 실어댑터 조립(#154)은 #620의 계약을 소비한다. 이 일은 플랫폼 세션의 영역(`apps/platform-web`)이다.
