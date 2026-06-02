/** Базовый URL репозитория (для ссылок из портала в браузере). */
export const REPO_URL = 'https://github.com/Mateteriya/UpNDown';

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');

export function repoFileUrl(repoPath: string): string {
  const clean = repoPath.replace(/^\//, '');
  return `${REPO_URL}/blob/main/${clean}`;
}

/** Маршрут чтения .md внутри портала (работает без GitHub). */
export function docPortalPath(repoPath: string): string {
  const clean = repoPath.replace(/^\//, '');
  return `/doc/${clean.split('/').map(encodeURIComponent).join('/')}`;
}

/** URL статического файла после sync-repo-docs */
export function docAssetUrl(repoPath: string): string {
  const clean = repoPath.replace(/^\//, '');
  const encoded = clean.split('/').map((p) => encodeURIComponent(p)).join('/');
  return `${BASE}repo-docs/${encoded}`;
}

export function isMarkdownPath(path: string): boolean {
  return path.toLowerCase().endsWith('.md');
}

export type LinkKind = 'markdown' | 'external' | 'github-tree';

export function resourceLinkKind(link: ResourceLink): LinkKind {
  if (link.external && !link.path) return 'external';
  if (isMarkdownPath(link.path)) return 'markdown';
  return 'github-tree';
}

export type ResourceAccent = 'cyan' | 'green' | 'gold' | 'violet';

export type ResourceLink = {
  id: string;
  title: string;
  /** Одна строка — зачем открывать */
  why: string;
  path: string;
  /** Открыть на GitHub или внешний URL */
  external?: boolean;
};

export type ResourceCategory = {
  id: string;
  title: string;
  hint: string;
  accent: ResourceAccent;
  links: ResourceLink[];
};

/** Команды — копируются, не ссылки */
export type DevCommand = {
  id: string;
  label: string;
  cmd: string;
  note: string;
};

export const DEV_COMMANDS: DevCommand[] = [
  { id: 'game', label: 'Игра (Vite)', cmd: 'npm run dev', note: 'localhost:5173' },
  { id: 'portal', label: 'Портал', cmd: 'npm run handbook:dev', note: 'localhost:5199' },
  { id: 'test', label: 'Тесты', cmd: 'npm test', note: 'Vitest' },
  { id: 'build', label: 'Сборка PWA', cmd: 'npm run build', note: 'dist/' },
  { id: 'android', label: 'Android', cmd: 'npm run cap:sync', note: 'после build' },
];

export const RESOURCE_CATEGORIES: ResourceCategory[] = [
  {
    id: 'strategy',
    title: 'Стратегия и план',
    hint: 'Что делаем и в каком порядке',
    accent: 'gold',
    links: [
      {
        id: 'roadmap',
        title: 'Roadmap трёх основателей',
        why: 'Кварталы, фазы, приоритеты',
        path: 'docs/ROADMAP-THREE-FOUNDERS.md',
      },
      {
        id: 'workplan',
        title: 'План WS · IAP · CC',
        why: 'Технический бэклог в репо',
        path: 'docs/APP-WORKPLAN-WS-IAP-CC.md',
      },
      {
        id: 'solo',
        title: 'Solo ownership',
        why: 'Флаги, владение, не дублировать',
        path: 'docs/SOLO-OWNERSHIP-CHECKLIST.md',
      },
      {
        id: 'plan-dalee',
        title: 'PLAN-DALEE',
        why: 'Шаги 1–6 после фундамента',
        path: 'docs/PLAN-DALEE.md',
      },
      {
        id: 'tz',
        title: 'TZ.md',
        why: 'Полное ТЗ продукта',
        path: 'TZ.md',
      },
      {
        id: 'agents',
        title: 'AGENTS.md',
        why: 'Правила для AI и разработчиков',
        path: 'AGENTS.md',
      },
    ],
  },
  {
    id: 'online',
    title: 'Онлайн и Supabase',
    hint: 'Сервер, миграции, runbook',
    accent: 'cyan',
    links: [
      {
        id: 'supabase-setup',
        title: 'Настройка Supabase',
        why: 'Пошагово: проект, auth, таблицы',
        path: 'docs/ONLINE-SUPABASE-ПОШАГОВО.md',
      },
      {
        id: 'supabase-doc',
        title: 'SUPABASE-SETUP',
        why: 'OAuth, env, проверки',
        path: 'docs/SUPABASE-SETUP.md',
      },
      {
        id: 'migrations',
        title: 'Папка migrations',
        why: 'Все SQL-миграции',
        path: 'supabase/migrations',
      },
      {
        id: 'runbook',
        title: 'Runbook онлайна',
        why: 'Обслуживание и тикеты',
        path: 'docs/RUNBOOK-ONLINE-MAINTENANCE-TICK.md',
      },
      {
        id: 'online-server',
        title: 'Инструкция сервера',
        why: 'Деплой и WS',
        path: 'docs/ONLINE-SERVER-INSTRUCTIONS.md',
      },
      {
        id: 'local-dev',
        title: 'Локальная разработка',
        why: 'Env и запуск',
        path: 'docs/ЛОКАЛЬНАЯ-РАЗРАБОТКА.md',
      },
    ],
  },
  {
    id: 'code',
    title: 'Код приложения',
    hint: 'Точки входа и флаги',
    accent: 'green',
    links: [
      {
        id: 'flags',
        title: 'productFlags.ts',
        why: 'CASH_ARENA, GEO_RU_CC_ONLY и др.',
        path: 'src/lib/productFlags.ts',
      },
      {
        id: 'online-ctx',
        title: 'OnlineGameContext',
        why: 'Онлайн-стол, комнаты',
        path: 'src/contexts/OnlineGameContext.tsx',
      },
      {
        id: 'lobby',
        title: 'LobbyScreen',
        why: 'Создание комнаты, банк',
        path: 'src/ui/LobbyScreen.tsx',
      },
      {
        id: 'table',
        title: 'GameTable',
        why: 'Стол, UI партии',
        path: 'src/ui/GameTable.tsx',
      },
      {
        id: 'settlement',
        title: 'partySettlement',
        why: 'Расчёт выигрыша',
        path: 'src/game/partySettlement.ts',
      },
      {
        id: 'package',
        title: 'package.json',
        why: 'Скрипты npm',
        path: 'package.json',
      },
    ],
  },
  {
    id: 'legal',
    title: 'Монетизация и право',
    hint: 'CC, партнёрство, волна 5',
    accent: 'violet',
    links: [
      {
        id: 'terms-cc',
        title: 'ToS CC (черновик)',
        why: 'Cosmic Credits, без cash-out',
        path: 'docs/TERMS-CC-DRAFT.md',
      },
      {
        id: 'party-settle',
        title: 'Party settlement',
        why: 'Банк / обычная комната',
        path: 'docs/PARTY-SETTLEMENT-PLAN.md',
      },
      {
        id: 'wave5',
        title: 'Триггеры волны 5',
        why: 'MOU, entity, Cash Arena',
        path: 'docs/PARTNERSHIP-WAVE5-TRIGGERS.md',
      },
      {
        id: 'au-call',
        title: 'Гайд созвона AU',
        why: '10 вопросов, MOU',
        path: 'docs/PARTNERSHIP-AU-CALL-GUIDE.md',
      },
      {
        id: 'mobile-plan',
        title: 'Мобильный план',
        why: 'APK, полировка',
        path: 'docs/MOBILE-AND-APK-PLAN.md',
      },
      {
        id: 'repo',
        title: 'Репозиторий GitHub',
        why: 'Весь проект',
        path: '',
        external: true,
      },
    ],
  },
];
