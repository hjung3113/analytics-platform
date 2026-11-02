# @ap/menu-log-knowledge 변경 기록

내부 버전이며 발행하지 않는다. SDK 범위는 package.json의 ap.sdk를 따른다.

## 0.5.0 — 2026-11-02

- 전체 기술 Item 목록·Item 상세 화면(#1197 s2, A안, 읽기 전용): 메뉴 `log-knowledge-items`(표·필터·검색)와 숨김 상세 `log-knowledge-item`(본문 4블록, 근거, 연결 Item, 리비전 `?rev=`, 판단 변경 이력). 조회 2종(`logKnowledge.items`·`itemDetail`) 선언·mock 저장소(`src/mock/items.ts`)·서버 drift 검사.
- 기술 Item 쓰기 5종 선언(`itemCreate`·`itemRevise`·`itemAssess`·`itemDerive`·`itemSetArchived`, 권한 `ITEM_PUBLISH_PERMISSION`=`knowledge:item-publish`)과 mock 쓰기(`src/mock/itemActions.ts`, Item 저장소 변경 함수), 서버 drift 검사(#1197 s3a, 화면 없음).
- 기술 Item 쓰기 화면(#1197 s3b, A안, 권한 `knowledge:item-publish` 보유자에게만): 전체 기술 Item의 「새 기술 Item」 서랍(소유 종류 모델|SW 버전 선택, 근거 포인터 ≤ 20, 주소 `focus=new`·`owner`), Item 상세의 「수정」(최신 리비전 기준, 변경 사유 필수, 주소 `drawer=revise`)·「판단 변경」·「관련 Item으로 신규 작성」(`drawer=assess|derive`, 근거·판단 상태 미승계)·`보관`/`보관 해제` 확인, 서버 `invalid` 경로(`evidence.<i>.<field>` 포함)를 칸에 연결, 충돌 시 새로 불러오기. 모델 프로파일 «모델 공통 Item»은 개수 한 줄 대신 모델 소유 게시 Item 5건과 `모두 보기 (N)`(Item 목록 `ownerModelId` 필터)로 바뀌었다. 선택 목록 `useOptionPicker`가 추가 필터(SW 버전의 `modelId`)를 받는다.

## 0.4.0 — 2026-11-02

- 모델 탐색(`log-knowledge-models`, 그룹의 primary — 카탈로그 관리의 `primary` 해제, 사이드바에서 카탈로그 관리 앞)와 모델 공통 프로파일(`log-knowledge-model`, 숨김 자식, `/log/knowledge/models/:modelId`) 화면(#1197 s1, A안). 조회 2종 `logKnowledge.exploreModels`·`modelProfile` 선언(`src/endpoints.ts`)과 mock(`src/mock/models.ts`).
- 모델 탐색: 제조사·공정·활성 필터(활성 기본), 검색은 모델 코드·이름, 공정 배지 2개 + `+N`, `SW 0` 강조, 행 열기는 `returnTo` 링크, 「모델 등록」은 카탈로그 관리 권한자에게만(카탈로그 모델 탭 링크). 프로파일: 모델 요약·SW 버전 표·모델 공통 Item 개수·Top View 빈 상태, 「SW 버전 추가」는 권한자에게만, 없는 모델은 안내 + 모델 탐색 링크.

## 0.3.0 — 2026-11-02

- 카탈로그 관리 화면(#1194 b, A안: 탭 + 오른쪽 서랍): 제조사·공정·모델·SW 버전 탭, 서버 페이징 표와 필터, 만들기·수정·비활성화, 칸 오류·충돌 안내. 모델 행에 `latestSoftwareLabel`.
- 서랍이 행을 `id` 필터 조회 한 번으로 읽고(조회 4종에 `id` 필터), 선택 목록은 서버 검색·더 보기, 기본 탭·필터를 주소에 함께 기록, 패키지 `styles.css` 추가.

## 0.2.0 — 2026-11-02

- 조회·쓰기 선언(`src/endpoints.ts`: 조회 4종은 표 필터 모델, 쓰기 12종), mock 처리기(`./mock`), 카탈로그 관리 메뉴 권한 `knowledge:catalog-manage`(#1194 r).

## 0.1.0 — 2026-11-02

- 초기 기록: 화면 없이 계획 메뉴 manifest(카탈로그 관리)만 선언. 서버 조회는 `logKnowledge.*`(#1193).
