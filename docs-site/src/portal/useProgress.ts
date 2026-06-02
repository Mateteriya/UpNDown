import { useCallback, useEffect, useState } from 'react';
import { defaultCheckedIds } from './data';
import { loadChecked, saveChecked } from './storage';

export function useProgress() {
  const [checked, setChecked] = useState<Set<string>>(() => {
    const stored = loadChecked();
    if (stored.size > 0) return stored;
    return new Set(defaultCheckedIds());
  });

  useEffect(() => {
    saveChecked(checked);
  }, [checked]);

  const toggle = useCallback((id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setChecked(new Set(defaultCheckedIds()));
  }, []);

  const setAll = useCallback((ids: Set<string>) => {
    setChecked(ids);
  }, []);

  return { checked, toggle, reset, setAll };
}
