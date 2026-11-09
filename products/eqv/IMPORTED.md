# products/eqv — 가져온 EV 저장소 (보존용, 작업 공간 밖)

[ADR-0132](../../docs/adr/0132-eqv-merges-into-platform.md) / #1607. 이 폴더는 `hjung3113/equipment-visualization`의 이력을 `git filter-repo`로 옮긴 사본이다. 어떤 workspace glob에도 잡히지 않으며 패키지는 이후 노드(#1611, #1618, #1613)에서 `packages/eqv/*`와 `apps/eqv-studio`로 옮겨진다.

- 기준: EV `develop` fdb5fa6 + `main` 43248b7(`main` 전용 내용은 #236 cherry-pick 하나이고 `develop`에 patch-id가 같은 커밋이 있다).
- 제외: `.claude/`, `HANDOFF.md`, EV 태그(`v0.1.0`, `v0.2.0`, `eqv-v*`는 AP 태그와 겹치거나 릴리스 파일이 EV 저장소에 남아 있다).
- 커밋 메시지의 `#N`은 `EV#N`이다. 파일 내용의 `#N`은 바꾸지 않았고 옮기는 노드가 훑는다.
- 새 해시: 가져온 끝 `82a3ee679`(EV `develop`+`main` 합친 끝, 옛 `fdb5fa6`/`43248b7`에서 다시 쓰임).
- `EV-AGENTS.md`는 EV 저장소의 옛 `AGENTS.md`다. 폴더 가이드로 읽히지 않도록 이름을 바꿨고 규칙은 #1615가 `packages/eqv/AGENTS.md`로 옮긴다. `.github/`, `.githooks/`, `.nvmrc`와 EV의 `package.json` 스크립트는 여기서는 동작하지 않는다.
