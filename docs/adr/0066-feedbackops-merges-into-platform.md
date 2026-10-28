# ADR-0066 — FeedbackOps를 플랫폼에 합친다: 모두가 쓰는 기능은 플랫폼 전역, 운영 화면은 업무 시스템 하나, 서버는 FeedbackOps 백엔드에서 출발

- Status: Decided (2026-10-21) — 방향. 세부 계약은 [합류 설계](../integration/feedbackops-merge-design.md)(Candidate)와 그 Open 항목.
- Decider: 사용자 — "플랫폼으로 들어갈 기능은 VOC, 공지, 권한 관리(이건 이제 플랫폼 내부 시스템 단위까지 확장), 설문 … 관리자나 개발자만 보면 되는 메뉴들은 별도 시스템으로 플랫폼에 추가", "플랫폼에 합치고 한번에 하는 게 오히려 빠른 길 아닌가", "방향 자체는 동의함"(2026-10-21).
- Supersedes: [ADR-0027](0027-feedbackops-stays-standalone-entry-links.md)(화면은 옮기지 않고 링크만), [ADR-0038](0038-host-module-contract-and-feedbackops-mounting.md)(한 원본·두 호스트, Proposed였음). [ADR-0045](0045-feedbackops-entry-link-mapping-and-scope.md)의 진입 링크는 합류 단계 4까지 그대로 쓴다.
- Amended (2026-10-23, [ADR-0073](0073-feedbackops-backend-tests-may-import-conformance-and-http-adapter.md)): FeedbackOps가 받는 플랫폼 패키지는 `@ap/ui` 하나라는 합류 경계에 예외 하나를 둔다. FeedbackOps 백엔드 테스트 코드는 `@ap/server-conformance`·`@ap/http-adapter`를 devDependencies로 import할 수 있다. 런타임 코드는 그대로 `@ap/ui`만 쓰고, 이를 검사로 막는다.
- Amended (2026-10-28, [ADR-0095](0095-dual-backend-fastify-core-fastapi-analytics.md)): 결정 6에 서버가 둘이라는 내용을 더한다. 코어(Fastify)와 그 뒤에만 있는 분석 데이터 서버(FastAPI)다. 입구·인증·권한·감사는 코어 하나이고 분담은 ADR-0095가 소유한다.
- Scope: 지도 [#598](https://github.com/hjung3113/analytics-platform/issues/598), 마일스톤 `M6 FeedbackOps 합류`. FeedbackOps 쪽 기록은 FO ADR-0072.

## 맥락

ADR-0027은 FeedbackOps를 독립 앱으로 두고 업무 공간에서 새 탭 링크로 들어가게 했다. ADR-0038은 화면을 모듈 패키지로 만들어 독립 앱과 플랫폼 셸 두 호스트에 올리자고 제안했다. 두 안 모두 사용자가 앱 둘을 오가거나(새 탭, 세션 공유 전에는 로그인 둘), FeedbackOps가 독립 호스트와 플랫폼 호스트를 함께 유지해야 한다.

그 사이 상황이 바뀌었다.

- 플랫폼은 프론트엔드만 있고 서버는 mock이다. 실서버 설계(#150 본문)는 FO ADR-0006 방식(AuthProvider 추상화, 서버 세션, 매 요청 권한 재검증)을 그대로 따른다. 그 방식은 FeedbackOps 백엔드에 이미 구현돼 있고, 권한·감사·알림·배경 작업도 함께 있다.
- 플랫폼 SDK가 디자인 시스템과 앱 계약의 원본이 됐고(ADR-0043·0046), FeedbackOps 화면은 이미 `@ap/ui`를 쓴다.
- 독립 실행은 SDK 책임이 아니다(ADR-0043). 독립 호스트를 계속 두면 그 비용은 FeedbackOps가 혼자 진다.
- 사내 SSO(#150)와 배포·인프라(#151)는 사내 답을 기다리는 확인 항목이다. 저장소를 합쳐도 이 답이 빨라지지는 않지만, 합치지 않으면 같은 답을 두 앱에 따로 적용해야 한다.

## 결정

1. **FeedbackOps는 플랫폼의 일부가 된다.** 독립 앱으로 남지 않는다. 코드는 이 저장소의 workspace로 옮기고, 플랫폼 셸이 유일한 호스트다. 독립 FeedbackOps 앱은 합류가 끝나면 은퇴한다.
2. **모든 사용자가 쓰는 기능은 플랫폼 전역 기능이다**(공간 밖, ADR-0028의 전역 유틸리티 자리): VOC 등록(어느 화면에서든, 지금 메뉴와 Context를 붙여)·내 VOC·신고자 VOC 상세, 설문 참여·응답, 알림함, 권한 요청, 내 활동, 공지(이미 전역). 화면 배치(플랫폼 메뉴·VOC 등록 드로어·설문 페이지·홈 순서)는 [ADR-0070](0070-global-features-platform-menu-and-voc-drawer.md).
3. **관리자·개발자만 쓰는 화면은 업무 시스템 하나로 올린다**(이름 Candidate `피드백 운영`, ADR-0042 시스템 전환기·시스템별 레일): 수신함·Triage·VOC Cluster, Evidence·Coverage·Links, Finding·Task Request·Task·Milestone, 대시보드(액션 큐), 설문 관리, 피드백 운영 설정.
4. **화면은 다시 쓰지 않고 옮긴다.** FeedbackOps 화면 코드를 Kernel 라우팅·Registry에 맞춰 옮긴다. ADR-0018 A안의 "플랫폼 메뉴로 재작성"이 아니다.
5. **화면은 보는 사람 기준으로 나누고, 데이터 주인은 나누지 않는다.** 전역 기능 화면도 FeedbackOps 백엔드의 같은 도메인 API를 쓴다. VOC·설문·Finding·Task의 저장소는 하나이고, 시스템 간 이력은 `entity_links`가 원본이며, VOC 상태 기계 셋은 서로 자동 매핑하지 않는다(FO ADR-0005). 설문 응답에서 VOC를 만들지 않는다.
6. **플랫폼 실서버는 FeedbackOps 백엔드에서 출발한다.** FeedbackOps 백엔드가 [HTTP 어댑터 계약](../integration/http-adapter-contract.md)의 플랫폼 공통 부분(세션·권한 조회·감사·활용률·공지·엔티티)을 구현하고, 플랫폼 앱의 실어댑터 조립(#154)이 그 서버를 쓴다. 서버는 계약만 SDK가 정한다는 원칙(ADR-0043, #531)은 그대로다 — FeedbackOps 백엔드는 그 계약의 첫 구현이다. **서버는 둘이다(ADR-0095, Decided):** 코어(Fastify)와 그 뒤에만 있는 분석 데이터 서버(FastAPI). 브라우저에 열리는 입구는 코어 하나다.
7. **권한 관리는 플랫폼 업무 시스템 단위까지 넓힌다.** 플랫폼이 신원·역할·시스템별 부여/거부·요청/승인을 소유하고, FeedbackOps 도메인 판정은 그 부여를 읽어서 한다. Managed System과 업무 시스템의 관계, 역할 모델, 관리 화면 귀속은 [#596](https://github.com/hjung3113/analytics-platform/issues/596)(ready-for-human)에서 정하고, 그 전까지 FeedbackOps 권한 모듈을 그대로 쓴다.
8. **독립 FeedbackOps는 합류 동안 유지 보수만 한다.** 버그 수정과 합류 준비만 하고 새 기능은 플랫폼 쪽에서 만든다.

## Considered Options

- **(A) ADR-0027 유지 — 독립 앱 + 진입 링크**: 지금 비용이 가장 적다. 앱 둘·로그인 둘·Context 단절이 남고, 플랫폼 1단계 읽기 화면(내 VOC·설문 이력)은 원본과 갈라진다.
- **(B) ADR-0038 — 한 원본·두 호스트**: 화면 원본은 하나지만 독립 호스트와 저장소 사이 계약(호스트 포트·SDK tarball 버전 맞추기)을 FeedbackOps가 계속 유지한다. 플랫폼 서버는 따로 만들어야 한다.
- **(C) ADR-0018 A안 — 플랫폼 메뉴로 재작성**: 화면이 두 벌이 되고 4–8주 재작성(2026-09-26 추정)이 든다. ADR-0027이 기각했다.
- **(D, 채택) 합류 — 한 저장소·한 앱·한 서버**: 저장소 간 계약과 독립 호스트가 필요 없고 실서버를 두 번 만들지 않는다. 대신 도구 정렬(Node·pnpm·린터·게이트), 라우팅 이전, 권한 모델 통합 비용을 진다. 플랫폼 배포 전까지 독립 FeedbackOps를 유지 보수해야 한다.

## 결과

- 단계와 Open 항목은 [합류 설계](../integration/feedbackops-merge-design.md) §6·§7이 소유한다. 단계 이슈: [#592](https://github.com/hjung3113/analytics-platform/issues/592) 저장소, [#593](https://github.com/hjung3113/analytics-platform/issues/593) 실서버, [#594](https://github.com/hjung3113/analytics-platform/issues/594) 전역 기능, [#595](https://github.com/hjung3113/analytics-platform/issues/595) 피드백 운영 시스템, [#596](https://github.com/hjung3113/analytics-platform/issues/596) 권한 결정, [#597](https://github.com/hjung3113/analytics-platform/issues/597) 독립 앱 은퇴.
- M5 FeedbackOps 2단계(지도 #213)는 이 결정으로 대체된다. M3의 1단계 읽기 화면 이슈(#84–#86)는 #594에 흡수된다.
- 호스트 → 모듈 계약(ADR-0053, #402)은 equipment-visualization과 사내 새 앱을 위해 그대로 둔다. FeedbackOps는 그 계약의 소비자가 아니다.
- 화면 모양이 바뀌는 단계(#594·#595)는 루트 AGENTS의 `?variant=` 시안 컨펌을 먼저 받는다.
- 운영 배포는 #150·#151 답 뒤다. 단계 1–4는 mock 인증과 throwaway DB로 진행할 수 있다.
