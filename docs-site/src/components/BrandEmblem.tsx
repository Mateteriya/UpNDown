import { BRAND_ICON_192, BRAND_ICON_512 } from '../portal/brand';

export type BrandEmblemSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';

const PX: Record<BrandEmblemSize, number> = {
  xs: 28,
  sm: 36,
  md: 44,
  lg: 56,
  xl: 72,
  hero: 96,
};

type Props = {
  size?: BrandEmblemSize;
  /** Крупнее на retina — подставляем 512 для lg+ */
  hiDpi?: boolean;
  embossed?: boolean;
  glow?: boolean;
  className?: string;
  title?: string;
};

export function BrandEmblem({
  size = 'md',
  hiDpi = size === 'lg' || size === 'xl' || size === 'hero',
  embossed = true,
  glow = false,
  className = '',
  title = 'Up&Down',
}: Props) {
  const px = PX[size];
  const src = hiDpi ? BRAND_ICON_512 : BRAND_ICON_192;

  return (
    <span
      className={[
        'brand-emblem',
        `brand-emblem--${size}`,
        embossed ? 'brand-emblem--embossed' : '',
        glow ? 'brand-emblem--glow' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role="img"
      aria-label={title}
    >
      <img src={src} alt="" width={px} height={px} decoding="async" draggable={false} />
    </span>
  );
}
