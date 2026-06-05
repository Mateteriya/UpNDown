import { supabase } from '../lib/supabase';

export type TaskWorkStatus = 'todo' | 'in_progress' | 'done';

export type PortalTaskState = {
  task_id: string;
  status: TaskWorkStatus;
  assignee_user_id: string | null;
  assignee_display: string | null;
  updated_at: string;
  updated_by: string | null;
};

export async function fetchAllTaskStates(): Promise<PortalTaskState[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('portal_task_states')
    .select('task_id, status, assignee_user_id, assignee_display, updated_at, updated_by');
  if (error) throw error;
  return (data ?? []) as PortalTaskState[];
}

export async function upsertTaskState(
  taskId: string,
  patch: {
    status: TaskWorkStatus;
    assignee_user_id?: string | null;
    assignee_display?: string | null;
    updated_by?: string | null;
  },
): Promise<PortalTaskState> {
  if (!supabase) throw new Error('Supabase не настроен');
  const row = {
    task_id: taskId,
    status: patch.status,
    assignee_user_id: patch.assignee_user_id ?? null,
    assignee_display: patch.assignee_display ?? null,
    updated_at: new Date().toISOString(),
    updated_by: patch.updated_by ?? null,
  };
  const { data, error } = await supabase
    .from('portal_task_states')
    .upsert(row, { onConflict: 'task_id' })
    .select('task_id, status, assignee_user_id, assignee_display, updated_at, updated_by')
    .single();
  if (error) throw error;
  return data as PortalTaskState;
}

export function statesToMap(rows: PortalTaskState[]): Map<string, PortalTaskState> {
  return new Map(rows.map((r) => [r.task_id, r]));
}
