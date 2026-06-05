import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { PortalUrlCopy } from './PortalUrlCopy';
import { REPO_URL } from '../portal/resources';
import { portalShareUrl } from '../portal/site';
import { BrandEmblem } from './BrandEmblem';
import { BrandLogo } from './BrandLogo';

import { PortalAuthBar } from './PortalAuthBar';

const NAV = [
  { to: '/', label: 'Дашборд', end: true },
  { to: '/work', label: 'Работа' },
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
  syncBanner?: ReactNode;
};

export function Layout({ children, tools, syncBanner }: Props) {
  return (
    <div className="portal">
      <header className="portal-header">
        <div className="portal-header-row">
          <BrandLogo />
          <div className="portal-tools">
            <PortalAuthBar />
            <PortalUrlCopy compact />
            {tools}
          </div>
        </div>
        {syncBanner}
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
        <div className="portal-footer-brand">
          <BrandEmblem size="xs" embossed />
          <span>Up&Down · Program Portal</span>
        </div>
        <span>Прогресс: localStorage + Supabase после входа</span>
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
