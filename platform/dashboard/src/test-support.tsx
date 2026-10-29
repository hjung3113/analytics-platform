/** Fixtures shared by the 대시보드 page and scope slot tests. */
import { ListTodo } from 'lucide-react';
import { createFeatureMenuHarness } from '@ap/feature-bridge/testing';
import { manifests } from './index';

export const { registry, mountAt } = createFeatureMenuHarness({ manifests, homeMenuId: 'dashboard', group: { id: 'dashboard', label: { ko: '대시보드', en: 'Dashboard' }, icon: ListTodo }, detailSlot: false });
