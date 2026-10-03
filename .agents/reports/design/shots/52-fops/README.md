# #52 디자인 방향 프로토타입 — 현재 vs FeedbackOps 디자인 (2026-10-04)

버리는 브랜치 `prototype/52-fops-design`(main 병합 안 함). 실제 앱 위에서 하단 바(←/→ 또는 키보드 화살표)로 3안을 바꾼다. 선택은 localStorage `proto:variant`에 남고, `?variant=A|B|C`로 바로 열 수 있다(메뉴 이동 때 URL 계약이 이 파라미터를 지우지만 선택은 유지된다).

| 안 | 토큰·타이포 | 셸 |
| --- | --- | --- |
| A | 현재 플랫폼(`@ap/ui`, 블루 `#2563eb`, 본문 13px, Inter + Noto Sans KR) | 어두운 사이드바 270px + 상단 바 54px + 큰 페이지 제목 |
| B | FeedbackOps ADR-0058 계약 그대로(Samsung 블루 `#1428a0`, 캔버스 `#f3f7fe`, 본문 14px, Inter + Pretendard) + 플랫폼 확장 층(차트·카테고리 색, 타이포 역할 클래스) | A와 같음(어두운 사이드바 유지) |
| C | B와 같음 | FeedbackOps AppFrame 구조 — 레일 52px(공간 전환·팔레트·도움말·언어·프로필·개발 도구), 밝은 사이드바 240px(그룹 = 섹션 제목, Scope 선택이 사이드바 머리), 상단 바 없음, 50px 페이지 머리(제목·설명·동작 한 줄) |

- 캡처: `baseline/`(main 그대로 = A), `B/`, `C/` — 개요 `/analytics/productivity`, 분석 `/analytics/cycle-time`, 관리 `/equipment`, 카탈로그 `/metrics`, 모두 `scopeId=ICH`, 1440×900.
- 실행: 이 브랜치에서 `pnpm install && pnpm dev` → `http://127.0.0.1:5173/analytics/cycle-time?v=1&scopeId=ICH&variant=C`.
- 프로토타입 코드: `packages/ui/src/proto/variant.ts`(안 상태), `apps/platform-web/src/proto/fops-theme.css`(B·C 스타일시트), `packages/shell/src/proto/FopsShell.tsx`(C 셸), `packages/shell/src/proto/PrototypeSwitcher.tsx`, `packages/components/src/PlatformPage.tsx`의 C 분기.
- 프리미티브(shadcn)는 플랫폼과 FeedbackOps가 이미 거의 같아(파일당 차이 1–19줄) 바꾸지 않았다 — 모양 차이는 토큰과 셸에서 나온다.
