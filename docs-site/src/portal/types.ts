export type TaskOwner = 'product' | 'tech' | 'intl' | 'legal' | 'all';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export type TaskItem = {
  id: string;
  label: string;
  /** Критерий готовности — одно конкретное действие */
  hint?: string;
  done?: boolean;
  owner?: TaskOwner;
  priority?: TaskPriority;
  /** Ориентир по сроку, напр. «Q2», «Нед. 3–4» */
  eta?: string;
};

export type TaskGroup = {
  id: string;
  title: string;
  subtitle?: string;
  tasks: TaskItem[];
};

export type Direction = {
  id: string;
  code: string;
  title: string;
  summary: string;
  owner: string;
  coOwners?: string;
  phase: 1 | 2;
  groupIds: string[];
  link?: string;
};

export type ProductLayer = {
  id: number;
  title: string;
  items: string;
  license: string;
  priority: 'now' | 'later';
};

export type QuarterPlan = {
  id: string;
  label: string;
  theme: string;
  progressKey: string;
  rows: { who: string; focus: string }[];
};

export type RoleRow = {
  role: string;
  zone: string;
};

export type Milestone = {
  id: string;
  quarter: string;
  title: string;
  groupIds: string[];
};

export const OWNER_LABELS: Record<TaskOwner, string> = {
  product: 'Продукт',
  tech: 'Техдиректор',
  intl: 'Межд. партнёр',
  legal: 'Юрист',
  all: 'Все',
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  critical: 'Критично',
  high: 'Высокий',
  medium: 'Средний',
  low: 'Низкий',
};
