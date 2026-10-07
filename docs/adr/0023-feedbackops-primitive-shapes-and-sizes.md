# 플랫폼은 FeedbackOps 부품의 모양과 크기를 덮어쓰지 않는다

상태: **Decided (2026-10-07)**.
- 결정자: 사용자 — 실제 앱 위 `?variant=` 시안(#228, 브랜치 `hjung3113/proto-228-fops-shapes`)에서 A(현재 · 플랫폼 덮어쓰기)/B(FeedbackOps 모양 · 지금 크기)/C(FeedbackOps 모양 · FeedbackOps 크기)를 보고 "니추천대로 하고 feedbackops스타일은 최대한 유지하는방향으로"라고 했다. 권장안은 C였다.

플랫폼은 FeedbackOps `@fops/ui`를 `@ap/ui`로 다시 내보내 디자인 시스템을 공유한다([ADR-0010](0010-feedbackops-design-system-shared-on-tailwind-v4.md), [ADR-0011](0011-design-direction-feedbackops-shell.md)). 그런데 공통 컴포넌트·셸·메뉴 83곳이 `className`으로 버튼·팝오버·라벨·입력의 모양을 바꿔 쓰고 있었다(작은 버튼 28px·12px 글자·4px 반경, 흰 카드 팝오버 등). [DESIGN.md](../../DESIGN.md)는 이미 "primitive 모양은 FeedbackOps 원본을 따르며 버튼·input을 독자적으로 재설계하지 않는다"고 정해 두었고, 디자인 lint(`@shadcn/lint`, FeedbackOps ADR-0062를 따름)가 이 덮어쓰기를 `no-restyle`로 잡는다. 규칙의 원본은 `tooling/AGENTS.md`와 DESIGN.md다.

## 결정

- 화면·공통 컴포넌트·셸은 `@ap/ui` 부품에 배치(레이아웃) 클래스만 준다. 컨테이너(`*Content`·`*Header`·`*Footer` 등)는 안쪽 여백도 줄 수 있다. 색·글자·반경·테두리·그림자는 FeedbackOps 기본값과 variant로 고른다.
- 크기도 FeedbackOps를 따른다. 작은 동작 버튼은 `size="toolbar"`, 아이콘 버튼은 `size="icon-xs"`·`"icon-sm"`, 그 밖은 `size="sm"`을 쓰고 높이 클래스로 버튼을 줄이지 않는다.
- 팝오버·드롭다운·툴팁은 FeedbackOps 표면(팝오버 표면·연한 테두리·기본 여백)을 쓴다.
- 플랫폼의 segmented 선택(`SegmentedRadio`)은 FeedbackOps segmented `RadioGroup` 위에 둔다.
- 기능에 필요한 처리(예: 검색창 아이콘 자리를 비우는 왼쪽 여백)는 FeedbackOps 부품·variant가 있으면 그것을 쓰고, 없으면 FeedbackOps처럼 그 줄에 이유를 단 예외로 남긴다. 여러 곳에서 반복되면 FeedbackOps에 variant를 먼저 올린다.
- 접근성 하한은 스타일보다 먼저다. 그래서 세 가지만 FeedbackOps 기본값 위에 남긴다.
  - 입력·select·체크박스처럼 경계로 조작 요소를 알아보는 곳은 [DESIGN 접근성 쌍](../../DESIGN.md#accessibility-pairing-rules)대로 경계만 `border-control`이다. FeedbackOps 기본 경계는 카드 표면 대비 약 1.4:1(`border-subtle`)·1.7:1(`border-strong`)로 WCAG 1.4.11의 3:1에 못 미친다.
  - 포커스를 돌려받으려고 `disabled` 대신 `aria-disabled`를 쓰는 버튼(표 복사·내보내기)은 비활성 모양을 `aria-disabled:` 클래스로 준다. FeedbackOps 버튼은 `disabled`일 때만 흐려진다.
  - FeedbackOps 메뉴 항목의 포커스 색은 팝오버 표면에서 거의 구별되지 않으므로, 키보드 포커스 링을 둔 항목은 링을 유지한다.
  - 표면·글자·크기는 이때도 FeedbackOps를 따르고, 세 처리는 FeedbackOps variant로 제안한다.

## Considered Options

- **(A) 현재 모양 유지 — `@ap/ui`에 플랫폼 전용 variant를 만든다**: 화면은 그대로지만 DESIGN.md의 "재설계하지 않는다"와 어긋나고, FeedbackOps와 플랫폼의 모양이 계속 갈라진다.
- **(B) FeedbackOps 모양 · 지금 크기**: 색·글자·반경은 맞추지만 버튼 높이를 화면마다 줄여 쓰는 덮어쓰기가 남는다.
- **(C, 채택) FeedbackOps 모양 · FeedbackOps 크기**: 두 제품이 같은 부품을 같은 모양으로 쓴다. 작은 버튼이 4px 높아지고 글자가 1px 커져, 좁은 차트 카드의 도구 막대가 한 줄 더 꺾일 수 있다(시안에서 확인).

## 결과

- #228이 공통 컴포넌트·셸·메뉴의 덮어쓰기 83곳을 걷어 내고, `no-restyle` suppressions를 비운다.
- 팝오버·드롭다운이 흰 카드에서 FeedbackOps 팝오버 표면으로 바뀌므로, 그 안의 작은 보조 글자는 DESIGN 허용 쌍대로 `text-muted`(4.47:1) 대신 `text-secondary`를 쓴다.
- 플랫폼이 FeedbackOps에 없는 모양이 필요하면 플랫폼에서 덮어쓰지 않고 FeedbackOps에 variant를 제안한다(서브모듈은 요청 범위에서만 고친다 — 루트 `AGENTS.md`).
- 시안 코드는 본 코드에 넣지 않는다.
