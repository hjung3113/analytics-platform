## analytics-platform 부록 (AP addendum)

위 번호 규칙에 대한 AP의 덮어쓰기·추가. 더 엄격한 쪽이 이긴다.

- **당신은 코디네이터가 아닌 구현 작업자다. 이 worktree에서 직접 수정하고, `git`·`orca`는 실행하지 않는다.**
- 작업 파일에 "final — do not re-litigate"로 적힌 코디네이터 결정은 다시 따지지 않는다.
- `git` 명령은 읽기와 쓰기를 포함해 실행하지 않는다(공통 규칙 1의 git 금지보다 엄격하다). `pnpm install`·`add`·`patch`·`update`도 실행하지 않는다 — 오프라인 설치가 worktree의 `node_modules`를 비운 적이 있다(FeedbackOps s70). 의존성은 코디네이터가 미리 설치한다. 변경은 커밋하지 않은 채로 두고, 커밋과 루트 검사는 코디네이터가 한다. `orca`(터미널·worktree·orchestration)도 코디네이터 몫이다. 필요한 명령이 막히면 재시도하지 말고 명령과 막힌 이유를 보고서에 적고 마친다.
- 먼저 읽는다: 루트 `AGENTS.md`, 고치는 폴더의 `AGENTS.md`, 작업 파일이 가리키는 계약 문서(06 절·ADR).
- 저장소와 작업 파일이 허용하는 가장 좁은 검사만 실행한다. 패키지 검사는 `pnpm --config.verify-deps-before-run=false --filter <pkg> run <lint|typecheck|test>`다. 테스트를 고쳤으면 그 패키지의 `typecheck`도 돌린다(vitest는 타입을 보지 않는다). vitest 워커 상한은 환경 변수로 이미 걸려 있다 — 워커 수를 바꾸는 플래그를 붙이지 않고, 특히 `run test -- --maxWorkers=…`처럼 `--` 뒤에 두지 않는다(파일 필터가 되어 상한이 사라진다). 변경한 셸 스크립트는 `bash -n <파일>`, 문서만 바꿨다면 `node .github/scripts/check-doc-links.mjs`. 검사기가 새로 만든 문서에 `target exists locally but is not tracked by git`를 보고하면 실패로 처리하지 말고 보고서에 적는다. 첫 실패에서 고치고, 끝내 실패하면 명령과 종료 코드를 그대로 보고한다.
- 루트 `pnpm test`·`build`·`e2e`, dev 서버, 브라우저는 실행하지 않는다(16GB 머신, `docs/agents/operations.md`). E2E를 새로 쓰거나 고쳤다면 실행해 보지 못했다고 보고서에 적는다.
- 화면 문구는 i18n 사전과 그 화면의 기존 표현을 재사용하고, 도메인 용어는 `GLOSSARY.md`를 따른다. 기존 줄을 재포맷하지 않는다.
- 보고서에는 변경 파일(파일마다 이유 한 줄), 추가한 테스트(어느 수용 기준인지), 바꾼 기존 테스트와 이유, 실행한 검사와 결과, 하지 못한 것, **호스트에서만 가능한 검증**, 열린 질문을 적는다.
