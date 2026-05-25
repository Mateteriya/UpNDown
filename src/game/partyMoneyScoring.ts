/**
 * Демо и будущий финальный подсчёт «фишек» поверх очков раздач.
 * Очки за раздачу — calculateDealPoints; здесь только второй шаг.
 */

export type PartyMoneyVariantId =
  | 'current'
  | 'vs_average'
  | 'weighted_deals'
  | 'accuracy_bonus'
  | 'prize_pool';

export interface DemoDealRow {
  label: string;
  tricksInDeal: number;
  bids: number[];
  takens: number[];
  points: number[];
}

export interface DemoParty {
  players: string[];
  deals: DemoDealRow[];
}

export interface PartyMoneyVariantMeta {
  id: PartyMoneyVariantId;
  shortTitle: string;
  oneLine: string;
  steps: string[];
  note?: string;
  highlight?: 'memory' | 'interesting' | 'favorite' | 'tournament';
  /** Доп. пояснение на демо-странице */
  demoExplain?: string;
}

export interface PlayerMoneyRow {
  name: string;
  rawPoints: number;
  chips: number;
  extra?: string;
}

export interface PartyMoneyResult {
  rows: PlayerMoneyRow[];
  winners: string[];
  middleLine?: string;
  sumCheck?: number;
}

/** Та же мини-партия, что в объяснении (3 раздачи, 4 игрока). */
export const SCORING_DEMO_PARTY: DemoParty = {
  players: ['Аня', 'Боря', 'Вера', 'Гена'],
  deals: [
    {
      label: 'Раздача 1',
      tricksInDeal: 2,
      bids: [2, 3, 1, 2],
      takens: [2, 2, 3, 2],
      points: [20, -10, 3, 20],
    },
    {
      label: 'Раздача 2',
      tricksInDeal: 5,
      bids: [5, 4, 0, 3],
      takens: [5, 4, 0, 1],
      points: [50, 40, 5, -20],
    },
    {
      label: 'Раздача 3',
      tricksInDeal: 4,
      bids: [1, 2, 3, 4],
      takens: [1, 4, 2, 4],
      points: [10, 4, -10, 40],
    },
  ],
};

export const PARTY_MONEY_VARIANTS: PartyMoneyVariantMeta[] = [
  {
    id: 'current',
    shortTitle: 'Как сейчас в игре',
    oneLine: 'Фишки = те же очки. Второго шага нет.',
    steps: [
      'Складываем очки за все раздачи.',
      'Победитель — у кого число больше всех.',
    ],
  },
  {
    id: 'vs_average',
    shortTitle: 'Середина стола',
    oneLine: 'Насколько ты выше или ниже «середины» за столом.',
    steps: [
      'Складываем очки каждого.',
      'Считаем среднее по всем игрокам (середину стола).',
      'Фишки = твоё итого минус середина.',
      'Кто в плюсе — «забрал» у тех, кто в минусе; новых фишек не появляется.',
    ],
    note: 'Часто вспоминают как игру «на деньги» между своими — без отдельного банка.',
    highlight: 'memory',
    demoExplain:
      'Да, вы поняли верно: сумма фишек всех игроков = 0. Это перераспределение, не приз «из воздуха». ' +
      'Пример: Аня +42 и Вера −40 — в сумме ноль; плюс Ани «съедается» минусами других. ' +
      'Деньги тут условные: 1 фишка = 1 рубль, если так договорились за столом.',
  },
  {
    id: 'weighted_deals',
    shortTitle: 'Длинные раздачи важнее',
    oneLine: 'Очки из длинной раздачи влияют на фишки сильнее.',
    steps: [
      'Вес раздачи = сколько карт (1…9).',
      'Сумма: очки × вес по всем раздачам.',
      'Фишки = эта сумма минус среднее по столу.',
    ],
  },
  {
    id: 'accuracy_bonus',
    shortTitle: 'Бонус за угаданный заказ',
    oneLine: '«Середина стола» + подарок за каждую точную раздачу.',
    steps: [
      'Сначала фишки как в «Середина стола».',
      'Плюс +10 фишек за каждую раздачу, где заказ = взял.',
      'Поощряет мастерство, а не только «много очков».',
    ],
    highlight: 'favorite',
    demoExplain:
      'Сумма фишек уже не обязана быть 0: бонус за точность — как маленький «приз сверху» за угадывание. ' +
      'Хорошо для обычной игры: интересно и честно. Не обязательно совпадает с правилами 25 лет назад.',
  },
  {
    id: 'prize_pool',
    shortTitle: 'Общий банк',
    oneLine: 'Взнос с каждого → общий банк → приз по местам.',
    steps: [
      'Каждый вносит одинаковую ставку (в демо: 100).',
      'Места по итоговым очкам за партию.',
      'Банк делят: 1-е 50%, 2-е 30%, 3-е 15%, 4-е 5%.',
      'Фишки = сколько взял из банка минус свой взнос.',
    ],
    note: 'Похоже на «тот самый» денежный итог из памяти.',
    highlight: 'tournament',
    demoExplain:
      'Да: это именно денежный приз — сначала взнос, потом выигрыш из котла. Удобно для онлайн-турниров: ' +
      'виртуальные монеты, входная ставка, призовой фонд, комиссия платформы (если нужна). ' +
      'Сумма «чистых» фишек не ноль: банк 400 раздают по местам, не только перекладывают между игроками.',
  },
];

function rawTotals(party: DemoParty): number[] {
  const n = party.players.length;
  const totals = new Array(n).fill(0);
  for (const d of party.deals) {
    for (let i = 0; i < n; i++) totals[i] += d.points[i] ?? 0;
  }
  return totals;
}

function vsAverageFromValues(values: number[], names: string[]): PartyMoneyResult {
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const chips = values.map((v) => v - avg);
  const rows: PlayerMoneyRow[] = names.map((name, i) => ({
    name,
    rawPoints: values[i],
    chips: Math.round(chips[i] * 10) / 10,
  }));
  const maxChip = Math.max(...chips);
  return {
    rows,
    winners: names.filter((_, i) => chips[i] === maxChip),
    middleLine: `Середина стола: ${Math.round(avg * 10) / 10}`,
    sumCheck: Math.round(chips.reduce((a, b) => a + b, 0) * 10) / 10,
  };
}

function countExactDeals(party: DemoParty, playerIndex: number): number {
  let n = 0;
  for (const d of party.deals) {
    if (d.bids[playerIndex] === d.takens[playerIndex]) n++;
  }
  return n;
}

export function computePartyMoney(
  party: DemoParty,
  variantId: PartyMoneyVariantId,
  opts?: { stake?: number; accuracyBonus?: number }
): PartyMoneyResult {
  const stake = opts?.stake ?? 1;
  const accuracyBonus = opts?.accuracyBonus ?? 10;
  const names = party.players;
  const raw = rawTotals(party);

  if (variantId === 'current') {
    const rows: PlayerMoneyRow[] = names.map((name, i) => ({
      name,
      rawPoints: raw[i],
      chips: raw[i] * stake,
    }));
    const max = Math.max(...raw);
    return { rows, winners: names.filter((_, i) => raw[i] === max) };
  }

  if (variantId === 'vs_average') {
    return vsAverageFromValues(
      raw.map((v) => v * stake),
      names
    );
  }

  if (variantId === 'weighted_deals') {
    const weighted = raw.map(() => 0);
    for (const d of party.deals) {
      const w = d.tricksInDeal;
      for (let i = 0; i < names.length; i++) {
        weighted[i] += (d.points[i] ?? 0) * w;
      }
    }
    return vsAverageFromValues(
      weighted.map((v) => v * stake),
      names
    );
  }

  if (variantId === 'accuracy_bonus') {
    const base = computePartyMoney(party, 'vs_average', { stake });
    const rows: PlayerMoneyRow[] = base.rows.map((row, i) => {
      const exact = countExactDeals(party, i);
      const bonus = exact * accuracyBonus * stake;
      return {
        ...row,
        chips: Math.round((row.chips + bonus) * 10) / 10,
        extra: exact > 0 ? `+${bonus} за ${exact} точн.` : undefined,
      };
    });
    const maxChip = Math.max(...rows.map((r) => r.chips));
    return {
      rows,
      winners: rows.filter((r) => r.chips === maxChip).map((r) => r.name),
      middleLine: base.middleLine,
    };
  }

  if (variantId === 'prize_pool') {
    const buyIn = 100 * stake;
    const pool = buyIn * names.length;
    const shares = [0.5, 0.3, 0.15, 0.05];
    const order = raw
      .map((points, index) => ({ index, points }))
      .sort((a, b) => b.points - a.points);
    const chipsByIndex = new Array(names.length).fill(0);
    order.forEach((entry, rank) => {
      const share = shares[rank] ?? 0;
      chipsByIndex[entry.index] = Math.round((pool * share - buyIn) * 10) / 10;
    });
    const rows: PlayerMoneyRow[] = names.map((name, i) => ({
      name,
      rawPoints: raw[i],
      chips: chipsByIndex[i],
      extra: `взнос ${buyIn}`,
    }));
    const maxChip = Math.max(...chipsByIndex);
    return {
      rows,
      winners: names.filter((_, i) => chipsByIndex[i] === maxChip),
      middleLine: `Банк: ${pool} (по ${buyIn} с человека)`,
    };
  }

  return computePartyMoney(party, 'current', opts);
}
