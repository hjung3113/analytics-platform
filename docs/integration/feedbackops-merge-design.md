# FeedbackOps 합류 설계 — 전역 기능 + 피드백 운영 업무 시스템, 서버는 FeedbackOps 백엔드에서 출발

> 상태: 방향은 **Decided**([ADR-0066](../adr/0066-feedbackops-merges-into-platform.md), 사용자 2026-10-21). 이 문서의 배치표·단계·서버 대응표는 **Candidate**, §7은 **Open**이다. 지도 [#598](https://github.com/hjung3113/analytics-platform/issues/598), 마일스톤 `M6 FeedbackOps 합류`.
>
> 이 문서는 [플랫폼 탑재 설계](platform-hosting-design.md)의 FeedbackOps 부분(한 원본·두 호스트)을 대체한다. 그 문서의 호스트 → 모듈 계약은 equipment-visualization과 사내 새 앱을 위해 유효하다([ADR-0053](../adr/0053-host-module-contract-v1.md)).

## 1. 목표와 범위

FeedbackOps를 플랫폼 앱 하나·서버 하나·저장소 하나로 합친다. 사용자는 플랫폼 셸 안에서 VOC를 남기고 설문에 답하고, 관리자·개발자는 같은 셸의 업무 시스템에서 Triage → Finding → Task 흐름을 다룬다. 독립 FeedbackOps 앱은 합류가 끝나면 은퇴한다.

범위 밖: FeedbackOps 도메인 규칙 변경, 화면 재설계. 옮긴 뒤 화면 모양이 바뀌는 부분(셸 배치, 전역 진입)만 시안 컨펌을 받는다.

## 2. 원칙

1. **화면은 보는 사람 기준으로 나누고, 데이터 주인은 나누지 않는다.** 전역 기능 화면도 FeedbackOps 도메인 API를 쓴다. 플랫폼이 VOC·설문 응답을 따로 저장하지 않는다.
2. **화면은 옮기고 다시 쓰지 않는다.** FeedbackOps 화면 코드를 Kernel 라우팅·Registry에 맞춰 옮긴다. 화면 단위 동작·문구·권한 표시는 FeedbackOps 기준을 유지한다.
3. **FeedbackOps 도메인 불변식은 그대로 간다**(원본: `products/feedbackops/GLOSSARY.md`, 합류 뒤에는 옮긴 위치):
   - VOC는 인증된 사내 사용자가 남긴 목소리다. 설문 응답에서 VOC를 만들지 않는다.
   - Triage·신고자 표시·Task 상태 기계 셋은 서로 자동 매핑하지 않는다(FeedbackOps ADR-0005).
   - 시스템 간 이력의 원본은 `entity_links`다.
   - Task Request가 검토 전 실행 후보로부터 Task 백로그를 지킨다.
   - 대시보드는 차트 보고가 아니라 액션 큐다.
4. **서버 계약은 SDK, 구현은 FeedbackOps 백엔드에서 출발**([ADR-0043](../adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md)의 "서버는 계약만"을 유지).

## 3. 기능 배치 (Candidate)

### 3.1 플랫폼 전역 기능 — 모든 사용자

공간 밖 전역 유틸리티 자리([ADR-0028](../adr/0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md))에 둔다. 이슈 [#594](https://github.com/hjung3113/analytics-platform/issues/594).

| 기능 | 지금 FeedbackOps | 플랫폼에서 |
| --- | --- | --- |
| VOC 등록 | `/vocs` 생성 폼 | 어느 화면에서든 열린다. 지금 메뉴·Context를 VOC에 붙인다(Analytics Area·Managed System 기본값). |
| 내 VOC·신고자 VOC 상세 | `/vocs` 내 VOC 탭·상세 | 전역 `내 VOC`(1단계 읽기 화면 대체, M3 #84–#86) |
| 설문 참여·응답 | `/surveys/participate`, `/surveys/$id/respond` | 전역 `설문 참여` |
| 알림함 | 알림 모듈(신고자 알림, Slice 65) | 셸 알림 진입. VOC 상태 변경·권한 결정·설문 요청 |
| 권한 요청 | 요청 대화상자·`requestable_permission` 오류 | 전역 요청·철회·내 요청 상태. 승인 쪽은 §3.3 |
| 내 활동 | (없음) | 내 VOC·내 권한 요청·설문 참여를 한 화면에 |
| 공지 | (없음) | 이미 플랫폼 전역 |

### 3.2 `피드백 운영` 업무 시스템 — 관리자·개발자

시스템 전환기의 업무 시스템 하나([ADR-0042](../adr/0042-system-switcher-and-system-owned-rail.md)). 레일 섹션과 메뉴는 지금 FeedbackOps 레일·사이드바(`NAV_TREE`)를 출발점으로 한다. 이슈 [#595](https://github.com/hjung3113/analytics-platform/issues/595).

| 레일 섹션(Candidate) | 메뉴 | 지금 FeedbackOps 경로 |
| --- | --- | --- |
| VOC | 수신함·Triage·저장된 보기·VOC Cluster | `/vocs`, `/voc-clusters` |
| Findings | Finding 목록·상세 | `/findings` |
| Tasks | Task Request·Task·내 Task·Milestone | `/tasks` |
| 연동 | Evidence·Links·Coverage | `/integration/*` |
| 설문 | 설문 관리(빌더·결과·후속 조치) | `/surveys`, `/surveys/$id/results`, `/follow-up` |
| 홈 | 대시보드(액션 큐) | `/home` |
| 설정 | 피드백 운영 설정 | `/admin/settings` |

다른 업무 공간 사이드바의 FeedbackOps 블록([ADR-0045](../adr/0045-feedbackops-entry-link-mapping-and-scope.md))은 새 탭 링크에서 셸 안 이동 + 업무 시스템 미리 채움 + 복귀로 바뀐다.

### 3.3 권한·레지스트리 관리 — 결정 대기

[#596](https://github.com/hjung3113/analytics-platform/issues/596)(ready-for-human) 답에 따라 정한다. 후보: 권한 요청 승인·부여/거부 목록·Managed System 레지스트리는 운영 콘솔로, Analytics Area 관리는 메뉴 Registry에서 파생(Analytics Area의 정의가 "관리되는 분석 메뉴 맥락"이므로). 답 전에는 FeedbackOps `/admin/*` 화면을 피드백 운영 시스템 안에 그대로 옮긴다.

## 4. 서버 출발점 (Candidate)

플랫폼 앱은 서버를 `PlatformAdapter` 하나로 만난다([실서버 체크리스트](real-server-checklist.md) §1). 실어댑터 조립(#154)이 FeedbackOps 백엔드를 가리키게 하고, 백엔드가 [HTTP 어댑터 계약](http-adapter-contract.md)의 공통 부분을 구현한다. 이슈 [#593](https://github.com/hjung3113/analytics-platform/issues/593).

| 포트 메서드 | FeedbackOps 백엔드의 출발점 | 상태 |
| --- | --- | --- |
| `session()`·`subscribe` | `modules/auth`(AuthProvider mock + OIDC, 서버 세션, FeedbackOps ADR-0006) | 구조 있음. 운영 IdP 값은 #150 |
| `accessDirectory` | `modules/permissions`(역할 수준·부여·거부·요청) | 구조 있음. 플랫폼 권한 모양 맞춤은 #596 |
| `auditTrail`·`entityAudit` | `core.audit_log`(FeedbackOps ADR-0008, 변경과 같은 트랜잭션, append-only) | 저장 있음. 플랫폼 엔티티 감사 추가 |
| `getEntity` | VOC·Finding·Task 모듈 | FeedbackOps 엔티티 type만. 설비·지표 type은 §7 O4 |
| `recordUsage`·`usageSummary` | 없음 | 새로 만든다 |
| 공지 | 없음 | 새로 만든다 |
| `validateScope`·`publishedMetrics`·`contextOptions`·`evaluateSelection`·`menuQuery`·`menuAction`·축/설비 조회 | 없음(분석 데이터) | §7 O4 |

운영 안전 규칙(Postgres 기반 rate limit, CSP, `Idempotency-Key`, SQL 마이그레이션 — FeedbackOps ADR-0015)과 배경 작업(pg-boss, FeedbackOps ADR-0009)은 그대로 쓴다. 배포 모양(사내 k8s의 Docker, FeedbackOps ADR-0013)은 #151 답으로 확인한다.

## 5. 권한·업무 시스템 통합 (Candidate, 결정은 #596)

- 플랫폼이 소유: 신원(세션), 역할, 업무 시스템별 부여·거부, 요청·승인 화면, 감사.
- FeedbackOps가 소유: 도메인 판정("이 VOC를 Triage할 수 있나", "이 Task를 바꿀 수 있나"). 플랫폼 부여를 읽어서 판정하고, 판정 결과의 감사는 같은 감사 저장소에 남긴다.
- Managed System은 FeedbackOps의 범위·필터·기본값·Developer 권한 맥락이다. 플랫폼 업무 시스템과의 관계(1:1로 한 레지스트리, 또는 업무 시스템 아래 여럿)는 #596 질문 1.
- 플랫폼 화면은 권한을 표시만 한다. 판정의 원본은 서버다(06 §17, FeedbackOps 경계 규칙과 같음).

## 6. 단계 (Candidate)

| 단계 | 내용 | 이슈 | 선행 |
| --- | --- | --- | --- |
| 0 | 결정·설계 기록(이 문서, ADR-0066, FeedbackOps ADR-0072) | — | — |
| 1 | 저장소 합류: 코드를 workspace로, 도구(Node 26.7·pnpm 11·turbo)·게이트·CI·지침 합치기. 독립 앱은 그대로 동작 | [#592](https://github.com/hjung3113/analytics-platform/issues/592) | 0 |
| 2 | 실서버 출발점: §4 공통 부분, 실어댑터 조립 | [#593](https://github.com/hjung3113/analytics-platform/issues/593) | 1 |
| 3 | 전역 기능 화면(§3.1) — 시안 컨펌 먼저 | [#594](https://github.com/hjung3113/analytics-platform/issues/594) | 1, 2 |
| 4 | 피드백 운영 업무 시스템(§3.2) — 시안 컨펌 먼저 | [#595](https://github.com/hjung3113/analytics-platform/issues/595) | 1, 2 |
| — | 권한·업무 시스템 통합 결정(§5) | [#596](https://github.com/hjung3113/analytics-platform/issues/596) | 사용자 답, #98 |
| 5 | 독립 앱 은퇴: 옛 URL 리다이렉트, 링크 계약 정리, FeedbackOps 저장소 보관 | [#597](https://github.com/hjung3113/analytics-platform/issues/597) | 3, 4, #151 |

사내 확인(#150 SSO, #151 배포·인프라)은 단계와 병행한다. 운영 배포의 선행 조건이지만 단계 1–4는 mock 인증과 throwaway DB로 진행한다. 첫 사내 사용은 SSO 답을 기다리지 않고 Keycloak(사내 이메일 도메인 가입·이메일 인증)을 OIDC IdP로 두고 연다. 사내 로그인은 Windows 로그인 정보로 연동된다(사용자 관찰 → Active Directory)라서, 답이 오면 Keycloak을 Entra ID·AD FS로 위임하거나 AD에 LDAP·Kerberos로 연동한다. IdP가 바뀌면 `sub`이 바뀌므로 전환 때 인증된 email로 기존 Actor를 한 번 연결한다 — [#603](https://github.com/hjung3113/analytics-platform/issues/603).

## 7. Open

| ID | 질문 | 영향 |
| --- | --- | --- |
| O2 | 역할 모델 통합과 역할 소속 원천 | #596 질문 2, #98(IdP 그룹 claim, #150) |
| O3 | Managed System ↔ 업무 시스템 관계 | #596 질문 1, 공간 → Managed System 매핑(ADR-0045) |
| O4 | 분석 메뉴 데이터 엔드포인트를 같은 서버에 두나, 사내 별도 서버로 두나 | #593 범위 밖. 데이터 원천은 `context_recognized_parser` 적재 DB |
| O5 | 라우팅 이전: TanStack Router 화면을 Kernel Registry·`PlatformLocation`으로. 잘못된 search 값 처리(FeedbackOps는 버림, 플랫폼은 거부·보존) | #594·#595 |
| O6 | FeedbackOps git 이력 보존 방식(subtree 병합 권장) | #592 |
| O7 | 업무 시스템 이름(`피드백 운영` Candidate) | #595 시안 |
| O8 | 린터(Biome·ESLint)·테스트 설정·비주얼 하니스(darwin 전용)·백엔드 통합 테스트 DB를 이 저장소 CI에 넣는 방식 | #592 |

## 8. 전환 기간

- 독립 FeedbackOps(v1.3.0)에는 실제 사내 사용자가 없다(사용자 2026-10-21). 사내 사용은 플랫폼으로 시작하므로 병행 운영 기간을 두지 않고, 단계 5는 플랫폼 첫 배포와 함께 한다.

- 독립 FeedbackOps는 유지 보수만 한다: 버그 수정과 합류 준비. 새 기능은 플랫폼 쪽에서 만든다(FeedbackOps ADR-0072).
- 독립 앱 안에서만 의미가 있는 개선(신고자에게 운영 메뉴 숨기기, 신고자 홈)은 하지 않는다. 신고자는 플랫폼 전역 기능만 쓰게 되므로 문제가 구조상 사라진다. 독립 앱에 실제 신고자가 생기면 다시 연다.
- 단계 4가 끝날 때까지 진입 링크(ADR-0045)와 복귀 키(`platformReturn`, FeedbackOps ADR-0071)를 그대로 쓴다.
