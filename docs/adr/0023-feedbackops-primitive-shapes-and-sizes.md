# 플랫폼은 FeedbackOps 부품의 모양과 크기를 덮어쓰지 않는다

상태: **Decided (2026-10-07)**. 디자인 시스템 결정의 원본 소유는 [ADR-0043](0043-platform-sdk-is-the-app-contract-and-unified-framework.md)(2026-10-19)으로 플랫폼으로 바뀌었다. 코드를 SDK로 옮기기 전까지는 이 ADR의 규칙대로 동작하고, 본문은 코드 이전 이슈에서 고친다.

개정 2026-10-15 (#340): 탭 선택 표식.
- 결정자: 사용자 — 실제 앱 위 `?variant=` 시안(#228, 브랜치 `hjung3113/proto-228-fops-shapes`)에서 A(현재 · 플랫폼 덮어쓰기)/B(FeedbackOps 모양 · 지금 크기)/C(FeedbackOps 모양 · FeedbackOps 크기)를 보고 "니추천대로 하고 feedbackops스타일은 최대한 유지하는방향으로"라고 했다. 권장안은 C였다.

플랫폼은 FeedbackOps `@fops/ui`를 `@ap/ui`로 다시 내보내 디자인 시스템을 공유한다([ADR-0010](0010-feedbackops-design-system-shared-on-tailwind-v4.md), [ADR-0011](0011-design-direction-feedbackops-shell.md)). 그런데 공통 컴포넌트·셸·메뉴 83곳이 `className`으로 버튼·팝오버·라벨·입력의 모양을 바꿔 쓰고 있었다(작은 버튼 28px·12px 글자·4px 반경, 흰 카드 팝오버 등). [DESIGN.md](../../DESIGN.md)는 이미 "primitive 모양은 FeedbackOps 원본을 따르며 버튼·input을 독자적으로 재설계하지 않는다"고 정해 두었고, 디자인 lint(`@shadcn/lint`, FeedbackOps ADR-0062를 따름)가 이 덮어쓰기를 `no-restyle`로 잡는다. 규칙의 원본은 `tooling/AGENTS.md`와 DESIGN.md다.

## 결정

- 화면·공통 컴포넌트·셸은 `@ap/ui` 부품에 배치(레이아웃) 클래스만 준다. 컨테이너(`*Content`·`*Header`·`*Footer` 등)는 안쪽 여백도 줄 수 있다. 색·글자·반경·테두리·그림자는 FeedbackOps 기본값과 variant로 고른다.
- 크기도 FeedbackOps를 따른다. 작은 동작 버튼은 `size="toolbar"`, 아이콘 버튼은 `size="icon-xs"`·`"icon-sm"`, 그 밖은 `size="sm"`을 쓰고 높이 클래스로 버튼을 줄이지 않는다.
- 팝오버·드롭다운·툴팁은 FeedbackOps 표면(팝오버 표면·연한 테두리·기본 여백)을 쓴다.
- 플랫폼의 segmented 선택(`SegmentedRadio`)은 FeedbackOps segmented `RadioGroup` 위에 둔다.
- 기능에 필요한 처리(예: 검색창 아이콘 자리를 비우는 왼쪽 여백)는 FeedbackOps 부품·variant가 있으면 그것을 쓰고, 없으면 FeedbackOps처럼 그 줄에 이유를 단 예외로 남긴다. 여러 곳에서 반복되면 FeedbackOps에 variant를 먼저 올린다.
- 접근성 하한은 스타일보다 먼저다. 그래서 네 가지를 FeedbackOps 기본값 위에 남긴다.
  - 입력·select·체크박스처럼 경계로 조작 요소를 알아보는 곳은 [DESIGN 접근성 쌍](../../DESIGN.md#accessibility-pairing-rules)대로 경계만 `border-control`이다. FeedbackOps 기본 경계는 카드 표면 대비 약 1.4:1(`border-subtle`)·1.7:1(`border-strong`)로 WCAG 1.4.11의 3:1에 못 미친다.
  - 포커스를 돌려받으려고 `disabled` 대신 `aria-disabled`를 쓰는 버튼(표 복사·내보내기)은 비활성 모양을 `aria-disabled:` 클래스로 준다. FeedbackOps 버튼은 `disabled`일 때만 흐려진다.
  - FeedbackOps 메뉴 항목의 포커스 색은 팝오버 표면에서 거의 구별되지 않으므로(약 1.1:1), 키보드로 갈 수 있는 메뉴 항목에는 inset 포커스 링을 둔다.
  - 위 세 처리는 표면·글자·크기를 FeedbackOps에 맞춘 채 적용하고 FeedbackOps variant로 제안한다.
  - 탭 선택 표식은 `@ap/ui`의 `TabsList`·`TabsTrigger`가 정의한다. 표면·글자·선택 모양의 예외 범위는 아래 개정 절을 따른다.

## Considered Options

- **(A) 현재 모양 유지 — `@ap/ui`에 플랫폼 전용 variant를 만든다**: 화면은 그대로지만 DESIGN.md의 "재설계하지 않는다"와 어긋나고, FeedbackOps와 플랫폼의 모양이 계속 갈라진다.
- **(B) FeedbackOps 모양 · 지금 크기**: 색·글자·반경은 맞추지만 버튼 높이를 화면마다 줄여 쓰는 덮어쓰기가 남는다.
- **(C, 채택) FeedbackOps 모양 · FeedbackOps 크기**: 두 제품이 같은 부품을 같은 모양으로 쓴다. 작은 버튼이 4px 높아지고 글자가 1px 커져, 좁은 차트 카드의 도구 막대가 한 줄 더 꺾일 수 있다(시안에서 확인).

## 결과

- #228이 공통 컴포넌트·셸·메뉴의 덮어쓰기 83곳을 걷어 내고, `no-restyle` suppressions를 비운다.
- Context 바 칩처럼 FeedbackOps에 없는 플랫폼 부품은 플랫폼 확장으로 둔다. 넘침 버튼은 FeedbackOps `Button`을 덮어쓰지 않고 이웃 칩과 같은 칩 모양을 쓴다(#240).
- 팝오버·드롭다운이 흰 카드에서 FeedbackOps 팝오버 표면으로 바뀌므로, 그 안의 작은 보조 글자는 DESIGN 허용 쌍대로 `text-muted`(4.47:1) 대신 `text-secondary`를 쓴다.
- 플랫폼이 FeedbackOps에 없는 모양이 필요하면 플랫폼에서 덮어쓰지 않고 FeedbackOps에 variant를 제안한다. 탭 선택 표식 예외는 아래 개정 절을 따른다(서브모듈은 요청 범위에서만 고친다 — 루트 `AGENTS.md`).
- 시안 코드는 본 코드에 넣지 않는다.

## 개정 — 탭 선택 표식 (2026-10-15)

- 결정자: 사용자 — 실제 앱 `?variant=` 시안(브랜치 `hjung3113/proto-340-tab-marker`)에서 A(현재)/B(밑줄 막대+굵기)/C(pill 유지+선택 테두리)/D(패널에 붙은 탭)를 보고 B를 선택했다. 권장안도 B였다. 상세 패널과 설비 상세 전체 화면에 함께 적용한다.
- 문제: 플랫폼 테마에서 FeedbackOps 탭의 `surface-raised`와 `surface-card`가 같아 선택 탭이 글자색만으로 구별된다. 색 외 표식과 비텍스트 대비를 요구하는 WCAG 1.4.1·1.4.11을 충족하는 선택 표식이 필요하다.
- 결정: `@ap/ui`의 `TabsList`·`TabsTrigger`만 FeedbackOps 부품을 감싼 플랫폼 구현으로 둔다. `Tabs`·`TabsContent`와 역할·`aria-selected`·화살표 키·포커스 이동은 FeedbackOps를 유지한다. 소비자는 모양을 덮어쓰지 않는다.
- 표식: 평평한 가로 스크롤 목록의 1px `border-subtle` 기준선 위에 선택 탭의 2px `accent-primary` 아래 막대와 `font-semibold`를 쓰고, 비선택은 `text-secondary`로 둔다. 기준선은 inset shadow이고 고대비에서는 1px 전경색 아래 테두리로 남는다. 막대는 형제 자식이 아니라 트리거 자신의 `::after`(`bottom-0`)로 그려 `asChild` 슬롯도 단일 요소 자식을 유지하며, 고대비에서는 전경색 2px 아래 테두리로 그린다. 포커스 외곽선은 -2px offset으로 탭 안쪽에 그린다. 문자열·숫자 라벨은 숨은 굵은 복사본으로 폭을 예약하되 접근 이름에는 포함하지 않는다.
- FeedbackOps 저장소는 수정하지 않고 이 선택 표식을 variant로 제안한다.
- C를 고르지 않은 이유: 선택 탭이 외곽선 버튼처럼 보이고 고대비에서 비선택에도 테두리가 생긴다.
- D를 고르지 않은 이유: 좁은 패널에서 선이 많고 포커스 때 겹친다.
