import type { Text } from '@ap/kernel';

/** The workspace's own copy (Korean first); panel titles and preset labels come from the menu. */
export const workspaceText = {
  region: { ko: '패널 작업 공간', en: 'Panel workspace' },
  layout: { ko: '배치', en: 'Layout' },
  hiddenPanels: (count: number): Text => ({ ko: `숨긴 패널 ${count}`, en: `Hidden panels ${count}` }),
  hiddenPanelsList: { ko: '숨긴 패널', en: 'Hidden panels' },
  showPanel: (title: string): Text => ({ ko: `${title} 다시 보기`, en: `Show ${title}` }),
  resetLayout: { ko: '기본 배치', en: 'Default layout' },
  maximize: (title: string): Text => ({ ko: `${title} 최대화`, en: `Maximize ${title}` }),
  restore: { ko: '원래 크기로', en: 'Restore size' },
  actions: (title: string): Text => ({ ko: `${title} 동작`, en: `${title} actions` }),
  splitRight: { ko: '오른쪽으로 나누기', en: 'Split to the right' },
  splitDown: { ko: '아래로 나누기', en: 'Split below' },
  moveToGroup: (title: string): Text => ({ ko: `${title} 묶음으로 옮기기`, en: `Move into ${title}'s group` }),
  hide: { ko: '숨기기', en: 'Hide' },
  separatorColumns: (before: string, after: string): Text => ({ ko: `${before}과(와) ${after} 사이 너비`, en: `Width between ${before} and ${after}` }),
  separatorRows: (before: string, after: string): Text => ({ ko: `${before}과(와) ${after} 사이 높이`, en: `Height between ${before} and ${after}` }),
} satisfies Record<string, Text | ((...args: never[]) => Text)>;
