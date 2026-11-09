# #1189 홈·시스템 전환 시안 기록 (결정 보류)

- 상태: 소유자 결정 보류(2026-11-01). 지금 화면을 유지하고 나중에 고른다. main에 병합하지 않는다.
- 비교 페이지: `index.html`(브라우저로 열기, 이미지는 `img/`). 같은 내용의 Artifact: https://claude.ai/artifact/5HnvmEQeUZXJen2xfEfcBY
- 안별 설명·문구 표·구현 규모: `captions.md`. 조사와 진단: `research.md`.
- 시안 코드: 이 브랜치의 `packages/sdk/shell/src/frame/proto1189.tsx`·`SystemSwitcher.tsx` 등, `platform/home/src/pages/proto1189.tsx`. mock 앱에서 `/home?variant=A|B|C`.
- 리드 추천: A 조용한 목록.

## 2026-11-10 추가 기록 (전체 보류)

- 상태: 소유자 결정 보류(2026-11-10). 홈·시스템 전환 작업은 모두 멈추고 지금 화면을 유지한다. main에 병합하지 않는다.
- 위의 내용과 `index.html`, `captions.md`, `img/`는 1차 A·B·C(2026-11-01)이다.

| 폴더 | 내용 | 비교 페이지 | Artifact |
| --- | --- | --- | --- |
| `round2-2026-11-09-ABC/` | 2차 A·B·C. 소유자가 세 안 모두 반려 | `index.html` | https://claude.ai/artifact/3iHjN9d8csgBTj9nSJK44S |
| `round3-2026-11-10-DEF/` | D·E·F. 시스템이 합쳐지는 장기 방향을 반영, 고르기 전에 보류 | `index.html` | https://claude.ai/artifact/MN1m4BHXaAUXGifm2e6e3i |
| `research/` | 시스템 전환 제품 조사와 2차 조사 | - | - |

- 시안 코드: A·B·C는 `round2-2026-11-09-ABC/prototype-abc.diff`, D·E·F는 `round3-2026-11-10-DEF/prototype-def.diff`(기준 커밋 `d0b8e39d5`, `git apply` 확인, `?variant=` 시안이며 병합용 아님).
- 각 폴더의 `captions.md`는 캡처 설명, `design.md`는 안별 설계이다. D의 단계 메뉴 배치 2/9/1/1은 초안이고 소유자 확인 전이다.
- 리드 추천은 D였다. 어떤 안이든 ADR-0042, ADR-0102 등을 바꿔야 한다.
- 다시 여는 조건: 소유자가 홈·전환 작업을 재개하면 #1189에서 안을 고르고, 시안 코드를 버린 뒤 처음부터 구현한다.
