import type { Direction, ProductLayer, QuarterPlan, RoleRow, Milestone } from './types';

export { TASK_GROUPS } from './tasks';
export {
  allTaskIds,
  defaultCheckedIds,
  progressForGroupIds,
  progressStats,
  tasksFromGroups,
  PHASE1_GROUP_IDS,
  PHASE2_GROUP_IDS,
  QUARTER_GROUPS,
} from './progress';

/** Общая концепция — четыре слоя продукта */
export const PRODUCT_LAYERS: ProductLayer[] = [
  {
    id: 1,
    title: 'Игра',
    items: 'skill, рейтинг, друзья, онлайн',
    license: 'не нужна',
    priority: 'now',
  },
  {
    id: 2,
    title: 'Продажи в приложении',
    items: 'косметика, ИИ, 3 игрока, подписка',
    license: 'не нужна (IAP)',
    priority: 'now',
  },
  {
    id: 3,
    title: 'Cosmic Credits',
    items: 'виртуальная валюта, турниры, без cash-out',
    license: 'не нужна при корректных ToS',
    priority: 'now',
  },
  {
    id: 4,
    title: 'Real money (Cash Arena)',
    items: 'KYC, whitelist стран',
    license: 'да, точечно',
    priority: 'later',
  },
];

export const CONCEPT_TAGLINE =
  'Честная skill-игра: глобальный social и IAP сейчас; деньги за столом — только там, где это уже легально и просто (пилот в Грузии).';

export const NOT_DOING: string[] = [
  'Массовый online real-money без KYC и whitelist',
  'Cash-out CC в фиат или крипту',
  'Казино-позиционирование и смешение CC с живыми деньгами в одном UI',
  'Ставка только на один канал (только офлайн или только онлайн)',
  'Gambling-entity до работающего social и хотя бы одного канала монетизации',
];

export const DIRECTIONS: Direction[] = [
  {
    id: 'offline-ge',
    code: 'а',
    title: 'Офлайн-якорь (Грузия)',
    summary: 'Клуб / оператор с лицензией, живые вечера',
    owner: 'Владелец продукта',
    coOwners: 'Международный партнёр, юрист',
    phase: 1,
    groupIds: ['offline-ge'],
    link: '/roadmap#offline-ge',
  },
  {
    id: 'monetization',
    code: 'б',
    title: 'Продажный слой',
    summary: 'IAP + CC — легальный доход без gambling-лицензии',
    owner: 'Владелец продукта',
    coOwners: 'Технический директор',
    phase: 1,
    groupIds: ['iap-infra', 'iap-shop', 'iap-features', 'cc-core', 'cc-tournaments'],
    link: '/app/iap',
  },
  {
    id: 'ws',
    code: 'в',
    title: 'Игровой сервер (WebSocket)',
    summary: 'Авторитетная партия; Supabase — auth, архив',
    owner: 'Технический директор',
    coOwners: 'Владелец продукта',
    phase: 1,
    groupIds: ['ws-server', 'ws-client', 'ws-migrate'],
    link: '/app/ws',
  },
  {
    id: 'marketing',
    code: 'г',
    title: 'Маркетинг',
    summary: 'Офлайн + онлайн параллельно с продуктом',
    owner: 'Владелец продукта',
    coOwners: 'Международный партнёр, техдиректор',
    phase: 1,
    groupIds: ['marketing'],
    link: '/roadmap#marketing',
  },
  {
    id: 'platform',
    code: '⊕',
    title: 'Платформа и качество',
    summary: 'Мобильная полировка, онлайн до WS, beta-gate',
    owner: 'Все',
    phase: 1,
    groupIds: ['done-foundation', 'mobile-polish', 'online-now', 'beta-release'],
    link: '/app',
  },
  {
    id: 'entity',
    code: '2a',
    title: 'Юрисдикция online-денег',
    summary: 'Entity + PSP + KYC — после метрик',
    owner: 'Международный партнёр',
    phase: 2,
    groupIds: ['phase2-entity'],
    link: '/later',
  },
  {
    id: 'licenses',
    code: '2b',
    title: 'Лицензии online-cash',
    summary: 'Только Cash Arena в whitelist',
    owner: 'Lawyer + entity',
    phase: 2,
    groupIds: ['phase2-license'],
    link: '/later',
  },
];

export const ROLES: RoleRow[] = [
  {
    role: 'Владелец продукта',
    zone: 'Видение, UX, дизайн, roadmap, бренд, Грузия (пилот), go/no-go',
  },
  {
    role: 'Технический директор',
    zone: 'WS-сервер, VPS, deploy, стабильность онлайна, интеграции app ↔ инфра',
  },
  {
    role: 'Партнёр по международному развитию',
    zone: 'Entity (волна 5+), compliance, EN-рынок, PSP; не подменяет продукт',
  },
];

export const QUARTERS: QuarterPlan[] = [
  {
    id: 'q2-2026',
    label: 'Q2 2026',
    theme: 'Фундамент + старт параллельных треков',
    progressKey: 'q2',
    rows: [
      { who: 'Продукт', focus: 'Мобильная полировка, зал, маркетинг, brief Грузия' },
      { who: 'Техдиректор', focus: 'WS прототип, egress, VPS' },
      { who: 'Межд. партнёр', focus: 'Итог созвона, MOU' },
    ],
  },
  {
    id: 'q3-2026',
    label: 'Q3 2026',
    theme: 'WS в проде + IAP + пилот Грузия',
    progressKey: 'q3',
    rows: [
      { who: 'Продукт', focus: 'Магазин, CC UI, бета 10+ игроков' },
      { who: 'Техдиректор', focus: 'wss:// prod, мониторинг' },
      { who: 'Все', focus: 'Офлайн-пилот 1–2 вечера' },
    ],
  },
  {
    id: 'q4-2026',
    label: 'Q4 2026',
    theme: 'Масштаб CC + решение по волне 5',
    progressKey: 'q4',
    rows: [
      { who: 'Продукт', focus: 'Турниры CC, ASO, повторяемый офлайн' },
      { who: 'Техдиректор', focus: '20–40 комнат, алерты' },
      { who: 'Межд. партнёр', focus: 'Entity / PSP при триггерах' },
    ],
  },
];

export const MILESTONES: Milestone[] = [
  { id: 'm-ws-local', quarter: 'Q2', title: 'WS локально: 2 клиента играют партию', groupIds: ['ws-server', 'ws-client'] },
  { id: 'm-ws-prod', quarter: 'Q3', title: 'wss:// в проде, beta без poll', groupIds: ['ws-migrate', 'beta-release'] },
  { id: 'm-iap', quarter: 'Q3', title: 'Первая покупка в sandbox', groupIds: ['iap-infra', 'iap-shop'] },
  { id: 'm-cc', quarter: 'Q4', title: 'CC hold/settle на staging', groupIds: ['cc-core'] },
  { id: 'm-ge', quarter: 'Q3', title: 'Пилот Грузия проведён', groupIds: ['offline-ge'] },
];

export const APP_TABS = [
  { id: 'overview', label: 'Обзор', path: '/app' },
  { id: 'ws', label: 'WebSocket', path: '/app/ws' },
  { id: 'iap', label: 'IAP', path: '/app/iap' },
  { id: 'cc', label: 'CC', path: '/app/cc' },
] as const;

export type AppTabId = (typeof APP_TABS)[number]['id'];

export const APP_TRACKS: Record<string, string[]> = {
  overview: ['done-foundation', 'mobile-polish', 'online-now', 'beta-release'],
  ws: ['ws-server', 'ws-client', 'ws-migrate'],
  iap: ['iap-infra', 'iap-shop', 'iap-features'],
  cc: ['cc-core', 'cc-tournaments'],
};
