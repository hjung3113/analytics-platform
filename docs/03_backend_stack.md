# 03. 백엔드/인프라 기술 스택 (백엔드 담당자용)

프론트엔드 스택은 `04_frontend_ui_ux.md`를 본다.

| 계층 | 추천 | 이유 |
| --- | --- | --- |
| Backend | FastAPI(Python), 단 SQL-first 전제 — **팀 언어 확정 전 Open, `05_roadmap_and_open_questions.md` 참조** | 무거운 집계는 Postgres(mart)에서 처리하고 API는 얇은 조회/권한/지표계약 계층 + 지표 DSL 검증/비동기 배치로 역할을 좁힌다. 요청 경로에서 DataFrame을 만드는 패턴은 동시성·메모리에서 확장 불가. 팀이 C# 중심이면 ASP.NET Core, TypeScript 중심이면 NestJS도 동등 후보(OpenAPI 자동생성은 ASP.NET Core도 공식 지원해 FastAPI만의 장점이 아님) |
| DB | 파서 Postgres(read-only) + 같은 인스턴스의 별도 스키마 | 완전 분리 인스턴스는 보안 격리 요구가 실제로 생기기 전엔 운영 비용만 추가. mart 갱신은 pg_cron으로 시작(단, 지연 완료 watermark 감지 기반 재계산 메커니즘 별도 필요 — `01_architecture_and_data_contract.md`) |
| 인증 | OIDC(day 1부터 라이브러리 도입) | 사내 SSO가 예정돼 있다면 로컬 인증을 먼저 만들고 나중에 SSO로 바꾸는 전환 비용이 크다 |
| 플랫폼 DB 마이그레이션 | Alembic(또는 팀 표준 도구) | 플랫폼 메타 DB/mart 스키마 버전 관리 — 파서의 DbUp과는 별개 |

## 백엔드 역할 분담 원칙 (SQL-first)

- PostgreSQL: 필터링, 조인, 기본 집계, 검증된 집계 테이블(mart)
- API: 권한, 조회조건 검증, 지표 계약, 결과 전달
- 별도 작업 프로세스: 긴 계산, 대규모 내보내기, Python 분석

일반적인 처리량·사이클타임·가동률 집계는 PostgreSQL에서 처리할 수 있다. pandas/polars를 쓸 수 있다는 이유로 모든 요청에서 원천 데이터를 Python으로 가져오면 전송량과 메모리 사용량이 병목이 된다.

## 재현성 계약

지표 버전을 고정해도 늦게 완료된 occurrence, 마스터 이력 정정, `module_class_map` 재분류로 같은 URL의 숫자는 바뀔 수 있다. 딥링크는 "조회조건과 지표 버전의 재현"만 보장하고 "같은 숫자의 재현"은 보장하지 않는다 — 결과 화면에는 계산 기준시각을 표시한다. 상세는 `06_platform_ui_contract.md` §6.1(Decided).

## 시간 계약 (중요 — 2차 리뷰에서 발견된 실수)

파서의 업무 시각은 **시간대 없는 설비 wall-clock**이다(`context_recognized_parser` 원칙). 소비 계층이 이를 UTC로 임의 변환하면 조회 구간과 마스터 귀속이 틀어진다. Phase 0에서 최소한 다음을 결정한다:

- 설비 또는 사업장별 원천 시간대와 미확인 시 처리
- 소비 계층의 UTC 변환 책임 소재
- 조회 구간의 경계 의미 (예: `[from, to)`)
- 여러 사업장의 "같은 날짜"가 동일 UTC 구간인지, 각 사업장 현지 영업일인지

원천 wall-clock은 보존하고, 변환 가능한 경우에만 분석용 시각을 별도로 제공하는 방향이 안전하다.

## 로딩·빈 상태·오류의 근거 소유자

"수집 안 됨" / "파서 지연" / "조건에 맞는 결과 없음"은 결과 테이블 0건만으로 구분할 수 없다. `docs/23`도 파일 timestamp 간격은 수집 공백의 후보일 뿐이고, 확정하려면 Scheduler의 예상 파일·전달 이력이 필요하다고 명시한다(`docs/23_secondary_processing_ideas.md` §5 근방). 상태마다 판정 근거의 소유자(어느 서비스가 그 사실을 확정하는지)를 API 계약에 명시할 것 — 근거가 없으면 "원인 미확인"으로 남긴다. 프론트 쪽 표현은 `04_frontend_ui_ux.md` 참조.
