import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { PortalUrlCopy } from './PortalUrlCopy';
import { REPO_URL } from '../portal/resources';
import { portalShareUrl } from '../portal/site';
import { BrandLogo } from './BrandLogo';

const NAV = [
  { to: '/', label: 'Дашборд', end: true },
  { to: '/concept', label: 'Концепция' },
  { to: '/roadmap', label: 'Roadmap' },
  { to: '/app', label: 'Приложение' },
  { to: '/team', label: 'Команда' },
  { to: '/resources', label: 'Ресурсы' },
  { to: '/later', label: 'Волна 2' },
] as const;

type Props = {
  children: ReactNode;
  tools?: ReactNode;
};

export function Layout({ children, tools }: Props) {
  return (
    <div className="portal">
      <header className="portal-header">
        <div className="portal-header-row">
          <BrandLogo />
          <div className="portal-tools">
            <PortalUrlCopy compact />
            {tools}
          </div>
        </div>
        <nav className="portal-nav" aria-label="Разделы">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              className={({ isActive }) => (isActive ? 'nav-pill active' : 'nav-pill')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="portal-main">{children}</main>
      <footer className="portal-footer">
        <span>Прогресс сохраняется в браузере (localStorage)</span>
        <span className="portal-footer-links">
          <a href={portalShareUrl('/')}>Портал</a>
          <span aria-hidden>·</span>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </span>
      </footer>
    </div>
  );
}
