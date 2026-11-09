# AP DevKit: 이슈 대조와 카탈로그 PoC

근거 기록이며 권위 원본이 아니다. 설계는 [SDK 소비자 스킬 설계](../design/devkit-sdk-consumer-skill.md)가 소유한다. 기준: `main` @ 2ff629b3f (2026-11-09).

## 이슈 본문 대조

판정: 일치, 낡음(당시 맞았으나 지금은 다름), 틀림, 공백(이슈가 기대하지만 코드에 없음), 미확인. #1206의 기준 커밋 `3d05fd1`(2026-11-01)은 현재 `main`보다 263커밋 뒤다.

### #1207

| 주장 | 판정 | 현행 |
| --- | --- | --- |
| 대상은 ui·components·kernel·contracts·shell | 일치 | `tooling/sdk/sdk-exports.mjs`의 `SDK_PACKAGES` 다섯 |
| 권위 원본 `AGENTS.md`, `DESIGN.md`, `GLOSSARY.md`, `docs/contract/` 여섯 | 일치 | 모두 있음 |
| 스킬 소스 `.agents/skills`, OpenCode·OMP·Claude는 심볼릭 링크 | 일치 | Grok도 링크, Codex는 직접 읽음 |
| `pnpm gen:menu`가 기존 메뉴 생성기, `--dry-run` | 일치 | 앱의 `GROUPS`에 기대므로 이 저장소 전용 |
| `sdk:api`·`sdk:schemas`·`sdk:consumer-check`가 토대 | 일치 | `sdk:api`는 빌드된 `dist`, `sdk:consumer-check`는 `sdk:pack` 산출물이 필요 |
| 내부 직접 import를 lint·typecheck로 차단 가능 | 일치(저장소 안), 공백(밖) | 메뉴 패키지에서 ESLint 실행: 깊은 `@ap/components/src/...`, `dockview-react`, `dockview-core`, `@ap/kernel/host`, `@ap/shell` 모두 `no-restricted-imports`로 실패. tsc는 깊은 import만 TS2307로 실패. 경계 lint(`@ap/eslint-config`)는 릴리스되지 않아 다른 저장소에서는 깊은 import만 막힌다 |
| 패널 Context는 #911 상태에 맞춰 | 일치 | #911 열림, 타입 이름은 설계 후보. `PanelDefinition` 등 코드 0건. `panelContext.ts`는 패널 안 제목 처리 내부 파일로 무관 |
| "허용 Context 역할" | 공백 | 어휘가 없다. 있는 것은 엔드포인트 단위 `projectContext`(`@ap/contracts`), `useQueryContext`, 다른 저장소 모듈용 `ModuleHost` |
| "#911 기준 query/display projection 예제 조회" | 공백 | 패널 단위 투영 코드도 예제도 없다 |
| "승인된 예제"에서 구축 | 공백 | 예제 묶음이 없다. SDK 테스트 381개는 상대 import라 사용 예제로 쓸 수 없다 |
| 차트·테이블·필터 의도어 | 일치 | `AnalysisChart`, `AnalysisChartFrame`, `EChart`, `LegendTree`(범례 트리), `PlatformDataTable`, `PageFilterBar`, `ActiveFilterBar` |
| 분할·보드 의도어 | 공백(이름 다름) | `Split` 이름의 공개 부품 없음. 분할은 `PanelWorkspace`, 보드는 셸 전용 `OpenInBoardAction`이라 메뉴가 쓸 수 없다 |
| 메뉴 시나리오 `gen:menu --dry-run → typed scaffold` | 일치(저장소 안) | 다른 저장소에는 생성기가 없다 |
| 오류의 `ruleId`, 경로, 줄 | 일치(일부) | ESLint·tsc가 준다. 기대 계약과 추천 API는 구조화돼 있지 않고 메시지 문장에 일부 들어 있다 |
| Storybook stories 없음 | 일치 | 파일과 의존 0건 |
| `apps/feature-screens`의 데모·카탈로그 재사용 가능성을 먼저 검증 | 공백 | 검증 결과 쓸 것이 없다. 부품 갤러리가 없고, 이 이름의 파일은 업무 도메인 목록이다 |
| OpenCode·OMP 실행기 | 일치 | 이 기계에 설치됨 |
| 명령 `pnpm ap:devkit` | 일치 | 충돌하는 스크립트 없음 |

### #1206

| 주장 | 판정 | 현행 |
| --- | --- | --- |
| 데스크톱 캡처 범위 | 일치 | 루트 `AGENTS.md` |
| 시각 변경 전 `?variant=` 2–3안과 승인 | 낡음 | [ADR-0129](../adr/0129-prototype-only-for-new-or-hard-to-undo-ui.md): 새 화면이거나 되돌리기 어려운 변경에만 |
| `tooling/gen-menu/src/cli.ts`, `tooling/sdk/*`, `capture-page.sh`, `design-review.md` | 일치 | 모두 있음 |
| `apps/platform-e2e`의 계약·스크린샷·JSON 리포트 | 일치 | `contract-reporter.ts`가 `contract-report/results.json`을 쓴다(생성물) |
| #1141·#954와 경계 관리 | 낡음 | 둘 다 닫힘. #911·#870은 열림 |
| HW Time 파일럿 | 낡음(연결 이슈) | #911 본문의 `menus/analytics/hw-time`, `packages/components/...`는 지금 `menus/mars/hw-time`, `packages/sdk/components/...`다 |
| `agent-platform`은 별개 | 일치 | 저장소가 있다. Harness 내용은 미확인 |
| CLI는 `tooling/` 개발 전용, 저장소 안 우선 | 일치 | 소유자 결정(2026-11-10)으로 이번에는 저장소 안에서만 쓴다 |
| 실행 의존 #1210 → #1207 | 낡음 | #1210은 열림. 소유자가 #1207 착수를 지시했고 #1207에는 모델도 외부 전송도 없다 |
| 하위 이슈 #1208–#1210 | 일치 | 모두 열림 |
| 멀티모달·Vision·외부 조사 URL | 미확인 | #1208–#1210 범위로 이 대조에서 실행하지 않음 |

### 이슈 본문 밖의 이름

`ChartFrame`은 #1206·#1207 본문에 없다. 루트 `AGENTS.md`와 `chart.md`의 용어 Chart Frame에 대응하는 공개 이름은 `AnalysisChartFrame`이다.

### 이슈에 없던 충돌

- `in-house-rollout.md` §5는 사내 메뉴를 이 저장소의 `menus/`와 `GROUPS`에 더하는 절차로 쓴다. [ADR-0053](../adr/0053-host-module-contract-v1.md)의 다른 저장소 모듈은 `@ap/contracts`와 `@ap/ui`만 쓴다. [ADR-0056](../adr/0056-sdk-release-github-release-tarballs.md) 소비자는 다섯 패키지 모두를 설치할 수 있다. 다른 저장소의 소비자가 어느 쪽인지는 문서마다 다르다.
- EV 체크아웃(`2c1273a`, `sdk-v0.19.0` 고정) 대조: 루트에 `node_modules/@ap`가 없고 멤버에만 있다(`platform-adapter`는 contracts와 ui, `studio`·`editor`·`replay`·`ui`·`views`는 ui, `core`·`renderer`·`tooling`은 없음). `lint`는 루트의 `eslint .`뿐이고 `typecheck: tsc --noEmit`은 멤버에 있다. 루트 `typecheck`는 turbo 빌드를 먼저 돌린다. `apps/studio/src/studio.css:2`가 `@ap/ui/styles.css`를 import한다. `tooling/eslint-boundary.test.ts`에는 문자열로 쓴 import가 많고 `export *`, 동적 `import()`, `import()` 타입을 막는다. `eslint.config.js`가 AP의 `hostModule` 규칙을 손으로 옮겨 두었다.
- 낱말 카탈로그는 이미 Page Archetype `Catalog`, 규칙 카탈로그, 모델 카탈로그에 쓰인다.

## 카탈로그 PoC

TS `createProgram`을 다섯 패키지 `exports`의 `.ts(x)` 대상에 돌렸다. 빌드는 필요 없다. 저장소 밖 스크립트로 돌린 일회성 측정이며 벤치마크가 아니다.

- 3회 실행 1,301 / 1,098 / 1,074 ms (Apple Silicon, Node 26.7.0).
- 공개 export 935개, 진입점 10개: contracts 264, kernel 123 + host 30 + testing 12, ui 247 + theme 4, components 216 + testing 4 + dock 24, shell 11.
- 종류: function 294, const 160, class 8, type 415, interface 58. 분류 실패 0.
- 시그니처와 prop을 담은 JSON은 압축 430,328바이트. 계약 본문과 예제는 포함하지 않았다.
- 501개에 JSDoc이 없다.
- PascalCase 값 export 254개 중 호출 시그니처 209개, props 객체 125개. `forwardRef` 상수도 동작한다.
- `Button`의 prop 297개 중 289개는 `node_modules`에 선언돼 있다. 50개를 넘게 상속한 컴포넌트가 87개라 저장소에 선언된 prop만 남겨야 한다.
- 태그는 `@deprecated` 1건뿐이다. `@ap`는 본문의 `@ap/...`가 태그로 읽힌 것이다.

```js
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
const root = process.argv[2];
const ts = createRequire(join(root,'packages/sdk/contracts/package.json'))('typescript');
const PK=['contracts','kernel','ui','components','shell'];
const entries=[];
for(const p of PK){const j=JSON.parse(readFileSync(join(root,'packages/sdk',p,'package.json'),'utf8'));
 for(const [k,v] of Object.entries(j.exports)){ if(typeof v==='string'&&/\.tsx?$/.test(v)) entries.push({pkg:j.name,sub:k,file:join(root,'packages/sdk',p,v)});}}
const t0=Date.now();
const program=ts.createProgram(entries.map(e=>e.file),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,jsx:ts.JsxEmit.ReactJSX,strict:true,skipLibCheck:true,noEmit:true,lib:['lib.es2023.d.ts','lib.dom.d.ts','lib.dom.iterable.d.ts'],resolveJsonModule:true,allowImportingTsExtensions:true,types:[]});
const c=program.getTypeChecker();
const f=ts.TypeFormatFlags.NoTruncation|ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;
const doc=s=>ts.displayPartsToString(s.getDocumentationComment(c)).replace(/\s+/g,' ').trim();
const out=[];
for(const e of entries){const sf=program.getSourceFile(e.file);const m=c.getSymbolAtLocation(sf);
 for(const ex of c.getExportsOfModule(m)){
  const s=ex.flags&ts.SymbolFlags.Alias?c.getAliasedSymbol(ex):ex;
  const d=s.declarations?.[0];
  let kind='unknown';const fl=s.flags;
  if(fl&ts.SymbolFlags.Function)kind='function';else if(fl&ts.SymbolFlags.Class)kind='class';else if(fl&ts.SymbolFlags.Interface)kind='interface';else if(fl&ts.SymbolFlags.TypeAlias)kind='type';else if(fl&ts.SymbolFlags.Enum)kind='enum';else if(fl&ts.SymbolFlags.Variable)kind='const';
  const rec={id:`${e.pkg}${e.sub==='.'?'':e.sub.slice(1)}#${ex.name}`,import:e.pkg+(e.sub==='.'?'':e.sub.slice(1)),name:ex.name,kind,doc:doc(s),tags:s.getJsDocTags(c).map(t=>t.name),src:d?relative(root,d.getSourceFile().fileName):null};
  const isVal=fl&(ts.SymbolFlags.Function|ts.SymbolFlags.Variable|ts.SymbolFlags.Class);
  if(isVal&&d){const ty=c.getTypeOfSymbolAtLocation(s,d);const sigs=ty.getCallSignatures();
   rec.sig=sigs.map(x=>c.signatureToString(x,undefined,f));
   if(/^[A-Z]/.test(ex.name)&&sigs[0]?.parameters[0]){const pt=c.getTypeOfSymbolAtLocation(sigs[0].parameters[0],d);
     const props=pt.getProperties();
     rec.propsFrom=c.typeToString(pt,undefined,f).slice(0,80);
     const own=props.filter(p=>!(p.declarations||[]).every(x=>x.getSourceFile().fileName.includes('node_modules')));
     rec.nprops=props.length; rec.foreign=props.length-own.length;
     rec.props=own.map(p=>({name:p.name,optional:!!(p.flags&ts.SymbolFlags.Optional),type:c.typeToString(c.getTypeOfSymbolAtLocation(p,d),undefined,f).slice(0,300),doc:doc(p)}));
   }
  } else if(d){ rec.def=c.typeToString(c.getDeclaredTypeOfSymbol(s),undefined,f).slice(0,400); }
  out.push(rec);
 }}
const t1=Date.now();
writeFileSync('catalog.json',JSON.stringify(out,null,1));
const by={};for(const r of out){by[r.import]=(by[r.import]||0)+1;}
console.log('ms',t1-t0,'n',out.length,'bytes',JSON.stringify(out).length,by);
const kinds={};for(const r of out)kinds[r.kind]=(kinds[r.kind]||0)+1;console.log(kinds);
console.log('nodoc',out.filter(r=>!r.doc).length,'tags',[...new Set(out.flatMap(r=>r.tags))]);
for(const n of ['PlatformDataTable','ChartFrame','PanelWorkspace','useMenuQuery','Button','SplitLayout','useContextValue']){const r=out.find(x=>x.name===n);console.log(n+' '+String(JSON.stringify(r&&{...r,props:r.props?.slice(0,2),np:r.props?.length})).slice(0,500));}
console.log('unknown',out.filter(r=>r.kind==='unknown').slice(0,5).map(r=>r.id));
console.log('comps',out.filter(r=>/^[A-Z]/.test(r.name)&&r.sig).length,'withProps',out.filter(r=>r.props?.length).length);
```
