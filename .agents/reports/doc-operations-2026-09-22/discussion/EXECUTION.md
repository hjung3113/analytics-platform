# 실제 실행과 모델 증거

시작일 2026-09-22 KST. 기준 HEAD `2d6fe5ad9f9d610e45ba028930f7c2effdad9d4a`, 시작 Git clean. 471개 대상 파일 SHA-256은 ../source-snapshot.json. 모든 참여자가 동일 체크아웃과 BRIEF를 사용했다. 원문 변경 여부는 ../validation.json으로 확인한다.

## 역할과 호출 수단

| 참여자 | 실제 역할 | 설정·확인 |
|---|---|---|
| 주 에이전트 | 독립 R1, 상호 반박, 원문 재확인, 구조·샘플·검증·이행 종합 | 활성 세션이 제공한 GPT-6 계열. 세부 배포 모델/effort는 이 도구 표면에서 별도 확인하지 못했으므로 Astra/High라고 추정하지 않음 |
| Grok | 전체 구조 독립안·상호 반박·재응답 | 로컬 `grok 1.0.13 (5e9a58528b76)`; `grok models`에서 4.6 확인. argv `--model grok-4.6 --reasoning-effort high --no-subagents`. 세션 summary의 `current_model_id=grok-4.6`, `reasoning_effort=high` 및 events turn_started model_id 확인 |
| GLM | 전체 구조 독립안·상호 반박·재응답 | `omp/18.2.7`; `omp models zai --json`의 glm-5.3 thinking low/high/max. argv `--model zai/glm-5.3 --thinking max --no-prewalk`; session model_change=`zai/glm-5.3`, resolvedModelIsFallback=false, thinking_level_change=max |
| Luna | 저비용 출처·상태·기존 감사 재확인, 별도 sample/이행 검토 | collaboration 도구 `gpt-5.6-luna`, `max`, 별도 task evidence_inventory. 주요 토론 참여 대체가 아님 |

사용자는 Grok/GLM 다중 모델 호출과 저비용 조사 위임을 명시적으로 요청했다. 이후 Orca CLI 사용도 허용했으나 이미 실행 중인 직접 CLI를 유지했다. 모델 역할 연기나 단일 모델 출력의 재명명은 하지 않았다. Grok Low/GLM Flash를 추가 호출할 필요는 없어 사용하지 않았다.

## 독립성·읽기 조건

BRIEF에 같은 목적·경계·source 기준·질문을 제공하고 상대 신규 보고서 열람을 R2까지 금지했다. root R1은 상대 R1이 생기기 전에 작성했다. R1에는 주 에이전트의 추천 구조를 배포하지 않았다. 과거 감사는 모든 참가자에게 동일한 배경 단서로 열어 두었고 현재 원문 재확인을 요구했다.

R2는 세 R1 교환과 ROUND2 반례 질문으로 진행했다. root-r2를 추가로 읽을 수 있게 했으나 Grok R2는 다른 R2를 읽지 않았다고 보고한다. 따라서 R3에서 root/상대 R2를 명시적으로 다시 전달한다. 동시 익명 토론으로 과장하지 않고 비동기 상호 반박으로 기록한다.

## 세션/로그 위치와 한계

- Grok session: `01a0c77f-e13d-7421-9111-5beb5976299d`, 로컬 `~/.grok/sessions/%2FUsers%2Fhyojung%2Forca%2Fprojects%2Fanalytics-platform/.../` summary/events. R2/R3는 동일 session resume.
- GLM session: `/tmp/analytics-docops-glm-sessions/2026-09-22T05-04-19-416Z_01a0c780-25d8-7564-977b-2fccdf0a9d4c.jsonl`; 후속은 동일 session resume.
- stdout/stderr: `/tmp/analytics-docops-{grok,glm}-r{1,2,3}.*`. 로그는 검토용 임시 실행 증거이며 저장소 영구 증거는 보고서·이 기록·[선별 metadata](model-evidence.json)에 있다. 자격 증명/원격 계정 설정은 복사하지 않았다.
- GLM 최초 호출의 tools 목록에 존재하지 않는 find/ls를 지정해 실행 전 실패했다. CLI가 제시한 read/grep/write로 고쳐 재실행했고 모델/effort metadata를 확인했다. 실패 호출을 모델 참여로 세지 않는다.
- GLM/Luna 압축에서 발견한 체크박스 원문 해석 오차는 original과 재대조하고 Luna 보고서에서 정정했다. 요약이 원본을 대체하지 않는 실제 사례다.

이 과업의 출력은 조사/권고/문서 검증이다. 외부 웹·서비스 최신성, 제품 코드·DB·IdP·성능·접근성 런타임은 재검증하지 않았다. 기존 제품·서브모듈·계약 원문을 수정하거나 commit/push하지 않는다.

## 완료된 라운드와 최종 문안 변경

Grok/GLM 모두 R1→R2→R3 보고서를 작성했고 각 CLI 프로세스의 exit 0을 확인했다. R3에서 양측 R2 및 root 반론, 실제 샘플/운영안/첫 이행을 전달했다. GLM R3는 원본 인접 시범과 분리 샘플 반대를 철회했으며 Grok R3는 Decided 강등 범위를 재수정했다. 원본 변경 추정 등 수용하지 않은 주장은 DECISIONS에 남겼다.

R3 읽기 중 원본 471개는 변경되지 않았다. 보고서 패키지의 sample/operating-model 도입문만 사본의 수명을 ‘현재 계약으로 동기화하지 않고 snapshot 역사 증거로 보존’한다고 명료화했다. R3에는 이전 도입문 인용이 남아 있다. §6.3 사본 본문은 동일하며 이 문안 차이를 역사 삭제나 추가 제품 결정으로 취급하지 않는다. Luna 검토자에게 변경을 알렸다.

Luna 최종 검토 후 주 에이전트가 실제 파일 경로·Scope 상태 범위·Data Trust/데이터 운영/adapter 예외 읽기 경로·시각/접근성 책임 문구를 보강했다. 이 후속 문안까지 주요 토론 모델이 재검토했다고 보고하지 않는다. 처리와 원문 재확인은 ../verification.md에 있다.
