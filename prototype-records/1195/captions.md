# #1195 카탈로그 가져오기 — prototype captures

Route: `/log-dev/log-knowledge-catalog?tab=model&variant=A|B|C&step=1..5` (`&state=dup|errors|partial|applying` forces a state). Real app shell, mock app, synthetic fixture (모델 CSV 40행: 신규 24 / 기존 일치 6 / 갱신 5 / 충돌 2 / 오류 3). Desktop 1440×900 unless noted; captured with ego-browser.

## Captures

- `now-catalog.jpg` — today's 카탈로그 관리 모델 탭 (가져오기 버튼 없음, 변경 전).
- `A-1-file.jpg` — A 1단계: 업로드 영역, 한도(5 MB·5,000행·50열·CSV UTF-8/XLSX 시트 1개), 가져올 대상, 템플릿 받기, 위쪽에 파일 정보 6개.
- `A-2-map.jpg` — A 2단계: 원본 열·샘플 4행과 대상 필드 드롭다운, 필수 3개 매핑됨, 다시 매핑하면 이전 해결 무효 안내.
- `A-3-validate.jpg` — A 3단계: "저장 건수 0" 안내, 신규 24/일치 6/갱신 5/충돌 2/오류 3 요약, 행별 표, 검증 리포트 CSV.
- `A-4-resolve.jpg` — A 4단계: 충돌 2행 목록, 파일 값과 현재 카탈로그 좌우 비교, 건너뛰기·기존 항목에 매핑·신규 생성(충돌 행은 비활성), 적용 계획 한 줄.
- `A-5-result.jpg` — A 5단계 completed: 반영 30/기존 유지 6/건너뜀 1/제외 3, 행별 결과, 결과 리포트 CSV.
- `A-5-partial.jpg` — A 5단계 partial_failure: 반영 27/실패 2/충돌 1, 실패 행만 다시 시도, 충돌은 재시도 안 함.
- `A-1280.jpg` — A 3단계 1280×800.
- `B-1-file.jpg` — B 1단계: 목록이 왼쪽에 남고 오른쪽 시트의 세로 단계 목록에서 1단계가 열림.
- `B-2-map.jpg` — B 2단계: 좁은 시트 안의 열 매핑.
- `B-3-validate.jpg` — B 3단계: 시트 안 검증 요약과 행 8개.
- `B-4-resolve.jpg` — B 4단계: 시트 안 충돌 비교와 해결 선택, 적용 승인 버튼은 시트 아래쪽 고정.
- `B-5-result.jpg` — B 5단계 completed.
- `B-5-partial.jpg` — B 5단계 partial_failure.
- `B-1280.jpg` — B 3단계 1280×800 (목록이 더 좁아짐).
- `C-1-file.jpg` — C 1단계: 왼쪽 가져오기 작업 목록(검토 필요·일부 실패·완료·취소됨), 오른쪽 작업 헤더와 단계 탭.
- `C-2-map.jpg` — C 2단계.
- `C-3-validate.jpg` — C 3단계.
- `C-4-resolve.jpg` — C 4단계.
- `C-5-result.jpg` — C 5단계 completed.
- `C-5-partial.jpg` — C 5단계 partial_failure, 작업 목록에 imp-0409도 일부 실패로 보임.
- `C-1280.jpg` — C 3단계 1280×800.
