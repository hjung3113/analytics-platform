/**
 * @ap/menu-notice-voc — noticeVoc group manifests (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes. 내 VOC moved to @ap/menu-my-activity (#654).
 */
import { Megaphone } from 'lucide-react';
import type { MenuEntry } from '@ap/kernel';
import { groupId, type Capability, type ContextKey } from '@ap/contracts';

const GROUP = groupId('noticeVoc');

const none: Record<ContextKey, Capability> = { time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' };
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };

export const manifests: MenuEntry[] = [
  {
    id: 'notices', primary: true, group: GROUP, label: { ko: '공지', en: 'Notices' },
    description: { ko: '공지 목록/상세', en: 'Notice list/detail' },
    path: '/notices', icon: Megaphone, permission: 'notice:view', requiresScope: false, pageType: 'management', context: none, features: noFeatures, pageKeys: [],
  },
];
