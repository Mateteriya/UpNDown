import type { ReactNode } from 'react';
import { BrandEmblem, type BrandEmblemSize } from './BrandEmblem';

type Props = {
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  aside?: ReactNode;
  neon?: boolean;
  emblemSize?: BrandEmblemSize;
  className?: string;
  children?: ReactNode;
};

export function PageHero({
  eyebrow,
  title,
  lead,
  aside,
  neon = false,
  emblemSize = 'lg',
  className = '',
  children,
}: Props) {
  const split = Boolean(aside);

  return (
    <header
      className={[
        'page-hero',
        'page-hero--branded',
        split ? 'split' : '',
        neon ? 'page-hero--neon' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="page-hero-main">
        <BrandEmblem size={emblemSize} embossed glow={neon} />
        <div className="page-hero-copy">
          <p className={`eyebrow ${neon ? 'eyebrow--neon' : ''}`}>{eyebrow}</p>
          <h1>{title}</h1>
          {lead != null && <p className="lead">{lead}</p>}
          {children}
        </div>
      </div>
      {aside}
    </header>
  );
}
