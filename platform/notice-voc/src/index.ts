/**
 * @ap/menu-notice-voc — noticeVoc group manifests (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes. 내 VOC and 설문 (screens of `@ap/menu-my-activity`) join this global 소통 group; `notices` has the list + reading screen (#1290); `faq` has a plain placeholder screen (the content is not written yet).
 */
import { lazy } from 'react';
import { HelpCircle, Megaphone } from 'lucide-react';
import type { MenuEntry } from '@ap/kernel';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';

const GROUP = groupId('noticeVoc');

export const manifests: MenuEntry[] = [
  {
    id: 'notices', primary: true, group: GROUP, label: { ko: '공지', en: 'Notices' },
    description: { ko: '공지 목록/상세', en: 'Notice list/detail' },
    path: '/notices', icon: Megaphone, permission: 'notice:view', requiresScope: false, pageType: 'management', context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['focus'],
    component: lazy(() => import('./pages/Notices')),
  },
  {
    id: 'faq', group: GROUP, label: { ko: 'FAQ', en: 'FAQ' },
    description: { ko: '자주 묻는 질문', en: 'FAQ' },
    path: '/faq', icon: HelpCircle, permission: 'notice:view', requiresScope: false, pageType: 'management', context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
    component: lazy(() => import('./pages/Faq')),
  },
];
