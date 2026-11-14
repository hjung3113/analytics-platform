# SDK 변경 조각

공개 SDK를 바꾸는 PR은 `<이슈 번호>.md`에 변경 기록과 같은 네 칸의 행을 쓴다: `| 다음 릴리스 (#번호) | 패키지 | 변경 내용 | 이전 방법 |`. 셀 안의 파이프는 `\|`로 적는다. `pnpm sdk:changelog --check`로 검사하며, 릴리스 담당자가 `pnpm sdk:changelog --release X.Y.Z`로 합친다(`--dry-run`으로 미리 확인).
