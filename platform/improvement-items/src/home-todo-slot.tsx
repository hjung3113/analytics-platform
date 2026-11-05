import type { HomeTodoSlot } from '@ap/kernel';
import HomeAssignments from './HomeAssignments';

/** App main composes this with the feature bridge contribution; home imports neither consumer. */
export const improvementHomeTodoSlot: HomeTodoSlot = { Todo: HomeAssignments };
