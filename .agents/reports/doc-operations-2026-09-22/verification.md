# 확인 범위와 검증 결과

이 문서는 문서 운영 체계의 조사·검증 범위를 기록한다. 전 제품 계약의 완결성이나 구현 승인이 아니다.

## 읽기 범위

주 에이전트는 현재 Git/AGENTS/INDEX를 먼저 확인했다. README/HANDOFF, 00–05, 07, PLATFORM_REQUIREMENTS, integration/repository-layout을 읽고, 06의 전역 책임·§4–6·7–19·23–29 및 관련 경계를 직접 확인했다. DESIGN은 목차·Overview/Sources/Layout/Navigation/표 밀도/Reference bindings/Shared interaction/Open Decisions와 관련 token을 확인했다. DESIGN 모든 token의 시각 적합성을 검증한 것은 아니다.

research의 README/SYNTHESIS 및 필요한 원문, 리뷰의 계약 근거와 §8 미결, integration 후보2의 본문·실패 예외, 기존 docstructure 감사의 관련 항목을 대조했다. 나머지 연구/후보의 상세는 Luna 인벤토리와 각 토론 보고서의 범위를 보조 자료로 썼다. 소유권·충돌·샘플 보존에 쓰인 주요 결론은 원문을 다시 읽었다.

| 주요 결론 | 주 에이전트 원문 재확인 |
|---|---|
| 06 authority와 혼합 상태 | AGENTS, INDEX, 06 서두/§6/§19/§23/§28–29 |
| 05 상세 원본 보존 | 05 폴링·DB 접근·지연완료 전체 및 06 §6.3 역참조 |
| stale Open 정정 | 03 시간 계약, 04 Context/URL, 07 §6/§8와 06 §6.3/6.4 |
| DESIGN 역할·내부 혼동 | Navigation, Open Decisions, table-density, reference table 주석, shared interaction |
| REQUIREMENTS 상태 혼합·예외 손실 | 서두, §0, §3, Open Questions와 06 §6.1의 metric 쌍 예외 |
| Candidate 의미 보존 | integration 후보2 및 06 Scope/시간/권한/상태 |
| 독립 제품/upstream 경계 | AGENTS, integration/repository-layout, 00/01, source/reference 안내 |

471개 파일은 **변경 보존 검사 대상 수**이며 471개 본문 전수 정독을 뜻하지 않는다. 외부 디자인 사본 전수, 연구에 인용된 외부 저장소 전수, FeedbackOps 내부 전수는 이번 검토 범위가 아니다. 문서가 인용한 최신 OSS·외부 서비스 상태도 새로 확인하지 않았다.

## 수행한 검증

`python3 .agents/reports/doc-operations-2026-09-22/validate.py`를 실행했다. 결과는 [validation.json](validation.json)에 있다.

- 시작 snapshot의 471개 원본 SHA-256 일치, source drift 없음; HEAD·FeedbackOps gitlink 유지.
- 06 §6.3 원문과 샘플 본문 byte-equivalent 텍스트 일치. SHA-256 `bc1a24c6c09a8cc1cfd75fe94e5c2c9f65512a20ff8dbc196af508b42a9c2cfc`.
- 보고서 패키지 Markdown의 제한된 inline 로컬 링크/heading·명시 anchor 검사. 전체 Markdown 렌더러나 코드 안 backtick·외부 URL 검사가 아니다.
- 메모리 안의 네 음성 점검: R 부재 예외를 잘못 바꾼 사본, 틀린 source hash, 없는 source path, 없는 anchor를 각각 탐지. 실제 원본에 오류를 주입하지 않았다.
- Standard Log Lifecycle 사본 7개 Git blob SHA가 로컬 manifest와 일치. 이는 upstream 원격 최신성을 재검증한 결과가 아니다.
- 원문 예외 10행 역대조와 대표 작업 5개를 문서 워크스루로 검토. 동시 변경 사례는 문서 기반 모의 제안이며 실제 FE/BE 코드를 만들지 않았다.

변경 파일 공백 검사는 untracked 산출물도 포함하도록 별도 no-index diff 검사로 수행한다. 결과와 최종 Git 상태는 아래 마감 기록에 남긴다. 원본에 대한 `git diff --check`만으로 새 산출물까지 검사했다고 주장하지 않는다.

## 미검증과 후속 조건

플랫폼 runtime/API/DB/IdP/권한 연동, 부하·접근성·CJK 렌더링·장애 복구·이행 patch 실제 적용은 수행하지 않았다. 구조 검사는 의미 정합성을 보증하지 않는다. 탐색 시간·LLM 정확도 개선율도 측정하지 않았다. M1 적용에서 탐색 누락을 다시 점검하고 실제 변경 3건에서 유지 비용을 평가한다.

원본 추가 조사와 사용자 판단은 [인터뷰 항목](interview.md)에서 분리했다. 답변 부재가 전체 문서 정비를 막지는 않지만 Scope/domain·TZ assertion·운영 수치·팀 evidence 위치 등 답변 의존 범위는 확정하지 않았다.

## 독립 최종 검토의 처리

[Luna 검토 원문](validation-review-luna.md)은 당시 파일 기준으로 보존한다. 원본을 재확인한 뒤 다음처럼 처리했다.

| 항목 | 처리 |
|---|---|
| V-01 실제 파일 경로 | M1에 `../PLATFORM_REQUIREMENTS.md`를 명시하고 M3의 출처 표기를 현재 리터럴로 정정. 운영/대표 검증에서 약칭을 정의 |
| V-02 DECISIONS 부재 | 검토 중 작성이 완료되어 현재 존재. 검토 당시 관찰을 역사로 보존하고 최종 링크 검사 수행 |
| V-03 시각/행동 경계 | 06 §4/§15/§26과 DESIGN 직접 재확인. token 값 편집 원본과 플랫폼 최소 기준·접근성 의무를 구분하도록 보강 |
| V-04 Data Trust | V1–V3/운영 읽기 경로에 §18 추가, §18/§19 어휘·statusSource/observedAt·empty/unknown/error/권한 의미 대조 |
| V-05 01/05 예외 | V2에 01 mart 및 H 미설정/창/원천 정지/후보 보존/완전성 비주장/독립 재계산 트리거·세대 정합 대조 추가 |
| V-06 후보2 축약 | current/history의 파라미터·감사 제외·읽기 전용/cursor/partial failure·Site TZ/default range 예외를 현재 후보 원문과 재대조해 추가 |
| V-07 M1 제한 | 수용. DESIGN 등 전체 stale 문구 해결로 과장하지 않음. 네 파일 범위 유지 |
| V-08 Scope 과도한 Open | 단일 요청 scopeId·재검증 Decided와 hierarchy/상속/복수 선택/소속 규칙 Open을 명시적으로 구분 |

이 보강은 새로운 구조나 제품 결정을 추가한 것이 아니라 이미 읽은 계약의 필수 탐색·예외를 제안서에 더 정확히 연결한 것이다. Grok/GLM R3는 보강 전 제안서를 검토했으므로 최종 문안 전체의 재검증까지 수행했다고 주장하지 않는다. 주 에이전트가 관련 원문을 직접 대조하고 패키지 구조 검사를 갱신했다.

## 마감 기록

최종 패키지 29개 파일의 `git diff --no-index --check /dev/null <file>`에서 공백 진단은 없었다(no-index의 exit 1은 새 파일 차이가 있음을 뜻하며 오류 진단과 구분). 기존 tracked diff의 `git diff --check`도 exit 0. 최종 Git 상태는 이 패키지 디렉터리 하나만 untracked이며 원본 tracked 변경 없음. source 검사·샘플 일치·로컬 링크·음성 점검·로컬 manifest 대조는 모두 통과했다.
