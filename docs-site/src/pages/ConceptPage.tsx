import { Link } from 'react-router-dom';
import { ResourceHub } from '../components/ResourceHub';
import { NOT_DOING, PRODUCT_LAYERS } from '../portal/data';

export function ConceptPage() {
  return (
    <div className="page">
      <header className="page-hero">
        <p className="eyebrow">Концепция продукта</p>
        <h1>Четыре слоя — одна стратегия</h1>
        <p className="lead">
          Слои 1–3 строим сейчас. Слой 4 — только после юриста и метрик (волна 2).
        </p>
      </header>

      <div className="layer-grid">
        {PRODUCT_LAYERS.map((layer) => (
          <article
            key={layer.id}
            className={`layer-card ${layer.priority === 'now' ? 'now' : 'later'}`}
          >
            <span className="layer-num">L{layer.id}</span>
            <h2>{layer.title}</h2>
            <p>{layer.items}</p>
            <footer>
              <span className="badge">{layer.priority === 'now' ? 'Сейчас' : 'Волна 2'}</span>
              <span className="license">{layer.license}</span>
            </footer>
          </article>
        ))}
      </div>

      <section className="panel">
        <h2>Модель параллельного запуска</h2>
        <div className="flow-diagram">
          <pre>{`Слой 1–2 (игра + IAP)  ──┬── WebSocket (в)
                            ├── Маркетинг (г)
                            └── Грузия офлайн (а) — с юристом

Слой 3 (CC)  ── после IAP foundation
Слой 4 (cash) ── волна 2, whitelist only`}</pre>
        </div>
        <p className="cta-row">
          <Link to="/" className="btn primary">
            ← Дашборд
          </Link>
          <Link to="/roadmap" className="btn">
            Чеклисты Roadmap
          </Link>
        </p>
      </section>

      <section className="panel panel--resources">
        <p className="panel-intro">
          Полный каталог документов — на вкладке{' '}
          <Link to="/resources">Ресурсы</Link> (чтение .md в портале).
        </p>
        <ResourceHub variant="compact" />
      </section>

      <section className="panel panel-warn">
        <h2>Сознательно не делаем</h2>
        <ul className="bullet-list">
          {NOT_DOING.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
