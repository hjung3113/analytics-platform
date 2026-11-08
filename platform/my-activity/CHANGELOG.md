# @ap/menu-my-activity 변경 기록

내부 버전이며 발행하지 않는다. SDK 범위는 package.json의 ap.sdk를 따른다.

## 0.4.0 — 2026-11-07

- 내 활동의 API 토큰(`/tokens`): 개인 목록·발급·일회 표시·폐기. 확인된 A안, 공유 표·서랍 사용(#1443).

## 0.3.0 — 2026-11-03

- VOC: 범위 안의 모든 VOC를 목록 + 읽기 창으로 본다(`GET /vocs/public`, 페이지 키 `mine`·`system`·`q`·`focus`). 읽기 창은 공개 상세로 소유 여부를 먼저 확인해 내 VOC는 신고자 상세, 그 밖은 공개 부분만 그린다. 옛 `status`·`sort` 주소는 목록 API가 지원하지 않아 거부·보존한다(#1288).

## 0.2.0 — 2026-11-03

- 내 VOC·설문(과 숨김 하위 화면)을 전역 그룹 `noticeVoc`(소통)으로 옮기고 이름을 VOC·VOC 상세·설문으로 바꿈(ADR-0110, #1287).

## 0.1.1 — 2026-10-31

- MyVoc·VocDetail: 제출자가 자기 VOC 상세에서 답장(Reporter Reply)을 보낼 수 있다. 공개 업데이트·내부 코멘트·Triage는 그리지 않는다(#1159).

## 0.1.0 — 2026-10-27

- 초기 기록: Notifications, MyVoc, VocDetail, Surveys와 권한 요청 및 홈 내 할 일 슬롯.
