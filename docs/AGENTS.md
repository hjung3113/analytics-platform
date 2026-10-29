# docs/ — 플랫폼 설계 문서

제품·플랫폼 계약의 원본. 코드보다 먼저 여기서 무엇이 결정됐는지 확인한다. 진입점은 [INDEX.md](INDEX.md)(작업별 읽기 경로). 남은 일·계획은 여기 두지 않고 [`.planning/`](../.planning/README.md)에 둔다.

## 소유권

- `contract/platform-ui-contract.md`(색인·전 갈래에 걸친 원칙·거버넌스·완료 정의와 「절 → 문서」 대응표)와 갈래별 `contract/{kernel,components,chart,layout,cross-menu-links}.md` — 전역 계약과 navigation IA. §번호는 문서가 나뉘어도 하나의 번호 체계이고, 다른 문서는 이를 소비한다.
- `architecture/` — `01` 데이터 계약·운영 정책, `03` 백엔드, `04` 프론트 기술 스택·검토. `product/` — `02` 도메인 catalog, `17` 플랫폼 요구사항. `overview/` — `00` 개요, `05` ADR 없는 계약 결정 목록. `wireframes/` — `07`–`13` 화면 설계(셸과 견본 메뉴의 계약 메모). `design/` — `14`–`16` 드릴다운·다중 워크스페이스·분석 보드 설계. 번호 약칭과 파일의 대응은 [INDEX.md](INDEX.md).
- `adr/` — 실제 대안 중에서 고른 결정과 그 이유. 목록·형식은 [adr/README.md](adr/README.md). 세부 규칙은 소유 문서에 두고 ADR은 링크한다.
- 플랫폼 ADR은 `ADR-NNNN`, historical feature ADR(`docs/adr/history/feedbackops/`)은 `FO ADR-NNNN`으로 쓴다. 두 번호 공간이 겹치므로 플랫폼 문서와 코드 주석에서 FeedbackOps ADR을 접두 없이 부르지 않는다.
- 다음 ADR 번호는 `bash tooling/scripts/next-adr.sh`로 확인한다. 현재 로컬 트리만 읽으므로 `origin/main`을 fetch해 비교하고 열린 브랜치·worktree도 별도로 확인한다.
- `integration/` — 저장소 구조, 패키지 경계, 서버·FeedbackOps 연결 계약.
- `agents/` — 이슈 트래커 설정과 에이전트 운영 메모.
- `research/`, `reviews/` — 아직 쓸모 있는 조사·근거 기록. authoritative source가 아니다.

## 규칙

- 상태 표기 Decided / Candidate / Open / Deferred를 지킨다. Open을 임의로 결정하지 않는다. 결정이 나면 원본 문서를 고치고, ADR이면 `adr/README.md` 표에, ADR이 아니면 `05` 표에 한 줄을 둔다. 답이 필요한 질문은 `.planning/`에 둔다.
- 계약 변경은 소유 문서 한 곳에서 하고, 다른 문서는 링크로 참조한다. 같은 규칙을 여러 문서에 복사하지 않는다.
- 문서와 코드가 어긋나면 어느 쪽이 맞는지 확인한 뒤 고친다. 문서 대조를 런타임 검증으로 보고하지 않는다.
- 과정 기록(작업자 보고, 리뷰 라운드, 인계 이력, "이전에는 …" 서술)은 문서에 남기지 않는다. git 이력과 이슈·PR이 대신한다.
- 문서를 바꾸면 `pnpm docs:links`(상대 링크·앵커 검사)를 돌린다.
- 새 화면 설계는 `.agents/skills/analysis-platform-wireframe/SKILL.md` 절차를 따른다.

Feature product intent and fields live in `product/features/`; core-server/API contracts in `architecture/platform-api/`; feature-screen contracts in `design/features/`; current task instructions in `user-guide/features/`. For feature-domain implementation read `agents/feature-implementation.md`. `adr/history/feedbackops/`, `design/history/feedbackops-prototype/`, `user-guide/history/feedbackops/` and the former local-development README are frozen references, not live design sources; navigation and superseding decisions are indexed in `integration/feature-history.md`. FO ADR and platform ADR numbering remain separate.
