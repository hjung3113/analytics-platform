# 문서 점검(릴리스 전) — 점검자 작업서

[`LANES.md`](../LANES.md) §팀장 릴리스 3단계에서 팀장이 이 파일로 일회성 리뷰어(`review-quality`)의 작업서를 만든다. 첫 줄은 "Read `~/.agents/agents/review-quality.md` and follow it as your role definition"이고, 이 작업서가 페르소나와 다르면 이 작업서를 따른다: 읽기 전용 `gh issue view|list`·`gh pr view`는 쓴다. 점검자는 파일을 고치지 않고 보고서만 쓴다. 고치는 일은 팀장이 릴리스 문서 PR에 넣는다(사이트 지적은 site PR).

## 팀장이 채우는 입력

- 버전: `sdk-vX.Y.Z` 또는 `vX.Y.Z`
- 범위: `<이전 태그>...HEAD`
- 마감 리뷰 보고서: `<경로>`
- 릴리스 문서 PR 브랜치(초안): `<브랜치>`(앱 릴리스면 사이트 PR 브랜치도)

## 범위

`docs/` 전체를 훑지 않는다. 보는 것은 셋이다: ① 범위 안에서 바뀐 문서(`git diff --name-only <범위> -- '*.md'`), ② 범위의 코드 변경이 가리키는 소유 문서(변경 기록 각 행의 부품 → 06 절 → 패키지 `AGENTS.md`), ③ 진입 문서(루트 `AGENTS.md`, `docs/INDEX.md`, `docs/AGENTS.md`, `.planning/README.md`).

## 볼 것

1. **찾아가기.** 에이전트가 루트 [`AGENTS.md`](../../../AGENTS.md) "어디서 시작하나" 표 → [`docs/INDEX.md`](../../../docs/INDEX.md)의 작업별 읽기 경로 → 소유 문서로 세 번 안에 닿는가. 이번 릴리스에서 바뀐 계약·부품마다 그 길을 직접 따라가 본다. 끊기거나 옛 이름으로 가는 길을 적는다.
2. **낡은 문서.** 위 범위에서 닫힌 이슈·대체된 ADR·없어진 경로·없어진 부품을 아직 현재 사실처럼 적은 줄(`gh issue view <n> --json state`, `git ls-files`, `rg`로 확인). 더 볼 필요가 없는 문서(끝난 조사, 은퇴한 흐름의 메모)는 지울지·보관할지·`docs/research/`로 옮길지 제안한다. 지우는 결정은 팀장이 사용자에게 묻는다.
3. **목차와 소유권.** [`docs/AGENTS.md`](../../../docs/AGENTS.md) 소유권 표대로 계약이 한 곳에만 있는가(같은 규칙을 두 문서가 다르게 적지 않는가). `docs/INDEX.md`가 실제 파일 구성과 맞는가. 폴더 `AGENTS.md`와 `CLAUDE.md` 심링크가 짝을 이루는가.
4. **과정 기록 섞임.** 작업자 보고·리뷰 라운드·"이전에는 …" 서술이 계약 문서에 남았는가(`docs/AGENTS.md` 규칙).
5. **릴리스 문서.** 릴리스 문서 PR 초안의 변경 기록 이번 버전 행과 보드 릴리스 줄이 범위의 병합 PR과 맞는가. 앱 릴리스면 사이트 PR 초안도.

## 보고서

이 형식이 페르소나의 슬라이스 보고 형식보다 우선한다. `## Summary`(25줄 이내, `Verdict: ready|fix-before-release`, 표 `ID | 분류(찾아가기|낡음|목차·소유|과정 기록|릴리스 문서) | 파일:줄 | 문제 | 제안`), `## Patch`(Replace/With), `## Details`. 지울 것 제안은 따로 묶는다. 근거 없이 "아마"로 적지 않는다 — 확인한 명령을 적는다.
