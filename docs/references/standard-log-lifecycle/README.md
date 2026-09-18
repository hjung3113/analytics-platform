# Standard Log Lifecycle — 설계 레퍼런스

상태: **Reference only**. 문서 사본의 추가는 기능 구현·통합·출시 범위의 승인이 아니다.

## 1. 출처와 보관 범위

- 원본: https://github.com/hjung3113/standard-log-lifecycle
- 고정 커밋: `2d2dce25087a6a7b469e60fde448a76b29055041` (`main` 확인 시점)
- 사본 추가일: 2026-09-18
- `upstream/`에는 원본의 **Markdown 7개**를 디렉터리 구조와 내용 변경 없이 보관한다. 원본 Git blob SHA와 사본 SHA가 모두 일치한다. [파일별 manifest](source-manifest.json).
- HTML 와이어프레임과 canvas 메타데이터는 복사하지 않았다. [고정 커밋의 HTML 원본](https://github.com/hjung3113/standard-log-lifecycle/tree/2d2dce25087a6a7b469e60fde448a76b29055041/wireframes)을 참조한다.
- 자동 동기화하지 않는다. 갱신 시 출처 커밋과 변경 범위를 함께 기록한다.

| 문서 | 용도 |
| --- | --- |
| [원본 README](upstream/README.md) | 프로젝트 개요와 문서 탐색 |
| [Project Overview](upstream/docs/PROJECT_OVERVIEW.md) | 개발 착수 → Alpha → Beta → Complete, 반복 검증·결함·완료 판정 |
| [Domain Facts](upstream/docs/DOMAIN_FACTS.md) | 샘플 로그, 모델 식별, 파일 경계와 파서 계약 주의사항 |
| [Information Architecture](upstream/docs/INFORMATION_ARCHITECTURE.md) | Model / Validate / Defect / Spec / Report 탐색 관계 |
| [UI Wireframes](upstream/docs/UI_WIREFRAMES.md) | 모델 목록·상세, 검증 Workbench, 결과·결함·비교 화면 |
| [UI Research](upstream/docs/UI_RESEARCH.md) | 원본의 외부 UI 조사 기록; 이번 작업에서 외부 제품 정보를 재검증하지 않음 |
| [Dashboard Design Spec](upstream/wireframes/DASHBOARD_DESIGN_SPEC.md) | 원본 독립 제품의 Home 화면 설계 |

## 2. 기존 플랫폼 계약과의 경계

전역 UX·Navigation·Scope·Context의 원본은 [06_platform_ui_contract.md](../../06_platform_ui_contract.md)다. 공통 셸은 [07_app_shell_wireframe.md](../../07_app_shell_wireframe.md)를 따른다. 설비 마스터의 데이터 원천과 등록 원칙은 [02_domain_menus.md](../../02_domain_menus.md)를 따른다.

원본 저장소의 독립 Navigation 5개를 이 플랫폼의 최상위 메뉴로 복사하지 않는다. 독립 제품의 화면 치수·토큰·URL·권한 가정도 플랫폼 계약을 대체하지 않는다. 원본 문서 사이에 예시 수치나 표현상 차이가 있어도 사본을 임의 수정하지 않으며, 통합 구현 전 해당 도메인 소유자가 결정해야 한다.

공통 Navigation의 **7개 카테고리**는 유지한다. 각 카테고리에 접기/펼치기 chevron, 하위 메뉴 들여쓰기, 현재 페이지 표시를 둔다. 하단에는 즐겨찾기·최근방문, 헤더에는 Scope·메뉴 검색·사용자 메뉴를 둔다.

```text
운영 개요
  플랫폼 현황
설비관리
  설비 마스터
  모델 표준 로그        [Candidate: 이번 화면 시안의 제안]
기준정보관리
생산성 분석
  분석 개요
  설비 진행 간트        [Candidate: 이번 화면 시안의 제안]
  Wafer Journey
지표관리
공지·VOC
관리·감사
```

`모델 표준 로그` 하위 메뉴 배치는 **Candidate**다. 원본 Model / Validate / Defects / Specs / Reports는 해당 메뉴의 로컬 탭·상세 탐색으로 수용한다. 기존 전역 계약이나 Menu Registry 구현을 이번 작업에서 변경하지 않는다.

## 3. 요청된 화면 시안 4종

아래는 **Concept / Sample data** 시안의 내용 정의다. 실제 동작하는 페이지나 운영 수치를 뜻하지 않는다. 색상·치수·배치·추가 메뉴명도 Candidate다. 화면들은 동일한 고밀도 데스크톱 SaaS 셸을 공유하고, 각 화면을 별도 이미지로 표현한다.

### 01. 운영 개요 — 플랫폼 현황

7개 카테고리의 확장형 사이드바를 적용한 랜딩 화면. 즐겨찾기, 최근 방문, 접근 가능한 메뉴 바로가기를 중심에 둔다. 불필요하게 큰 KPI 카드나 장식용 차트로 채우지 않는다.

이전 시안의 Converter / Parser / File Collection 등 독립 최상위 메뉴는 제거한다. 근거 서비스가 없는 수집 성공률·파서 지연·백로그·실시간 장비 상태를 확인된 사실처럼 표시하지 않는다. 플랫폼은 기존 파서의 데이터를 소비하는 시스템이다.

### 02. 설비 진행 간트 — 생산성 분석

업무 일정용 프로젝트 간트가 아닌 **설비 로그 기반 공정 진행 이력**이다. 기간·설비·Lot Context 아래에 모듈/로봇/웨이퍼별 실제 구간을 시간축으로 정렬한다. 차트가 화면의 주 영역이며 공정, 이송, 비Process 체류를 범례로 구분한다.

선택한 occurrence에는 시작·종료·소요시간·모듈·웨이퍼·원본 근거를 표시한다. 확대 범위와 조회 조건 적용을 별개 조작으로 둔다. 완료된 occurrence만으로 실시간 진행률이나 빈 구간의 정지/Idle 상태를 추정하지 않는다. 열린 occurrence가 결과 테이블에 없다는 계약을 명시한다. 원본 줄 연결 기능이 제공되지 않는 구현에서는 링크가 있다고 가장하지 않는다.

예시 화면의 선택 구간: `EQP-013 / PM1 / W03`, 09:12:14 → 09:14:08, 114초. 예시 로그 파일명은 `eventlog2026091809.txt`로 표기한다. 시간대나 UTC 변환 정책을 시안에서 새로 확정하지 않는다.

### 03. 설비 등록·관리 — 설비 마스터

고밀도 설비 목록과 등록/편집 패널. **로그에서 발견한 equipment_id를 선택해 등록**하며 임의의 파서 설비 ID를 생성하는 입력 폼으로 바꾸지 않는다. 플랫폼이 소유하는 room/maker/model/설비그룹 등의 business 속성을 부여하고 필드 원천을 구분한다.

선택 설비의 속성·유효구간 이력·변경 감사 탭, 사용중지/복원, 등록 동작의 적용 시작일을 표현한다. 물리 삭제를 기본 동작으로 두지 않는다. 지원하지 않는 Lot 등 분석 Context는 미적용으로 표시한다. 마스터 유효구간 종료와 설비의 실제 운전 정지는 서로 다른 상태다.

### 04. 모델 표준 로그 개발·관리

모델 선택/목록과 선택 모델의 상세를 함께 둔다. 중심 순서는 **Lifecycle → Gate blocker → Current Round → 검증 근거·결함 → 재검증 이력**이다. 운영 설비 인스턴스와 개발 모델을 구분하며, 개발 중 모델에 운영 설비 ID를 필수로 요구하지 않는다.

개발 착수 → Alpha → Beta → Complete를 가로 단계로 보여준다. `Blocked`는 별도 Gate 상태이며 다섯 번째 개발 단계로 만들지 않는다. 모델 X100의 Beta Round #2처럼 모델·단계·Round 문맥을 유지한다. Gate 검토에는 필수 규칙, Critical 결함, 파서 처리, 데이터 품질, Alpha/Beta 판정 근거가 붙는다. Spec/Rule/Parser 버전은 플랫폼 지표 버전과 구분한다.

검증 결과·결함·스펙·문서·이력은 로컬 탭으로 탐색하고, 실패 Rule → 원본 Evidence → 결함 → 수정 → 새 Run의 재검증 결과를 연결한다. 파일 경계의 미완료 Start/End를 곧바로 결함으로 판정하지 않는다. Configuration/Recipe snapshot은 검증 지표로 추가하지 않는다.

## 4. 변경하지 않은 범위

제품 런타임 코드, DB/API 스키마, 플랫폼 전역 UI 계약, 원본 저장소는 수정하지 않았다. 이 폴더의 문서를 executable HTML이나 플랫폼 런타임 자산으로 자동 로드하지 않는다.
