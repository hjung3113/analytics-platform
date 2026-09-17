# 공통 에이전트 자산

제품 계약은 `docs/INDEX.md`에서 시작한다. 이 폴더는 에이전트 tooling이며 제품 요구사항이나 승인된 디자인 시스템이 아니다.

## 원본과 연결

| 자산 | 단일 원본 | 호환 경로 |
| --- | --- | --- |
| 프로젝트 지침 | `/AGENTS.md` | `/CLAUDE.md → AGENTS.md` |
| 스킬 | `.agents/skills/` | `.claude/skills`, `.omp/skills`, `.grok/skills`, `.opencode/skills → ../.agents/skills` |
| 명령 텍스트 | `.agents/commands/` | `.claude/commands → ../.agents/commands` |
| 외부 디자인 자료 | `.agents/references/` | `.claude/references → ../.agents/references` |

모든 링크는 저장소 내부 상대 경로다. 복제본을 수정하거나 사용자 홈에 설치하지 않는다. Codex는 `.agents/skills`를 직접 탐색하므로 `.codex/skills` 복제 경로가 필요 없다. OpenCode/OMP가 공통 경로와 호환 경로를 함께 발견하더라도 같은 스킬의 별도 버전을 만들지 않는다.

## 에이전트별 사용

- Claude: `CLAUDE.md`와 `.claude/skills`를 통해 공통 원본을 읽는다.
- Codex: 루트 `AGENTS.md`와 `.agents/skills`를 사용한다. [공식 스킬 탐색 문서](https://developers.openai.com/codex/skills/).
- OMP: 루트 `AGENTS.md`와 `.omp/skills`를 사용한다. 설치된 OMP의 SDK skill discovery 문서에서 해당 경로를 확인했다.
- Grok Build: 루트 `AGENTS.md`와 `.grok/skills`를 사용한다. 설치된 CLI의 내장 Project Rules / Configuration 도움말에서 해당 경로를 확인했다.
- OpenCode: 루트 `AGENTS.md`와 `.opencode/skills`를 사용한다. `.agents/skills`도 공식 지원 경로다. [공식 문서](https://opencode.ai/docs/skills/).

탐색이 비활성화되거나 오래된 클라이언트에서는 `.agents/skills/<name>/SKILL.md`를 직접 읽도록 요청한다. `commands/*.md`는 모든 에이전트가 직접 읽어 실행할 수 있는 공통 절차이며, Claude 외 CLI의 slash command 등록을 보장하지 않는다.

## 실행·유지보수

- 화면 설계 진입점은 `skills/analysis-platform-wireframe/SKILL.md`다. 기본 종료점은 Wireframe + Open Decisions이며 구현 요청이 있을 때 후속 단계를 진행한다.
- 스킬 안의 `scripts/`, `references/`는 그 `SKILL.md`가 있는 디렉터리를 기준으로 해석한다. `ui-ux-pro-max`의 검색 예제는 해당 디렉터리에서 실행한다: `python3 scripts/search.py "analytics dashboard" --domain product`.
- 도구 이름·이미지 생성·외부 요청·자격 증명은 실행 환경에 따라 다르다. 현재 사용 가능한 도구로 대응하고, 필요한 의존성이 없으면 해당 작업의 제한을 보고한다. 경로 공유가 모든 외부 기능의 실행 검증을 뜻하지 않는다.
- `references/design-md`는 외부 시각 참고자료다. 제품의 IA/권한/Scope 계약을 덮어쓰거나 자체 `DESIGN.md`로 그대로 채택하지 않는다.
- `frontend-design`, `web-design-guidelines`를 포함해 후속 단계에서 참조하는 스킬은 저장소에 포함되어 있다.
- 가져온 스킬의 일부 테스트는 원본 배포 저장소의 생성 스크립트/fixture를 요구한다. 이 저장소의 전체 테스트 스위트로 간주하지 않는다. 이동 후에는 링크 해석, 스킬 frontmatter, 실행 경로 및 필요한 보조 스크립트를 확인한다.
- Git이 심링크를 실제 링크로 체크아웃하는 환경을 사용한다. 링크가 일반 텍스트로 체크아웃된 환경에서는 클라이언트 탐색을 사용하기 전에 심링크 지원을 확인한다.
