# 플랫폼 구축 리서치와 토론

작성일: 2026-09-22. 상태: **Research / Candidate**. 기술 채택·구현 착수·기존 Decided 변경을 승인하는 문서가 아니다. 전역 계약은 [Platform UI Contract](../../06_platform_ui_contract.md), 결정 상태는 [05](../../05_roadmap_and_open_questions.md)가 소유한다.


> 현재 상태 안내(2026-09-23): 아래 권고는 당시 Research/Candidate 기록이다. 이후 백엔드 방향은 [03의 FastAPI](../../03_backend_stack.md)로 결정됐다. 현재 채택·보류 상태는 [05](../../05_roadmap_and_open_questions.md)를 우선하며, 아래 조사 본문은 소급 수정하지 않는다.

## 먼저 읽을 문서

[종합 보고서](SYNTHESIS.md)에 최종 권고, 원본 정정, 재사용/OSS 대체 판단, 최소 검증 흐름과 기존 문서별 반영안을 정리했다. 기술 후보의 채택 상태는 바꾸지 않았다.

## 원본 조사

Luna Max 3명이 병렬 조사한 보고서를 `.agents/reports/platform-research-2026-09-22/`에서 내용 변경 없이 보존했다. 공식 출처 확인과 로컬 코드 읽기를 수행했으며, 실행·부하·실서비스 적합성 검증은 수행하지 않았다. 원본의 오류나 논쟁점은 후속 종합 및 토론 기록에서 구분한다.

- [01 — 플랫폼 기능·프론트엔드·OSS](01-kernel-frontend.md)
- [02 — 데이터 계약·성능·백엔드·운영](02-data-performance-operations.md)
- [03 — 기존 구현 재사용·인증·권한·제품 통합](03-reuse-security-integration.md)
- [원본 조사 지시서](../../../.agents/reports/platform-research-2026-09-22/RESEARCH_BRIEF.md)

## 토론 절차

[토론 지시서](discussion/BRIEF.md)에 따라 Astra Medium, Grok 4.6 High, OMP `zai/glm-5.3` Max가 독립 검토(R1) 후 상대 주장에 대한 재검토(R2)를 완료했다. Orca Run은 `run_448c988f856e`다. 모델 간 동의는 실행 검증이나 제품 결정과 구분한다.

보고서의 문서 반영 제안은 각 원본 문서의 책임에 맞춰 검토한다. 이 조사 묶음을 새 전역 계약으로 사용하지 않는다.

## 토론 기록

| 리뷰어 | 독립 검토 | 상호 반론 |
| --- | --- | --- |
| Astra Medium | [R1](discussion/astra-r1.md) | [R2](discussion/astra-r2.md) |
| Grok 4.6 High | [R1](discussion/grok-r1.md) | [R2](discussion/grok-r2.md) |
| OMP GLM 5.3 Max | [R1](discussion/glm-r1.md) | [R2](discussion/glm-r2.md) |

- [원문 대조·코디네이터 반례](discussion/COORDINATOR_NOTES.md)
- [Orca 실행·모델 설정 확인 기록](discussion/ORCHESTRATION.md)

각 R2는 읽은 상대 보고서 시점의 반론이다. 상대의 후속 철회를 반영하지 않은 불일치 목록이 있을 수 있으므로 최종 입장은 종합 보고서에서 구분한다.
