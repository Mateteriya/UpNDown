import { TableShell } from '../components/TableShell';
import { ROLES } from '../portal/data';

export function TeamPage() {
  return (
    <div className="page">
      <header className="page-hero">
        <p className="eyebrow eyebrow--neon">Команда</p>
        <h1>Роли троих</h1>
        <p className="lead">Кто за что отвечает — без дублирования зон</p>
      </header>

      <section className="panel">
        <TableShell caption="Матрица ролей" hint="Одна зона — один ответственный">
          <table className="data-table roles-table">
            <thead>
              <tr>
                <th scope="col">Роль</th>
                <th scope="col">Зона ответственности</th>
              </tr>
            </thead>
            <tbody>
              {ROLES.map((r) => (
                <tr key={r.role}>
                  <th scope="row">{r.role}</th>
                  <td>{r.zone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      </section>

      <section className="panel">
        <h2>Связка направлений</h2>
        <div className="flow-diagram">
          <pre>{`┌─────────────────────────────────────────────┐
│  Весь мир: приложение (слои 1–3)            │
│  игра · IAP · CC · рейтинг                  │
└─────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐   ┌──────────────────────┐
│ Грузия (а)      │   │ Техдиректор (в)      │
│ офлайн +        │   │ WS, VPS, интеграции  │
│ лиценз. площадка│   └──────────────────────┘
└─────────────────┘
         │
         ▼ (позже, волна 2)
┌─────────────────────────────────────────────┐
│ Межд. партнёр: entity, PSP, Cash Arena      │
└─────────────────────────────────────────────┘`}</pre>
        </div>
      </section>
    </div>
  );
}
