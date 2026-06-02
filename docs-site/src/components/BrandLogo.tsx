import { Link } from 'react-router-dom';

type Props = {
  compact?: boolean;
};

export function BrandLogo({ compact }: Props) {
  return (
    <Link to="/" className="brand-link">
      <img src="/brand/icon-192.png" alt="" className="brand-icon" width={compact ? 36 : 44} height={compact ? 36 : 44} />
      <div className="brand-text">
        <strong>Up&Down</strong>
        {!compact && <span>Program Portal</span>}
      </div>
    </Link>
  );
}
