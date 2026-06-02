import { allTaskIds } from '../portal/data';
import { exportProgress, importProgress } from '../portal/storage';

type Props = {
  checked: Set<string>;
  onReset: () => void;
  onImport: (set: Set<string>) => void;
};

export function ProgressTools({ checked, onReset, onImport }: Props) {
  const handleExport = () => {
    const blob = new Blob([exportProgress(checked)], { type: 'application/json' });
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
      onImport(importProgress(raw));
      alert('Прогресс импортирован');
    } catch {
      alert('Не удалось прочитать файл');
    }
  };

  const total = allTaskIds().length;
  const done = checked.size;

  return (
    <div className="progress-tools">
      <span className="tools-count" title="Отмечено задач">
        {done}/{total}
      </span>
      <button type="button" className="btn ghost" onClick={handleExport}>
        Экспорт
      </button>
      <button type="button" className="btn ghost" onClick={handleImport}>
        Импорт
      </button>
      <button
        type="button"
        className="btn ghost danger"
        onClick={() => {
          if (window.confirm('Сбросить прогресс к значениям по умолчанию?')) onReset();
        }}
      >
        Сброс
      </button>
    </div>
  );
}
