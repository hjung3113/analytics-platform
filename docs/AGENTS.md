# docs/ — 플랫폼 설계 문서

제품·플랫폼 계약의 원본. 코드보다 먼저 여기서 무엇이 결정됐는지 확인한다. 진입점은 [INDEX.md](INDEX.md)(역할별 진입점·작업별 읽기 경로).

## 소유권

- `06_platform_ui_contract.md` — 전역 계약과 navigation IA. 다른 문서는 이를 소비한다.
- `01` 데이터 계약·운영 정책, `02` 도메인 catalog, `03` 백엔드, `04` 프론트 구현 후보, `05` 결정 상태 추적, `07`–`13` 화면 설계(wireframe).
- `integration/` — 저장소 구조와 통합 결정(모노레포 패키지 경계 포함). `adr/` — 도메인 결정 기록.
- `reviews/`, `research/` — 합의록·조사 기록. authoritative source가 아니다.

## 규칙

- 상태 표기 Decided / Candidate / Open / Deferred를 지킨다. Open을 임의로 결정하지 않는다. 결정이 나면 원본 문서와 `05`를 함께 갱신한다.
- 계약 변경은 소유 문서 한 곳에서 하고, 다른 문서는 링크로 참조한다. 같은 규칙을 여러 문서에 복사하지 않는다.
- 문서와 코드가 어긋나면 어느 쪽이 맞는지 확인한 뒤 고친다. 문서 대조를 런타임 검증으로 보고하지 않는다.
- 역사 기록(`reviews/`, `.agents/reports/`, 앱 `reports/`)은 덮어쓰지 않는다.
- 새 화면 설계는 `.agents/skills/analysis-platform-wireframe/SKILL.md` 절차를 따른다.
