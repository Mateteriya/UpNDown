import { Link } from 'react-router-dom';
import { allTaskIds } from '../portal/data';
import { exportProgress, importProgress } from '../portal/storage';
import type { TaskWorkApi } from '../portal/useTaskWork';

type Props = {
  work: TaskWorkApi;
};

export function ProgressTools({ work }: Props) {
  const handleExport = () => {
    const blob = new Blob([exportProgress(work.checked)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `upndown-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const raw = window.prompt('Вставьте JSON прогресса:');
    if (!raw?.trim()) return;
    try {
      work.setAll(importProgress(raw));
      alert('Прогресс импортирован (локальные галочки)');
    } catch {
      alert('Не удалось прочитать файл');
    }
  };

  const total = allTaskIds().length;
  const done = work.checked.size;

  return (
    <div className="progress-tools">
      <span className="tools-count" title="Отмечено задач">
        {done}/{total}
      </span>
      <button type="button" className="btn ghost btn-sm" onClick={handleExport}>
        Экспорт
      </button>
      <button type="button" className="btn ghost btn-sm" onClick={handleImport}>
        Импорт
      </button>
      {work.syncEnabled && (
        <button type="button" className="btn ghost btn-sm" onClick={() => void work.refreshRemote()}>
          Обновить
        </button>
      )}
      <button
        type="button"
        className="btn ghost btn-sm danger"
        onClick={() => {
          if (window.confirm('Сбросить локальный прогресс к значениям по умолчанию?')) work.reset();
        }}
      >
        Сброс
      </button>
    </div>
  );
}
