import { useCallback, useEffect, useMemo, useState } from 'react';
import { defaultCheckedIds } from './data';
import { loadChecked, saveChecked } from './storage';
import {
  fetchAllTaskStates,
  statesToMap,
  upsertTaskState,
  type PortalTaskState,
  type TaskWorkStatus,
} from './taskState';
import { usePortalAuth } from '../contexts/PortalAuthContext';

function isDoneStatus(status: TaskWorkStatus | undefined, localChecked: boolean): boolean {
  if (status === 'done') return true;
  if (status === 'todo' || status === 'in_progress') return false;
  return localChecked;
}

export function useTaskWork() {
  const { user, displayName, configured, loading: authLoading } = usePortalAuth();
  const syncEnabled = configured && !!user;

  const [localChecked, setLocalChecked] = useState<Set<string>>(() => {
    const stored = loadChecked();
    if (stored.size > 0) return stored;
    return new Set(defaultCheckedIds());
  });

  const [remoteStates, setRemoteStates] = useState<Map<string, PortalTaskState>>(new Map());
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const refreshRemote = useCallback(async () => {
    if (!syncEnabled) return;
    setRemoteLoading(true);
    setSyncError(null);
    try {
      const rows = await fetchAllTaskStates();
      setRemoteStates(statesToMap(rows));
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoteLoading(false);
    }
  }, [syncEnabled]);

  useEffect(() => {
    void refreshRemote();
  }, [refreshRemote]);

  const checked = useMemo(() => {
    if (!syncEnabled) return localChecked;
    const next = new Set<string>();
    for (const id of localChecked) {
      const remote = remoteStates.get(id);
      if (!remote || remote.status === 'done') next.add(id);
    }
    for (const [id, row] of remoteStates) {
      if (row.status === 'done') next.add(id);
    }
    return next;
  }, [syncEnabled, localChecked, remoteStates]);

  useEffect(() => {
    if (syncEnabled) return;
    saveChecked(localChecked);
  }, [syncEnabled, localChecked]);

  const applyRemote = useCallback((row: PortalTaskState) => {
    setRemoteStates((prev) => {
      const next = new Map(prev);
      next.set(row.task_id, row);
      return next;
    });
  }, []);

  const persist = useCallback(
    async (
      taskId: string,
      status: TaskWorkStatus,
      assignee?: { id: string | null; display: string | null },
    ) => {
      if (!syncEnabled || !user) {
        setLocalChecked((prev) => {
          const next = new Set(prev);
          if (status === 'done') next.add(taskId);
          else next.delete(taskId);
          return next;
        });
        return;
      }
      setSyncError(null);
      try {
        const row = await upsertTaskState(taskId, {
          status,
          assignee_user_id: assignee?.id ?? null,
          assignee_display: assignee?.display ?? null,
          updated_by: user.id,
        });
        applyRemote(row);
        setLocalChecked((prev) => {
          const next = new Set(prev);
          if (status === 'done') next.add(taskId);
          else next.delete(taskId);
          return next;
        });
      } catch (e) {
        setSyncError(e instanceof Error ? e.message : String(e));
      }
    },
    [syncEnabled, user, applyRemote],
  );

  const getStatus = useCallback(
    (taskId: string): TaskWorkStatus => {
      const remote = remoteStates.get(taskId);
      if (remote) return remote.status;
      if (localChecked.has(taskId)) return 'done';
      return 'todo';
    },
    [remoteStates, localChecked],
  );

  const toggle = useCallback(
    (taskId: string) => {
      const current = getStatus(taskId);
      if (current === 'done') {
        void persist(taskId, 'todo', { id: null, display: null });
      } else {
        void persist(taskId, 'done', { id: user?.id ?? null, display: displayName });
      }
    },
    [getStatus, persist, user, displayName],
  );

  const claimTask = useCallback(
    (taskId: string) => {
      void persist(taskId, 'in_progress', { id: user?.id ?? null, display: displayName });
    },
    [persist, user, displayName],
  );

  const releaseTask = useCallback(
    (taskId: string) => {
      void persist(taskId, 'todo', { id: null, display: null });
    },
    [persist],
  );

  const completeTask = useCallback(
    (taskId: string) => {
      void persist(taskId, 'done', { id: user?.id ?? null, display: displayName });
    },
    [persist, user, displayName],
  );

  const reset = useCallback(() => {
    setLocalChecked(new Set(defaultCheckedIds()));
    if (!syncEnabled) return;
    setSyncError('Сброс в облаке не выполняется автоматически — отметьте задачи вручную или через SQL.');
  }, [syncEnabled]);

  const setAll = useCallback((ids: Set<string>) => {
    setLocalChecked(ids);
  }, []);

  const inProgressTasks = useMemo(() => {
    return [...remoteStates.values()].filter((r) => r.status === 'in_progress');
  }, [remoteStates]);

  return {
    checked,
    remoteStates,
    inProgressTasks,
    getStatus,
    toggle,
    claimTask,
    releaseTask,
    completeTask,
    reset,
    setAll,
    refreshRemote,
    syncEnabled,
    syncError,
    loading: authLoading || remoteLoading,
    isDone: (taskId: string) => isDoneStatus(getStatus(taskId), localChecked.has(taskId)),
  };
}

export type TaskWorkApi = ReturnType<typeof useTaskWork>;
