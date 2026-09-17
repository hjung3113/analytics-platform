# AGENTS.md — analytics-platform

## 프로젝트 목적 (읽기 전 반드시 확인)

이 레포의 목적은 "설비관리·기준정보관리·생산성 분석·지표관리·공지·VOC 같은 메뉴들을 전부 만드는 것"이 아니다.

**목적은 그 메뉴들을 계속 얹어갈 수 있는 플랫폼 자체(Platform Kernel + Menu Registry + 전역 Context + 딥링크/URL 계약 + 권한·Scope + Audit 같은 플랫폼 공통 기능)를 만드는 것이다.**

이 원칙의 authoritative 버전은 **`docs/06_platform_ui_contract.md`**다(Platform Kernel 책임 범위, Menu Extension Contract, Platform-first Definition of Done, Governance 체크리스트까지 상세히 정의돼 있음). 아래는 에이전트가 매번 그 문서를 열지 않아도 되게 하는 요약이다 — 상세·최신 버전은 항상 `docs/06_platform_ui_contract.md`를 우선한다.

### 이게 실무에 미치는 영향

- 새 화면/메뉴를 설계·구현할 때, "Domain Done"(그 화면 요구사항이 동작하는가)보다 먼저 "Platform Done"(공통 계약 위에 올라가 있는가, 다른 메뉴와 Context가 연결되는가, 권한/Scope가 일관되는가)을 검증한다 — `docs/06_platform_ui_contract.md` §29.
- 화면별로 반복되는 패턴을 발견하면 그 화면에 국한해서 구현하지 말고 플랫폼 공통 컴포넌트/계약으로 추출할지 먼저 판단한다. 단, 실제 메뉴 2~3개에서 반복이 확인되기 전에 범용 프레임워크를 미리 만들지 않는다(Premature Platformization 금지, §24).
- 메뉴 개수를 늘리는 작업보다 Platform Kernel(App Shell·Menu Registry·전역 Context·딥링크 계약)의 완성도를 우선한다 — `docs/05_roadmap_and_open_questions.md`의 구현 순서가 이 우선순위를 반영한 것이다.
- 개별 메뉴 요구사항이 플랫폼 공통 계약(1급 딥링크 키, wall-clock 시간 계약, URL 보안 경계 원칙 등)과 충돌하면 개별 메뉴 쪽을 공통 계약에 맞추는 게 기본값이고, 공통 계약을 바꿔야 한다면 그건 플랫폼 레벨 결정으로 격상해서 다룬다.

## 문서

`docs/INDEX.md`부터 시작. 역할별 진입점이 표로 정리돼 있다. 플랫폼/프론트엔드 작업은 `docs/06_platform_ui_contract.md`를 먼저 본다.

## 화면/UI 설계

새 화면이나 UI 작업은 `.agents/skills/analysis-platform-wireframe/SKILL.md`부터 읽는다. 현재 설계 단계는 Requirements → IA → Conceptual Contract / Screen Spec → Wireframe → Open Decisions에서 완료할 수 있다. Design System / Prototype / Visual Polish는 별도 구현 요청이 있을 때만 진행한다.

## 공통 에이전트 자산

- 지침 원본은 이 `AGENTS.md`다. `CLAUDE.md`는 이 파일을 가리키는 상대 심링크다.
- 스킬·명령·외부 디자인 참고자료 원본은 `.agents/skills`, `.agents/commands`, `.agents/references`다. 에이전트별 경로의 심링크 대신 원본을 편집한다.
- 모든 에이전트는 필요한 `SKILL.md`만 읽고, 도구 이름은 현재 세션에서 제공되는 동등 도구로 대응한다. 없는 도구·비밀키·외부 서비스는 사용할 수 있다고 가정하지 않는다.
- 탐색 경로와 실행 방법은 `.agents/README.md`를 참조한다. 외부 디자인 참고자료와 범용 스킬은 제품 계약을 덮어쓰지 않는다.
