Refs #2574

#2574 둘째 절반: admin·notice-voc 폼 4개에 #2540 SDK 폼 규칙 조각(`useValidatedSubmit`, `FormField` `requiredMark='text'`, `Button` `disabledReason`)을 적용. log-dev 폼(log-lifecycle·log-knowledge)은 features-a 몫이라 건드리지 않음 — 그쪽 PR이 `Closes #2574`.

## 무엇을 바꿨나
- **권한 부여** `permission-direct-grant-form.tsx` (변형 b): 꺼진 «권한 부여»가 막는 조건을 하나씩, 채우는 순서대로 보임(세션 → 권한 범위 불러오기 → 선택 → 한 번에 최대 개수 → 선행 검토·차단 → 본인 부여 정책 → 사유 → 만료일 → 본인 부여 감사 기록 → 관리자 권한 확인 → 부여 중). `canSubmit`의 모든 조건에 이유가 있음. 문구는 기존 것을 쓰고 없는 것만 `directGrant.blocked`에 추가.
- **흐름 정책 · 익명성 임계값** `WorkspaceSettingsScreen.tsx` (변형 b + ARIA): 범위 안내를 칸에 `aria-describedby`로 연결하고 범위 밖이면 `aria-invalid`. 꺼진 «변경사항 저장»이 이유(임계값·커버리지 기준·저장 중)를 보임.
- **시스템 등록** `ManagedSystemsDialogs.tsx` (변형 d·c): `FormField`+`useValidatedSubmit`로 옮김(필수 표시 «· 필수», 첫 오류 포커스는 기존 동작 유지). 서버의 슬러그 형식 거절(`invalid_slug_format`)을 대화상자 아래 일반 메시지 대신 슬러그 칸 오류로 보이고 그 칸으로 포커스.
- **공지 작성·수정** `NoticeDialogs.tsx` (변형 d): 자체 `Field`를 SDK `FormField`로, 로컬 검사는 `useValidatedSubmit`(첫 오류 칸 포커스), 서버가 거절한 칸도 그 칸으로 포커스. 필수 3칸에 «· 필수»(영어 «· Required»). `platform/notice-voc/changes/2574.md`.

고친 문서: 없음 — 화면 폼 동작만, 계약·SDK 변화 없음(공지 메뉴 changes 조각만)

## Decisions
- 소유자 2026-11-25 «51범위정한거도 같이시작해도됨», #3022
- 권한 부여 폼은 «제출 때 검사»로 바꾸지 않고 `disabledReason`만: 서버 선행 조건(preflight·본인 정책)이 섞인 보안 폼이라 제출 버튼을 켜 두는 쪽이 더 위험하고, 이슈의 문제는 «이유 없이 꺼짐». 이유 문장이 폼 안 안내(본인 부여 금지 등)와 같은 경우 버튼 아래에 한 번 더 보임 — 꺼진 버튼이 왜 꺼졌는지는 버튼 옆에서 읽혀야 해서 그대로 둠.
- 슬러그 형식 문구 새로 씀: «슬러그는 영문 소문자·숫자를 하이픈(-)으로 이어 씁니다. 예: power-bi».
- 시안 없음(리드 지시: 전후 캡처 + Decisions). v0.50 태그 뒤 병합.

## 캡처 (전후, 1440×900, admin은 실서버 시드)
https://claude.ai/artifact/6o6Arqd93aSYFDUaAWttFF

## 검증
- 새 회귀 시험 4개, 고치기 전 모두 실패: 시스템 등록 슬러그 형식·필수 표시(2), 공지 첫 오류 포커스·서버 거절 칸 포커스(1+기존 1에 단언 추가), 흐름 정책 임계값 연결·저장 이유(1), 권한 부여 이유 순서(1, 고치기 전엔 이유 없음).
- `@ap/feature-screens` 전체 5142 통과, notice-voc 44 통과, typecheck·lint(--max-warnings 0) 통과, `menu:changelog --check`·`docs:links` 통과.
- 실서버 미리보기(verify DB, Mock Admin)에서 네 흐름 직접 확인 — 결과는 캡처 페이지.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
