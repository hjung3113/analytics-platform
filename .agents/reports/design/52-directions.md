# #52 셸 + 설비 마스터 — 3안 (A Linear/Vercel, B Datadog/Grafana, C Stripe)

질문: 1440px 데스크톱 셸과 `/equipment` 한 화면을 어떤 **구조**로 바꿀 것인가. 색만 다른 안은 실패다. 이 문서는 시안 스펙이다. `DESIGN.md`와 `packages/*`는 고치지 않는다. 사용자가 `?variant=`로 고른 뒤 이슈에 남긴다.

기준선(지금 코드, #33): 사이드바 270px `#0f1526`, 활성 항목은 `#2563eb` 채움, 상단 54px에 Scope 필과 파란 한/EN, Context 칩 줄과 페이지 `<select>`가 같은 무게, 설명 문단이 본문 앞, 테이블 헤더 대문자, 오류는 위젯마다 분홍 전폭 박스.

디자인 폭 1440. 1280에서도 셸이 가로로 잘리지 않는다. 콘텐츠에 `max-width`를 주지 않는다(06 §7). 그 아래는 범위 밖.

## 0. 세 안이 같이 지킬 계약

구현자가 판단으로 빼지 말 것.

- **Context 의미(§6, §11).** 전역(Scope, 기간, room_name, 설비 그룹 조건, 설비 선택)과 페이지 필터(`q`/`status`/`maker`)를 같은 칩으로 섞지 않는다. 페이지 필터는 `setPage`만 호출한다. Scope 편집기는 화면당 하나(배치는 안마다 지정). `setGlobal({ scopeId })`만 쓰고, 사이트에 묶인 room·조건·선택은 커널이 지운다. 기간은 naive wall-clock `[from, to)`. 프리셋은 1일/7일/사용자 지정뿐(`shift(defaultRangeTo, -24|-168)`). 날짜 선택은 양끝 포함을 `[D1T00:00:00, (D2+1)T00:00:00)`로 넣고, `from >= to`면 적용을 막는다. UTC 변환·clamp 금지. 조건 축은 StGroup / 분임조 / Maker+Model 중 하나. 조건만 바뀌어도 Selection은 그대로다. 선택 없음(`null`)·명시 집합·명시적 공집합(`[]`)을 구분한다. 설비 마스터 capability: time `reference`, room/condition/selection `apply`, lot·ppid·recipe·metric `unsupported`. 미지원 값은 URL에 남기고 "미적용"으로 보여 준 뒤 ×로만 제거한다. time에는 "참조"를 붙인다. 링크 복사는 `origin + url`, 토스트는 지금 `GlobalContextBar`와 같은 문장. 초기화는 `resetContext()`.
- **편집기 데이터.** room 선택지는 `scope.grantedRooms`. 조건 선택지는 팝오버가 열린 동안 `adapter.contextOptions`. Selection 후보는 `adapter.evaluateSelection`(조건 밖 ID는 "조건 밖", 자동 제거 금지). `useAdapterRequest`를 쓴다. 셸 비공개 함수를 import하지 않는다. 카피·모드(1일/7일/사용자 지정, 날짜↔초, absent/명시/공집합, 축 하나, "조건 밖", wall-clock 한 줄)는 `GlobalContextBar`의 PeriodControl·SetEditor·ConditionEditor·SelectionEditor와 같다. 안마다 다른 것은 트리거 치수뿐이다.
- **내보내기.** 세 안 모두 페이지 필터 줄 오른쪽에 12px 텍스트 "CSV"(C는 헤더의 h 32 보조 버튼). 필터된 행만, 열은 마스터 14필드. 메뉴의 `downloadCsv`를 import하지 않고 프로토타입 안에 blob으로 만든다. 체크 열이 있으면(A·B, 너비 36) 그건 내보내기 범위 표시일 뿐 Selection이 아니다. C는 체크 열 없이 필터된 전체를 보낸다.
- **권한(§17).** 내비는 `visibleMenus`만. `/equipment`는 `route.menu.id === 'equipment-master'`이고 `can('equipment:view')`일 때만 변형 페이지. 아니면 `RouteOutlet`(금지 ≠ 빈 목록). Scope `none`/`validating`/`unknown_scope`/`forbidden`이면 테이블 대신 `PlatformPage`와 같은 `t()` 문구의 게이트. 빈 결과와 권한 거부를 한 문장으로 합치지 않는다.
- **슬롯.** 제목, 즐겨찾기, 설명(ⓘ), 신뢰 한 줄, 콘텐츠. 페이지가 두 번째 전역 바를 넣지 않는다. `?variant=`가 있으면 Provider `slots.contextBar`는 `null`(안 그러면 `PlatformPage`가 기존 바를 다시 그린다). `topBarTools`는 유지하고 각 셸의 지정 자리에 `<DevTools />` 대신 `slots.topBarTools`를 렌더한다.
- **팔레트·즐겨찾기·최근·한/EN.** `CommandPalette`를 셸 안에 마운트하고 ⌘K는 `setPaletteOpen(true)`. 즐겨찾기는 `toggleFavorite`. 최근은 `recent` 상위 5개, `PlatformLink`로 `r.url`. 한/EN은 **프로필 메뉴 안의 라디오**(`setLang`). 파란 세그먼트 금지. 언어 변경은 URL을 건드리지 않는다. `[`는 안마다 지정한 접기만 토글하고, input/textarea/select/contenteditable 포커스 중에는 무시.
- **신뢰(§18).** 조회 `trust`가 있을 때만 한 줄: 상태 점 + 헤드라인 + 커버리지 + 갱신 시각. 클릭 팝오버에 Updated / Data through / Coverage / provisional / source / assessment. `unknown`을 정상으로 접지 않는다. 오류로 `trust === null`이면 줄을 숨긴다.
- **드로어(§20).** `focus` 페이지 파라미터. 행을 열어도 Selection은 안 바뀐다. 체크박스는 내보내기용이며 `setGlobal`을 호출하지 않는다. Esc로 닫기. "전체 화면"은 `linkTo('equipment-detail', { params: { equipmentId }, returnTo: true })`. 1440에서 비모달(목록이 살아 있음). 1280 동작은 안마다 지정.
- **오류 두 층.** 페이지 배너 하나 + 테이블 본문의 한 줄. `StateView` 분홍 박스를 쓰지 않는다. 배너와 위젯이 같은 correlation id를 한 번씩만 보여 준다.
- **데이터.** `@ap/menu-equipment`를 import하지 않는다. `serve({ global, signal, mergeTimeDomain: false, compute: ({ equipment }) => equipment })`를 `usePlatformQuery`로 호출(`scope.status === 'valid'`일 때만). 필터는 로컬: `q`는 id+name, `status`, `maker`. 상태 문구: 사용중/대기/정비/유효 종료. 식별자·마스터 값은 번역하지 않는다.
- **1280.** 세 안 모두 표는 자기 영역 안에서만 가로 스크롤. 하단 전환 바가 Context 버튼을 가리면 콘텐츠 하단에 48px를 더한다.

폰트는 이미 로드된 Inter + Noto Sans KR. 숫자·시각은 `tabular-nums`. 모노는 `ui-monospace`.

## A — Linear / Vercel

넓은 상단 바 없음. 밝은 좁은 사이드바가 내비의 전부. Context는 제목 바로 아래의 얇은 칩 줄. 페이지 필터는 그 아래, 테두리 없는 칩.

```
┌ 220 ┬ content ───────────────────────────────────────────────┐
│분석 │ 설비관리 / 설비 마스터                                  │ 28
│검색 │ 설비 마스터 ★ ⓘ                    ● 이슈 없음 · 98.7% │ 36
│개요 │ 모든 화면 [ICH 텍스트] [7일 참조] [room] [그룹] [설비]  │ 36
│설비 │          링크 복사   초기화                            │
│ 마스터│ 이 화면  [검색____] [상태: 전체] [Maker: 전체]  초기화 │ 40
│…    │ ID    설비명    room    Maker   Model   상태   변경 시각│ 32+36n
│즐겨 │ (카드 없음, 줄 사이 실선만)                            │
│최근 │                                                        │
│아바타│                                                       │
└─────┴────────────────────────────────────────────────────────┘
```

- **사이드바.** 220 / 접힘 48(`[`). 배경 `#f7f7f8`, 오른쪽 1px `#ececee`. 브랜드 40px, 13px/600 `#18181b`. 접근 가능 공간이 2개 이상일 때만 이 줄이 전환 버튼. 아니면 "분석" 텍스트. 검색 32px, margin 8, 흰 배경, 1px `#ececee`, radius 6, 12px. 이 입력은 `visibleMenus` 라벨만 거른다. ⌘K는 팔레트(입력이 팔레트를 대신하지 않음). 항목 높이 28, margin-inline 8, padding 8, radius 6, 13px/450 `#3f3f46`, 아이콘 16 `#71717a`. 호버 `#efeff1`. **활성: 배경 `#ececee`, 글자 `#18181b`, weight 560. 파란 채움·왼쪽 바 없음.** 그룹 라벨 11px/500 `#71717a`, sentence case, 대문자 추적 없음. 즐겨찾기·최근은 같은 항목 치수. 바닥: 아바타 24 + 이름 12. 프로필 메뉴에 한/EN. 플라스크(`slots.topBarTools`)는 바닥의 28px 버튼, 1px dashed `#d4d4d8`.
- **상단 바.** 없음. Scope는 Context 칩 중 첫 칸이며 편집기는 그 칩의 팝오버뿐이다.
- **Context.** 제목 밑 36px, 배경 없음. 라벨 "모든 화면" 11px/500 `#71717a`. 칩 높이 26, 1px `#ececee`, radius 6, 라벨 12px `#71717a`, 값 12px/560 `#18181b`. 참조·미적용은 0절. 팝오버 너비 320, radius 8, 그림자 `0 8px 24px rgba(24,24,27,.08)`. 오른쪽 끝 "링크 복사""초기화"는 12px 텍스트 버튼 `#71717a`.
- **페이지 헤더.** 크럼 12px `#71717a`. h1 20px/600 `#18181b`, line-height 28, tracking -0.2px. 별 16px(비활성 `#a1a1aa`, 활성 fill `#ca8a04`). ⓘ 28px 버튼. 팝오버 320: `tx(menu.description)` + "위의 조건은 모든 화면에 전달됩니다. 아래 필터는 이 목록에만 적용됩니다." 본문에 설명 문단을 두지 않는다. 신뢰 줄은 제목 행 오른쪽.
- **페이지 필터.** 라벨 "이 화면". 검색 h 28 w 220. 상태·Maker는 버튼 "상태: 전체""Maker: 전체"(네이티브 select 금지), 목록 행 32, 선택 체크 `#5e6ad2`. 값 없으면 "필터 초기화"를 숨긴다. `resetContext`를 호출하지 않는다.
- **표.** 기본 열만: 설비 ID, 설비명, room_name, Maker, Model, 상태, 변경 시각. 나머지는 드로어. 카드·세로선·얼룩말 없음. 헤더 32px, 12px/500 `#71717a`, sentence case. 행 36, 13px `#18181b`, 아래 테두리 `#f4f4f5`. 호버 `#fafafa`. 활성 행 `#f4f4f5`. ID 12px 모노. 변경 시각 오른쪽 정렬. 상태: 알약 없음, 6px 점 + 12px. 사용중 `#1f8a4c`, 대기 `#71717a`, 정비 `#b45309`, 유효 종료 `#a1a1aa`. 행 클릭이 `focus`. 페이지 크기 25. 이전/다음은 12px 텍스트.
- **드로어.** 440px. 1280 이상 비모달, 스크림 없음, 본문 `padding-right: 440px`, 위 0, 그림자 없음, 왼쪽 1px `#ececee`. 제목 16px/600 모노(ID). 탭은 밑줄(활성 2px `#18181b`). 패딩 20. 속성 탭에 14필드를 모두. 유효구간 탭은 그 행의 `validFrom`/`validTo`/`chamberType`만. Audit 탭은 `updatedAt`/`updatedBy`만, 그리고 한 줄: "프로토타입: 행의 변경 시각·변경자만. AuditTimeline은 본 구현에서 연결."
- **오류.** 배너: 제목 바로 아래 36px, 배경 `#fef2f2`, 왼쪽 4px `#b91c1c`, 13px `#991b1b`, "조회 실패 · Upstream mart query failed · {id}", 텍스트 "재시도"는 `refetch`만(시나리오는 안 끔). 위젯: 테이블 바디의 한 행 48px, 아이콘 14 + 13px 메시지 + 11px 모노 id + 재시도. 필터 줄은 남긴다.
- **토큰.** canvas `#fafafa` surface `#ffffff` border `#ececee` border-strong `#e4e4e7` text `#18181b` secondary `#3f3f46` muted `#71717a` faint `#a1a1aa` primary `#5e6ad2`(포커스 링 `rgba(94,106,210,.45)`·링크·팝오버 체크만. 내비 활성에 쓰지 않음) primary-soft `#eef0ff` success `#1f8a4c` warning `#b45309` danger `#b91c1c` danger-soft `#fef2f2`. radius 4/6/8. 공간 8/12/16/24(1440 콘텐츠 좌우 32, 1280은 24). 크기 11/12/13/20.

## B — Datadog / Grafana

사이드바 없음. 48px 아이콘 레일 + 44px 상단 바. **전역 Context는 상단 오른쪽 툴바.** 페이지 안에는 Context 바가 없다. 표는 테두리 있는 밀집 패널.

```
┌48┬ top 44: 분석/설비관리/설비 마스터  [ICH][기간][room][그룹][설비][미적용] 복사 초기화 ⌘K flask 👤┐
│▣ ├ 36: 설비 마스터 ★ ⓘ                                      ● trust                              │
│  ├ panel ┌ 페이지 | 검색 | 전체 사용중 대기 정비 종료 | Maker ▾ ─────────────────────────────┐ │
│  │       │ 14열, 행 32, 짝수 얼룩말, 패널 안에서만 가로 스크롤                               │ │
│  │       └──────────────────────────────────────────────────────────────────────────────────┘ │
└──┴──────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **레일.** 48×전체 높이, `#111827`. 아이콘 버튼 40×32, radius 4, 아이콘 18 `#9ca3af`. 호버 `#1f2937`. **활성 그룹: 아이콘 `#fff`, 왼쪽 2px `#fff`. 보라 채움 없음.** 클릭은 232px 플라이아웃(`#1f2937`, 글자 `#e5e7eb`, 항목 32px/13px, 활성 항목 배경 `#374151` weight 560). 플라이아웃에 그룹 항목·즐겨찾기·최근. 브랜드 마크는 레일 맨 위, 공간이 2개 미만이면 툴팁 "분석"만. `[`는 플라이아웃 고정(본문이 232px 밀림) / 오버레이를 토글. 기본은 오버레이.
- **상단 바 = Context.** 높이 44, `#fff`, 아래 1px `#e6e8eb`, padding 0 12. 왼쪽 경로 12px, 현재 페이지만 12px/560 `#111827`. 오른쪽 컨트롤은 전부 높이 28, radius 4, 배경 `#f3f4f6`, 테두리 없음, 12px/500. 순서: Scope(점 6px + 라벨, 팝오버 너비 288, 단일 선택), 기간(요약 문자열, 팝오버 300에 1일/7일 세로 버튼 높이 32와 사용자 지정), room("room 2" 또는 "room 전체"), 그룹, 설비("설비 4" / "설비 전체" / 공집합이면 "설비 0"), 미지원이 있으면 "미적용 n"(dashed 1px `#9ca3af`). 그 다음 텍스트 "복사""초기화"(12px `#6b7280`), ⌘K 28px, `slots.topBarTools`, 아바타 24(메뉴에 한/EN). 1280에서 경로를 먼저 말줄임. 컨트롤 최소폭: Scope 72, 기간 168, room/그룹/설비 각 72. 한 줄에 안 들어가면 컨트롤만 두 번째 44px 줄로 줄바꿈하고, 컨트롤을 빼지 않는다.
- **페이지 헤더.** 36px. h1 16px/600. 별·ⓘ는 A와 같은 동작, 아이콘 14px. 설명 문단 없음. 신뢰는 오른쪽.
- **페이지 필터.** 패널 헤더 36px 안. 왼쪽 눈금 "페이지" 10px/600 `#9ca3af`(이 눈금만 자간 0.04em). 검색 h 26 w 200 radius 2. 상태는 세그먼트(전체/사용중/대기/정비/유효 종료), 높이 26, radius 2, 선택 `#111827` 글자 `#fff`, 비선택 `#374151`. Maker는 26px 버튼. 네이티브 select 없음.
- **표.** 14열 전부. 패널 1px `#e6e8eb`. 헤더 28px `#f3f4f6`, 11px/600 sentence case `#374151`. 행 32, 12px. 짝수 행 `#f7f8fa`. 가로선만 `#eef0f2`. 시각 열 오른쪽. 상태 알약 높이 18, padding 0 6, radius 2, 10px/600. 사용중 `#e7f6ee`/`#0e7c3a`, 대기 `#f3f4f6`/`#4b5563`, 정비 `#fef3c7`/`#92400e`, 유효 종료 `#f3f4f6`/`#6b7280`. 활성 행: 왼쪽 2px `#632ca6`, 배경 `#f5f3ff`.
- **드로어.** 360px, top 44, 1280 이상 비모달, 본문 padding-right 360, 그림자 없음, 왼쪽 1px `#e6e8eb`. 제목 14px/600 모노. 탭은 필터와 같은 26px 세그먼트. 패딩 12. 필드 행 28, 라벨 11px `#6b7280`. 탭 내용은 A와 같은 데이터 제한.
- **오류.** 배너: 상단 바 바로 아래 28px, 레일 제외, `#fff7ed`, 글자 12px `#9a3412`, 아래 1px `#fed7aa`. 위젯: 패널 바디의 40px 한 줄(아이콘 14, 12px, 11px 모노, 재시도). 패널 헤더의 필터는 남긴다.
- **토큰.** canvas `#f4f5f7` surface `#ffffff` rail `#111827` rail-text `#d1d5db` border `#e6e8eb` text `#111827` secondary `#374151` muted `#6b7280` faint `#9ca3af` primary `#632ca6`(포커스 링 `rgba(99,44,166,.45)`과 활성 행 바만. 세그먼트 선택은 `#111827`) success `#0e7c3a` warning `#b45309` danger `#c2410c` danger-soft `#fff7ed`. radius 2/4. 페이지 패딩 12, 패널 간격 8. 크기 10/11/12/13/16.

## C — Stripe Dashboard

밝은 240px 사이드바는 **구역 라벨**이 있고, 상단 바는 검색·Scope·프로필만 있다. Context는 제목 아래의 **한 줄 요약 띠**. 페이지 필터는 밑줄 탭 + "필터 추가". 표는 카드가 없고 첫 열이 굵다.

```
┌ 240 ┬ top 56: [ 메뉴 검색  ⌘K          ]          ICH ▾   flask  ?  이름 ▾ ┐
│ 분석 ├ 설비 마스터 ★                                                            │
│      │ 한 줄 설명(≤80자) ⓘ                          [CSV]  ● trust            │ 96
│ 개요 ├ 띠: ICH · 7일(참조) · room 2 · 그룹 · 설비 4 · Lot 미적용   복사 초기화 │ 40
│ 설비 ├ 전체  사용중  대기  정비  유효 종료    [+ 필터 추가]         [검색___] │ 48
│  마스터│ ID(굵게)  설비명(중간)  room  라인  StGroup  상태  유효 시작           │ 44n
│ 기준 │ (바깥 카드 없음)                                                        │
│ 즐겨 │                                                                        │
└──────┴─────────────────────────────────────────────────────────────────────────┘
```

- **사이드바.** 240 / 접힘 64(`[`). `#fff`, 오른쪽 1px `#e6ebf1`. 브랜드 56px, 14px/600 `#0a2540`. 공간 규칙 동일. **구역 라벨만** 11px/600 `#697386`, uppercase, tracking 0.06em, padding 16px 12px 4px. 항목 높이 32, margin-inline 8, padding 8, radius 6, 14px/440 `#425466`, 아이콘 16. 하위 항목 indent 28. 호버 `#f6f9fc`. **활성: 배경 `#f6f9fc`, 글자 `#0a2540`, weight 560. 블러플 채움·왼쪽 바 없음.** 사이드바에 검색창 없음(검색은 팔레트). 즐겨찾기·최근은 같은 구역 라벨. 접기 버튼은 내비 바닥 32px.
- **상단 바.** 56px `#fff`, 아래 1px `#e6ebf1`, padding 0 24. Context를 넣지 않는다. 검색은 버튼(입력처럼 보임) h 36 w 320(1280에선 200), 배경 `#f6f9fc`, radius 6, 14px, ⌘K. 클릭은 팔레트만. Scope는 테두리 없는 32px 텍스트 버튼, 14px/560 `#0a2540`, 점 8px. 팝오버 288. 이 버튼이 **유일한** Scope 편집기다. flask, 도움말(단축키만: ⌘K, `[`, Esc), 프로필(아바타 28 배경 `#f0efff` 글자 `#635bff`. 1440에서 이름 14px/560, 1280에선 아바타만). 한/EN은 프로필 메뉴.
- **페이지 헤더.** padding 24px 32px 0. h1 28px/600 `#0a2540`, line-height 36, tracking -0.4px. 별은 제목 오른쪽 8px, 18px. 설명이 80자 이하면 14px/400 `#425466` 한 줄(설비 마스터 설명은 이 안에 들어온다). 넘치면 본문에서 빼고 ⓘ에만. ⓘ에는 항상 전문 + A와 같은 한 줄 구분 문장. 오른쪽: 보조 버튼 "CSV" 높이 32(필터된 행)와 신뢰 줄.
- **Context 띠.** margin 32px 16px 0, 높이 40, 배경 `#f6f9fc`, radius 6, padding 0 12. 13px `#0a2540`, 구분자 ` · ` `#697386`. Scope 토큰은 **텍스트**(편집하지 않음). 기간·room·그룹·설비·미적용 토큰만 버튼, 호버 밑줄, 팝오버는 0절 편집기. 오른쪽 "링크 복사""초기화" 13px `#635bff`.
- **페이지 필터.** 높이 48, padding 0 32, 아래 1px `#e6ebf1`. 상태는 밑줄 탭(전체/사용중/대기/정비/유효 종료), 14px, 간격 20, 활성 `#0a2540` weight 560 + 밑줄 2px `#635bff`, 비활성 `#697386`. "+ 필터 추가"는 h 28, radius 6, dashed 1px `#cfd7df`, 13px. 메뉴에는 Maker만. 고르면 칩 "Maker: {값} ×"과 값 팝오버(로드된 행의 maker). 검색은 오른쪽 h 32 w 240, 1px `#e6ebf1`. 필터가 있을 때만 "필터 초기화".
- **표.** 카드 없음. 보이는 열: 설비 ID, 설비명, room_name, 라인, StGroup, 상태, 유효 시작. 헤더 36px, 12px/500 `#697386`, sentence case, 아래 1px `#e6ebf1`. 행 44, 아래 1px `#e6ebf1`, 호버 `#f6f9fc`, 얼룩말 없음. **ID 13px/600 `#0a2540`**, 설비명 13px/400 `#425466`, 나머지 13px/400 `#697386`, 유효 시작은 오른쪽 `#425466`. 상태 배지 h 22, padding 0 8, radius 4, 12px/560. 사용중 `#cbf4c9`/`#0e6245`, 대기 `#e6ebf1`/`#425466`, 정비 `#fce9c8`/`#9a6700`, 유효 종료 `#e6ebf1`/`#697386`. 활성 행 `#f0efff`. 동작 열 없음. ID 버튼이 `focus`.
- **드로어.** 480px, top 56, 패딩 24, 제목 20px/600. **1440 이상:** 비모달, padding-right 480, 그림자 없음. **1280–1439:** 오버레이, 스크림 `rgba(10,37,64,.45)`, `#root` inert, 그림자 `-8px 0 24px rgba(10,37,64,.08)`. 탭은 페이지와 같은 밑줄. "전체 화면"은 h 32 보조 버튼. 탭 데이터는 A와 같다.
- **오류.** 배너: 헤더와 Context 띠 사이, margin 32/16/0, padding 10px 12px, `#fff`, 1px `#ffccd2`, 왼쪽 3px `#df1b41`, radius 6, 메시지 14px `#0a2540`, id 12px 모노 `#697386`, "재시도" h 28 배경 `#0a2540` 글자 `#fff` radius 6. 위젯: tbody의 64px 한 행, 같은 3px 바, 14px 메시지, "재시도"는 텍스트 `#635bff`. 탭과 헤더는 남긴다.
- **토큰.** canvas `#f6f9fc` surface `#ffffff` border `#e6ebf1` text `#0a2540` secondary `#425466` muted `#697386` faint `#8898aa` primary `#635bff`(링크, 활성 밑줄, 복사/초기화. 포커스 링 `rgba(99,91,255,.45)`. 내비 활성은 회색) primary-soft `#f0efff` success `#0e6245` success-soft `#cbf4c9` warning `#9a6700` warning-soft `#fce9c8` danger `#df1b41` danger-soft `#fff` + border `#ffccd2`. radius 4/6/8. 콘텐츠 좌우 32(1280은 24). 크기 11/12/13/14/28.

## 구조가 갈리는 지점

| | A | B | C |
| --- | --- | --- | --- |
| 내비 | 220 밝은 사이드바 | 48 레일 + 플라이아웃 | 240 구역 라벨 사이드바 |
| 상단 바 | 없음 | 44, Context가 오른쪽 | 56, 검색·Scope·프로필만 |
| Context | 제목 밑 칩 줄 | 상단 툴바 | 요약 문장 띠. Scope는 읽기 전용 |
| 페이지 필터 | 항상 보이는 칩 2개 | 패널 안 세그먼트 | 밑줄 탭 + 필터 추가 |
| 표 | 7열, 행 36, 카드 없음, 점 | 14열, 행 32, 패널, 알약 | 7열, 행 44, ID만 굵게, 배지 |
| 드로어 | 440 밑줄, 항상 밀기 | 360 세그먼트, 항상 밀기 | 480, 1440 밀기 / 1280 오버레이 |

한 안의 색을 다른 안에 입히지 않는다. 활성 내비를 primary로 칠하지 않는다.

## 프로토타입 구현 (별도 구현자)

위치: `apps/platform-web/src/dev/design-prototype/`만. 예외는 `apps/platform-web/src/main.tsx`의 분기뿐이다. `packages/*` 수정 금지. 테스트 금지. `@ap/mock-server`는 패키지 엔트리만(`src/dev/**` carve-out, 서브패스 금지). import 금지: `@ap/menu-equipment`.

파일과 순서:

1. `tokens.css` — `[data-variant="A|B|C"]`에 위 토큰을 `--dp-*`로. 셸은 이 변수만 쓴다.
2. `context-editors.tsx` — 기간·room·조건·Selection·미적용 팝오버 **본문**만. 트리거 크롬은 받지 않는다(각 셸이 버튼만 만든다).
3. `equipment-query.ts` — `serve` + 로컬 필터 + 열 정의(id, 한/영 라벨, 정렬). 행 정렬·25쪽 분할은 여기 10줄.
4. `drawer.tsx` — `variant`로 너비·top·밀기/오버레이·탭 모양만 갈림. 필드 내용은 하나.
5. `equipment-a.tsx` `equipment-b.tsx` `equipment-c.tsx` — 헤더·필터·표·배너. `PlatformDataTable`/`PlatformPage`/`StateView`를 쓰지 않는다(대문자 헤더와 분홍 박스가 다시 들어온다).
6. `shell-a.tsx` `shell-b.tsx` `shell-c.tsx` — 내비·Context 트리거·`slots.topBarTools`·본문. `pathname === '/equipment'`이고 권한·메뉴 id가 맞으면 해당 equipment 페이지, 아니면 `RouteOutlet`.
7. `switcher.tsx` — 하단 중앙, z-index 70, 높이 36, pill `#111827` 글자 `#fff`(평가 대상이 아님). 라벨은 정확히 `A — Linear/Vercel`, `B — Datadog/Grafana`, `C — Stripe Dashboard`. ←/→ 클릭과 키. `navigate(replace)`로 `variant`만 바꾸고 scope·기간·페이지 키는 유지. `import.meta.env.DEV`가 아니면 렌더하지 않음. 같은 바 오른쪽, 1px `#3f3f46`로 구분된 "위젯 오류" 토글: `useSyncExternalStore(subscribeServer, getScenario)`, 켜면 `setScenario('error')`, 끄면 `setScenario('normal')`.
8. `frame.tsx` — `usePlatform().url`에서 `variant`를 읽는다. 없으면 `AppShell`+`RouteOutlet`. 있으면 `data-variant` 래퍼, 해당 셸, `CommandPalette`, `usePlatform().toasts`로 만든 로컬 토스트(AppShell을 고치지 말 것), 스위처.
9. `main.tsx` — Provider 안쪽에 `frame`을 둔다. `slots.contextBar`는 `variant`가 있으면 `null`, 없으면 `<GlobalContextBar />`. `topBarTools: <DevTools />`는 유지. `variant`는 클라이언트 이동 후에도 `usePlatform().url`로 다시 읽는다.

확인 URL: `http://127.0.0.1:5173/equipment?scopeId=ICH&variant=A` (B, C). 볼 것: 세 안의 내비·Context 위치·필터 형태가 표와 다르게 보이는지, 한/EN이 URL을 안 바꾸는지, 미지원 `lotIds`가 "미적용"으로 남는지, 위젯 오류 토글이 배너 하나 + 표 안 한 줄만 만드는지, 다른 메뉴 클릭이 `RouteOutlet`으로 가는지, 1280에서 상단 컨트롤이 사라지지 않는지.
