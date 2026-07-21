import { getDealType, type PlayerCount } from '../game/GameEngine';

export type MobileDealContractBadgeFace = 'orders' | 'mode' | 'cards';

/** Что показывать на моб. кнопке «КАРТ / контракт» (не plasma-бейдж). */
export function resolveMobileDealContractBadgeFace(opts: {
  dealNumber: number;
  phase: string;
  allBidsPlaced: boolean;
  alternateFace: number;
  playerCount?: PlayerCount;
}): MobileDealContractBadgeFace {
  const dealType = getDealType(opts.dealNumber, opts.playerCount ?? 4);
  const isSpecial = dealType === 'no-trump' || dealType === 'dark';
  const isPlaying = opts.phase === 'playing';

  if (opts.allBidsPlaced && (!isSpecial || isPlaying || opts.alternateFace !== 0)) {
    return 'orders';
  }
  if (isSpecial && !isPlaying && opts.alternateFace === 0) {
    return 'mode';
  }
  return 'cards';
}

/** title / aria-label для мета-строки plasma-бейджа — как у .game-mobile-deal-contract-screen */
export function getMobileDealContractMetaTooltip(opts: {
  dealNumber: number;
  tricksInDeal: number;
  totalOrders: number;
  totalTricks: number;
  allBidsPlaced: boolean;
  playerCount?: PlayerCount;
}): { title: string; ariaLabel: string } {
  const dealType = getDealType(opts.dealNumber, opts.playerCount ?? 4);
  const isSpecial = dealType === 'no-trump' || dealType === 'dark';
  const modeLabel = dealType === 'no-trump' ? 'Бескозырка' : 'Тёмная';

  if (opts.allBidsPlaced) {
    const title = isSpecial
      ? `Режим: ${modeLabel}. Заказ: ${opts.totalOrders}; Взяток: ${opts.totalTricks}/${opts.tricksInDeal}. Нажмите — подробности`
      : `Заказ: ${opts.totalOrders}; Взяток: ${opts.totalTricks}/${opts.tricksInDeal}. Нажмите — подробности по игрокам`;
    const ariaLabel = isSpecial
      ? `Режим ${modeLabel.toLowerCase()}. Заказ ${opts.totalOrders}, взяток ${opts.totalTricks} из ${opts.tricksInDeal}. Показать по игрокам`
      : `Заказ ${opts.totalOrders}, взяток ${opts.totalTricks} из ${opts.tricksInDeal}. Показать по игрокам`;
    return { title, ariaLabel };
  }

  const title = isSpecial
    ? `Режим: ${modeLabel}. КАРТ: ${opts.tricksInDeal} у каждого. Нажмите — подробности`
    : 'Сколько карт в раздаче';
  const ariaLabel = isSpecial
    ? `Режим ${modeLabel.toLowerCase()}. КАРТ: ${opts.tricksInDeal} у каждого. Показать по игрокам`
    : `КАРТ: ${opts.tricksInDeal} у каждого`;
  return { title, ariaLabel };
}
