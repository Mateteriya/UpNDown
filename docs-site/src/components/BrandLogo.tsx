import { Link } from 'react-router-dom';
import { BrandEmblem } from './BrandEmblem';

type Props = {
  compact?: boolean;
};

export function BrandLogo({ compact }: Props) {
  return (
    <Link to="/" className="brand-link">
      <BrandEmblem size={compact ? 'sm' : 'md'} embossed glow />
      <div className="brand-text">
        <strong>Up&Down</strong>
        {!compact && <span>Program Portal</span>}
      </div>
    </Link>
  );
}
