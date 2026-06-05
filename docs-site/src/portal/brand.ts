/** Пути к иконкам в `public/brand/` с учётом Vite `base` (локально и GitHub Pages). */
export const BRAND_ICON_192 = `${import.meta.env.BASE_URL}brand/icon-192.png`;
export const BRAND_ICON_512 = `${import.meta.env.BASE_URL}brand/icon-512.png`;

export function applyBrandCssVars(): void {
  document.documentElement.style.setProperty('--brand-icon-url', `url("${BRAND_ICON_192}")`);
}
