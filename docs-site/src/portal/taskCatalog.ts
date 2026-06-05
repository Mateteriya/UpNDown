import { TASK_GROUPS } from './tasks';
import type { TaskItem } from './types';

export type TaskCatalogEntry = {
  task: TaskItem;
  groupId: string;
  groupTitle: string;
};

export function buildTaskCatalog(): TaskCatalogEntry[] {
  const out: TaskCatalogEntry[] = [];
  for (const group of Object.values(TASK_GROUPS)) {
    for (const task of group.tasks) {
      out.push({ task, groupId: group.id, groupTitle: group.title });
    }
  }
  return out;
}

export function taskCatalogById(): Map<string, TaskCatalogEntry> {
  return new Map(buildTaskCatalog().map((e) => [e.task.id, e]));
}
