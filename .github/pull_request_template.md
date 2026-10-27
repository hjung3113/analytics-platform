Closes #

## 무엇을 바꿨나

-

## 확인할 것 (해당하는 것만)

- 공통으로 올릴지: <!-- 올림 / 소비자에 둠 — 이유 (06 §24) -->
- 고친 문서: <!-- 소유 문서, .planning/README.md -->
- UI 변경이면 컨펌된 프로토타입: <!-- 브랜치·이슈 링크 -->

## 검증

- [ ] `bash .agents/conductor/scripts/tier.sh`가 `verify=full`이면 `verify-root.sh`(`pnpm lint && pnpm typecheck && pnpm test && pnpm build`), 아니면 `lint`·`typecheck`(와 바뀐 패키지 검사)만 — test·build는 PR CI. 문서만 바꿨으면 `pnpm docs:links` ([PROFILE §Verify](../.agents/conductor/PROFILE.md))
- [ ] 공유 경로 PR(다섯 갈래: 공개 API·루트 `package.json`/lockfile/`turbo.json`·`.github/workflows`·`apps/platform-e2e`)은 경로와 관계없이 `verify-root.sh` 전체
- 브라우저/E2E:

🤖 Generated with [Claude Code](https://claude.com/claude-code)
