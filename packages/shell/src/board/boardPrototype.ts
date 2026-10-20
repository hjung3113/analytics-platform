import { useLayoutEffect, useState, type RefObject } from 'react';
import { buildQuery, emptyGlobal } from '@ap/contracts';
import type { Lang, PaneScreen, Registry } from '@ap/kernel';
import { BOARD_PATH } from '@ap/kernel';
import { MAX_SHEETS, newSheet, type Board, type BoardLayout, type Sheet } from './boardModel';

/** Three board questions on the existing /board route, switched with ?protoQuestion=...&variant=.... */
export type BoardPrototypeQuestion = 'height' | 'empty' | 'chips';
export type BoardPrototypeVariant = 'A' | 'B' | 'C';
export type BoardPrototype = { question: BoardPrototypeQuestion; variant: BoardPrototypeVariant; seed: boolean };

const QUESTION_NAMES: Record<BoardPrototypeQuestion, string> = { height: '높이', empty: '빈 화면', chips: '차이 칩' };
const isQuestion = (value: string | null): value is BoardPrototypeQuestion => value === 'height' || value === 'empty' || value === 'chips';
const isVariant = (value: string | null): value is BoardPrototypeVariant => value === 'A' || value === 'B' || value === 'C';

export function readBoardPrototype(url: string, enabled: boolean): BoardPrototype | null {
  if (!enabled) return null;
  const search = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  const params = new URLSearchParams(search);
  const rawQuestion = params.get('protoQuestion');
  const rawVariant = params.get('variant');
  const seed = params.get('protoSeed') === '1';
  if (!isQuestion(rawQuestion) && !seed) return null;
  if (rawVariant !== null && !isVariant(rawVariant)) return null;
  return { question: isQuestion(rawQuestion) ? rawQuestion : 'height', variant: isVariant(rawVariant) ? rawVariant : 'A', seed };
}

export function boardPrototypeHref(sheetId: string, prototype: BoardPrototype | null): string {
  if (!prototype) return `${BOARD_PATH}?sheet=${encodeURIComponent(sheetId)}`;
  const params = new URLSearchParams([['sheet', sheetId]]);
  params.set('protoQuestion', prototype.question);
  params.set('variant', prototype.variant);
  if (prototype.seed) params.set('protoSeed', '1');
  return `${BOARD_PATH}?${params.toString()}`;
}

export function prototypeSheetName(question: BoardPrototypeQuestion): string { return QUESTION_NAMES[question]; }

export function useBoardPrototypePanelHeight(ref: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setHeight(element.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}

function menuIdForLabel(registry: Registry, label: string): string | null {
  return registry.menus.find(menu => menu.label.ko === label && menu.features.board === true)?.id ?? null;
}

function makeScreen(menuId: string, query: string): PaneScreen { return { menuId, params: {}, query }; }

function sheetWith(name: string, layout: BoardLayout, panes: (PaneScreen | null)[], ids: ReadonlySet<string>): Sheet {
  return { ...newSheet(name, ids), layout, panes };
}

/** Add the three named review sheets without overwriting an existing user sheet; reuse only the untouched default blank sheet. */
export function seedBoardPrototype(board: Board, registry: Registry, scopeId: string | null, prefix: string): Board {
  const equipment = menuIdForLabel(registry, '설비 마스터');
  const productivity = menuIdForLabel(registry, '생산성 개요');
  const cycleTime = menuIdForLabel(registry, '사이클타임 상세');
  if (!equipment || !productivity || !cycleTime) return board;

  const base = buildQuery({ ...emptyGlobal, scopeId });
  const photo = buildQuery({ ...emptyGlobal, scopeId, roomNames: ['PHOTO'] });
  const etch = buildQuery({ ...emptyGlobal, scopeId, roomNames: ['ETCH'] });
  const specs: { name: string; layout: BoardLayout; panes: (PaneScreen | null)[] }[] = [
    { name: QUESTION_NAMES.height, layout: '2x2', panes: [makeScreen(equipment, base), makeScreen(productivity, base), makeScreen(cycleTime, base), makeScreen(equipment, base)] },
    { name: QUESTION_NAMES.empty, layout: '2x2', panes: [null, null, null, null] },
    { name: QUESTION_NAMES.chips, layout: '1x2', panes: [makeScreen(cycleTime, photo), makeScreen(cycleTime, etch)] },
  ];
  const sheets = [...board.sheets];
  const defaultBlank = sheets.length === 1 && sheets[0].name === `${prefix} 1` && sheets[0].layout === '1x1' && sheets[0].panes[0] === null;
  let reusedDefault = false;
  for (const spec of specs) {
    if (sheets.some(sheet => sheet.name === spec.name) || sheets.length >= MAX_SHEETS) continue;
    if (!reusedDefault && defaultBlank) {
      const blank = sheets[0];
      sheets[0] = { ...blank, name: spec.name, layout: spec.layout, selected: 0, panes: spec.panes };
      reusedDefault = true;
    } else {
      sheets.push(sheetWith(spec.name, spec.layout, spec.panes, new Set(sheets.map(sheet => sheet.id))));
    }
  }
  const changed = sheets.length !== board.sheets.length || sheets.some((sheet, index) => sheet !== board.sheets[index]);
  return changed ? { ...board, sheets } : board;
}

export function boardPrototypeCopy(lang: Lang) {
  const ko = lang === 'ko';
  return {
    questions: {
      height: ko ? '높이' : 'Height', empty: ko ? '빈 화면' : 'First use', chips: ko ? '차이 칩' : 'Difference chips',
    } satisfies Record<BoardPrototypeQuestion, string>,
    variants: {
      height: { A: ko ? '고정 높이 · 칸별 스크롤' : 'Fixed panes · own scroll', B: ko ? '키보드 분할' : 'Keyboard splitters', C: ko ? '최대화' : 'Maximize' },
      empty: { A: ko ? '레이아웃 먼저' : 'Choose a layout', B: ko ? '칸별 추가' : 'Add per pane', C: ko ? '저장 범위 안내' : 'Storage scope' },
      chips: { A: ko ? '차이 우선' : 'Differences first', B: ko ? '값만 보기' : 'Values only', C: ko ? '두 줄' : 'Two rows' },
    } satisfies Record<BoardPrototypeQuestion, Record<BoardPrototypeVariant, string>>,
    previousVariant: ko ? '이전 안' : 'Previous variant',
    nextVariant: ko ? '다음 안' : 'Next variant',
    chooseQuestion: ko ? '검토할 질문' : 'Choose a question',
    emptyTitle: ko ? '비교할 화면을 여기에 놓으세요' : 'Put screens here to compare them',
    emptyIntro: ko ? '분석 보드는 여러 분석 화면을 한 시트에 모아 나란히 보는 곳입니다.' : 'An analysis board places related screens together on a sheet so you can compare them.',
    sheetDefinition: ko ? '시트 — 비교 작업 하나를 담는 탭' : 'Sheet — a tab for one comparison',
    paneDefinition: ko ? '칸 — 시트 안에 놓는 분석 화면 한 개' : 'Pane — one analysis screen on a sheet',
    autoSave: ko ? '이 브라우저에 자동 저장 — 다른 기기에서는 보이지 않습니다' : 'Saved automatically in this browser — not visible on other devices',
    browserOnly: ko ? '이 브라우저에만 저장' : 'Saved in this browser only',
    storageDetails: ko ? '보드와 배치는 이 브라우저의 저장 공간에 보관됩니다. 다른 컴퓨터나 기기에서는 보이지 않습니다.' : 'The board and its layout are stored in this browser. They are not visible on another computer or device.',
    emptyPaneHint: ko ? '메뉴와 조건을 고르면 이 칸에서 바로 분석합니다.' : 'Choose a screen and its conditions to start analyzing in this pane.',
    layoutDescription: ko ? '레이아웃을 골라 비교를 시작하세요.' : 'Choose a layout to start your comparison.',
    maximizePane: (number: number) => ko ? `칸 ${number} 최대화` : `Maximize pane ${number}`,
    restorePane: (number: number) => ko ? `칸 ${number} 원래 크기로` : `Restore pane ${number}`,
    screenRegion: (number: number, name: string) => ko ? `칸 ${number}의 ${name} 화면` : `Pane ${number} ${name} screen`,
    splitterColumn: ko ? '열 너비 조절' : 'Resize columns',
    splitterRow: ko ? '행 높이 조절' : 'Resize rows',
    collapsed: ko ? '접힘' : 'Collapsed',
    percentage: (value: number) => ko ? `${value}%` : `${value}%`,
    moreConditions: (number: number, count: number) => ko ? `칸 ${number}의 조건 ${count}개 더 보기` : `Show ${count} more conditions in pane ${number}`,
  };
}
