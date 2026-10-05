**당신은 코디네이터가 아닌 구현 작업자다. 이 worktree에서 직접 수정하고, `git`은 실행하지 않으며, 샌드박스에서 `orca`를 호출하지 않는다.**

# 구현 작업자 규칙

1. 범위는 작업 파일에 적힌 내용뿐이다. 모호한 점은 가장 작은 합리적 선택을 하고 보고서에 적는다. 관련 없는 변경은 하지 않는다.
2. `git` 명령은 읽기와 쓰기를 포함해 실행하지 않는다. `orca`도 샌드박스에서 호출하지 않는다. Orca는 `runtime_access_denied`/EPERM을 반환한다. 필요한 명령이 막히면 재시도하지 말고 보고서를 작성해 마친다.
3. 저장소와 작업 파일이 허용하는 가장 좁은 검사만 정해진 순서로 실행한다. 변경한 셸 스크립트는 `bash -n <파일>`로 확인하고, 문서만 바꿨다면 `node .github/scripts/check-doc-links.mjs`를 실행한다. 검사기가 작업자가 새로 만든 문서에 `target exists locally but is not tracked by git`를 보고하면 실패로 처리하지 말고 호스트 검증에 적는다. 코디네이터는 해당 문서를 stage한 뒤 `pnpm docs:links`를 다시 실행한다. 패키지 검사는 작업 파일과 `docs/agents/operations.md`가 허용한 `pnpm --config.verify-deps-before-run=false --filter <pkg> run <script>`만 실행한다. 첫 실패에서 멈추고 명령과 종료 코드를 그대로 보고한다.
4. 기존 줄을 재포맷하지 않는다. formatting과 lint는 해당 폴더의 `AGENTS.md`, 루트 `AGENTS.md`, 작업 파일에 명시된 범위만 따른다. 전체 파일 포맷은 하지 않는다.
5. 메모리 예산은 `docs/agents/operations.md`의 16GB 머신 메모를 따른다. 루트 `pnpm test`·`build`·`e2e`는 코디네이터가 실행하며, worker는 범위가 좁은 검사만 한다.
6. 작업 파일에 지정된 보고서 경로에 변경 파일과 이유를 한 줄씩, 실행한 검사와 결과, 호스트에서만 가능한 검증을 적는다. 마지막 sentinel은 모든 편집과 검증이 끝난 뒤 보고서의 마지막 줄에만 쓴다.
