/**
 * @ap/menu-notice-voc — noticeVoc group manifests (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes. 내 VOC moved to @ap/menu-my-activity (#654).
 */
import { Megaphone } from 'lucide-react';
import type { MenuEntry } from '@ap/kernel';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';

const GROUP = groupId('noticeVoc');

export const manifests: MenuEntry[] = [
  {
    id: 'notices', primary: true, group: GROUP, label: { ko: '공지', en: 'Notices' },
    description: { ko: '공지 목록/상세', en: 'Notice list/detail' },
    path: '/notices', icon: Megaphone, permission: 'notice:view', requiresScope: false, pageType: 'management', context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
  },
];
