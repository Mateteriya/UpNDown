import { TASK_GROUPS } from './tasks';
import type { TaskGroup } from './types';

export function tasksFromGroups(groupIds: string[]): TaskGroup['tasks'] {
  return groupIds.flatMap((id) => TASK_GROUPS[id]?.tasks ?? []);
}

export function progressStats(groupIds: string[], checked: Set<string>) {
  const tasks = tasksFromGroups(groupIds);
  const total = tasks.length;
  const done = tasks.filter((t) => checked.has(t.id)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { total, done, remaining: total - done, pct };
}

export function progressForGroupIds(groupIds: string[], checked: Set<string>): number {
  return progressStats(groupIds, checked).pct;
}

export const PHASE1_GROUP_IDS = [
  'done-foundation',
  'mobile-polish',
  'online-now',
  'marketing',
  'offline-ge',
  'ws-server',
  'ws-client',
  'ws-migrate',
  'iap-infra',
  'iap-shop',
  'iap-features',
  'cc-core',
  'cc-tournaments',
  'beta-release',
];

export const PHASE2_GROUP_IDS = ['phase2-entity', 'phase2-license'];

export const QUARTER_GROUPS: Record<string, string[]> = {
  q2: ['mobile-polish', 'online-now', 'marketing', 'ws-server', 'offline-ge'],
  q3: ['ws-client', 'ws-migrate', 'iap-infra', 'iap-shop', 'offline-ge', 'beta-release'],
  q4: ['cc-core', 'cc-tournaments', 'iap-features', 'beta-release'],
};

export function allTaskIds(): string[] {
  return Object.values(TASK_GROUPS).flatMap((g) => g.tasks.map((t) => t.id));
}

export function defaultCheckedIds(): string[] {
  return Object.values(TASK_GROUPS).flatMap((g) =>
    g.tasks.filter((t) => t.done).map((t) => t.id),
  );
}
