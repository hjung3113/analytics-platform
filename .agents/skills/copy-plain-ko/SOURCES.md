# Sources for copy-plain-ko

Collected 2026-10-29. Blog and marketing posts are listed as practitioner notes, not evidence; the Wikipedia guide and the digitalmarketer PR-corpus post both say isolated words are weak signals and clusters matter.

## English LLM writing tells

- Wikipedia, "Signs of AI writing" — https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing — inflated significance, promotional tone, vague attribution, copula avoidance ("serves as"), negative parallelism ("not X but Y", "rather than"), rule of three, participial tails ("highlighting", "underscoring"), summary openers ("In summary", "Overall"), em dash overuse (spaced), boldface overuse, inline-header lists, title case, elegant variation, hedging disclaimers, placeholder text. Notes that perfect grammar and single transition words are unreliable alone. Basis for tells 1–3, 6–8, 15, 16, 18.
- howmanywords.app, "ChatGPT 문체 특징" (Korean-language summary of English tells) — https://howmanywords.app/ko/블로그/ChatGPT문체특징 — closing transitions, bullets by default, even paragraph length, neutral polite tone.

## Korean "AI 말투 / GPT 말투 / 번역투" tells

- digitalmarketer.co.kr, "말투와 문체 지시하기: AI 티 나는 표현 걸러내는 법" — https://www.digitalmarketer.co.kr/class/prompt-design-in-practice/tone-and-style-instructions — comma-chained sentences, baseless adjectives (`혁신적이고 강력한`), `뿐만 아니라` inflation, stock openers/closers (`소개해 드리려고 합니다`, `도움이 되셨기를`), possible written as done. Basis for tells 1, 4, 5, 14.
- digitalmarketer.co.kr, "클로드와 챗GPT 말투가 티 나는 이유, 깃허브 PR 46만 건 분석과 한국어 비문 교정 기록" — https://www.digitalmarketer.co.kr/insights/claude-load-bearing-vocabulary-github-pr — negative parallelism `단순한 A가 아니라 B`, `~로 기능합니다`, `결론적으로/종합하면`, metaphor translation-ese (`떠받치고`, `조용히 삼켜지고`), `자리` metaphor, unit-less `세 지식`, bold per paragraph; says word lists had low discriminating power in the PR corpus. Basis for tells 1, 3, 7, 15, 17.
- digitalmarketer.co.kr, "AI 글 어조 교정 사례" — https://www.digitalmarketer.co.kr/insights/ai-writing-tone-editing — 32 before/after cases in four groups: 번역투 (`~을 통해`→`~으로`, `~에 대한 분석`→`~를 분석`, `보여집니다`→`나옵니다`, `~에 의해`→agent subject, `~중 하나`, `~에도 불구하고`→`~는데도`, `~에 있어서`→`~할 때`, `~것을 돕습니다`), 과장 (`비약적인 성능 개선`→measured numbers, `변신시킵니다`→what runs), AI식 지시문 (`결론적으로`, `종합하면`, `떠올려 보세요`, `권합니다`, `도움이 되셨길`), 문어체 어휘 (`세 지식`→`세 가지`, over-honorific `여쭤보겠습니다`). Basis for tells 3–5, 10–14, 17.
- findskill.ai, "AI 글이 로봇처럼 들리는 이유" — https://findskill.ai/ko/blog/ai-geuli-robosceoreom-deulrineun-iyu-geurigo-jeonghwaghi-gocineun/ — over-elevated vocabulary (`파고들다`, `다각적`, `무수히 많은`), connectives `게다가/더욱이/나아가`, rhetorical Q&A, metronome rhythm, vague openers (`요즘 빠르게 변화하는 세상에서는`, `결국 핵심은`). Its fix "use 해요체 contractions" is NOT adopted (site style is `~합니다`). Basis for tells 3, 4, 8, 16.
- foxcg.com, "챗GPT 블로그 글쓰기, AI 티 안 나게 쓰는 현실적인 방법" — https://foxcg.com/chatgpt-blog-writing/ — ban list (`파고들어 봅시다`, `잠재력을 발휘하다`, `혁신적인`, `결론적으로`), `~에 위치해 있습니다`→`~에 있어요`, `~함에 있어`→`~할 때`, inanimate subject + causative (`단축시켜 줍니다`), `~를 가지고 있습니다`, `여러분 안녕하세용~!`, same-length sentences. Basis for tells 4, 5, 7, 10, 16.
- yozm.wishket.com, magazine 3854 — https://yozm.wishket.com/magazine/detail/3854/ — eight signals: translation-ese idioms (`~에 대해 논의를 진행하고자 합니다`), stacked intensifier + hedge (`매우 핵심적인 요소라고 볼 수 있습니다`), signature conclusions (`결론적으로 이는 시사하는 바가 큽니다`), mechanical connectives, bullet overuse, flat rhythm, evasive hedging, odd particles; warns to preserve facts/numbers and that a fixed correction style becomes its own AI tell. Basis for tells 3, 6, 8, 13 and procedure step 5.
- wikidocs.net, 번역투 notes citing 국립국어원 「공공언어 바로 쓰기」(2014) — https://wikidocs.net/157657 and https://wikidocs.net/158197 — noun-chain to verb (`인프라 시설에의 투자가 이루어진다면`→`인프라 시설에 투자하면`, `식량의 부족으로 인하여`→`식량이 부족하여`), `~에 의해 건국되었다`→`~가 건국했다`; 국립국어원 position that not every `의` is translation-ese. Basis for tells 10–12. (158197 returned 403 on fetch; content taken from search snippets.)
- 국립국어원 새국어생활 2012-1 특집 「번역과 국어」 — https://www.korean.go.kr/nkview/nklife/2012_1/22_0106.pdf — PDF fetched but not text-extractable here; listed as the primary reference for Korean translation-ese categories (피동, 명사화, 후치사 `~에 있어서`), content not verified in this pass.
- brunch.co.kr/@soocut/232, "번역투의 유혹" — https://brunch.co.kr/@soocut/232 — `~에 대해서`, `~에 관하여`, `~에 있어서` as Japanese-style postpositions.
- etnews, "챗GPT 쓰더니 직장인 말투까지 변했다" (2026-10-02) — https://www.etnews.com/20261002000159 — press note on GPT-style over-empathy, praise inflation; background only.

## 개조식 (noun-ending report style)

- brunch.co.kr/@maven/583, "명사형 종결이 보고서 작성에 필요한 이유" — https://brunch.co.kr/@maven/583 — end lines with a noun phrase (`신규 고객 감소폭 확대`), put the key noun and number first (`구매 전환율 전월 대비 3.2%p 하락`), same shape for compared items (`한국: 매출 증가 / 일본: 매출 정체`), remove particles and stock predicates (`~로 나타났습니다`, `~로 판단됩니다`, `~할 필요가 있습니다`); warns that swapping only the suffix (`감소함`, `확인됨`) is not compression and that a noun phrase must keep period, size and comparison basis; not a rule for spoken explanation. Basis for the style split table and procedure step 4.
- ppss.kr, "복잡한 문제에는 개조식이 아닌, 서술식 보고서가 필요하다" — http://www.ppss.kr/news/articleView.html?idxno=219017 — 개조식 is "속독을 위한 보고서", fits fast single-domain decisions, weak for multi-domain reasoning. Basis for keeping `~합니다` sentences on behavior/accuracy/constraints.
- pressian.com, 「'-함', '-음'으로 끝나는 보고서」 — https://pressian.com/pages/articles/121715 — 개조식 endings `-함/-음/-임`, omitted subjects blur responsibility, Japanese administrative origin; critical view. Basis for preferring noun phrases over `~함` and for keeping subjects where responsibility matters.
- 평택상공회의소 교육 공문 (2025-04-09), "보고서 작성 기술과 효과적인 보고스킬" — https://pyeongtaekcci.korcham.net/file/dext5uploaddata/2025/발송공문-20250409%20보고서%20작성%20기술과%20효과적인%20보고스킬_.pdf — lists 개조식/항목 형식 and a clear conclusion message as basic report technique; snippet only.
- 서울신문 1998-06-02, 공문 문장 길이 비판 — https://www.seoul.co.kr/news/1998/06/02/19980602023003 — multi-page noun-ending sentences unreadable; one fact per line.

Not found in this pass: an official 행정안전부 공문서 작성 편람 text online that states 개조식 rules verbatim; a corpus study tying specific Korean words (`다양한`, `효율적으로`, `~을 통해`) to LLM output. Those tells (10, 13) rest on practitioner correction logs above and on the owner's own reading, so treat them as style preferences, not detection evidence.

## Repository rules this skill fits

- `site/AGENTS.md` — noun-first headings/cards/diagrams/summaries (#1057); short `~합니다` sentences for behavior, accuracy, constraints; no ad or contrast rhetoric (#607); GLOSSARY names; `아직 안 됨 → 예정 #n`; facts map to `site/SOURCES.md` rows.
- Issue #607 — remove ad copy, state facts plainly, drop contrast paragraphs ("팀별 화면이면/플랫폼 안에서는").
- Issue #1057 — headings, cards, diagrams: key nouns first (`각 시스템의 고유 기능은 유지하고 공통 기반을 공유합니다` → `공통 기반 공유`); `glossary.html` keeps explanatory sentences; no forced character cuts.
