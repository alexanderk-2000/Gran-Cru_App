import { Link } from 'react-router-dom';

export const SegmentLinkCard = ({
  to,
  label,
  value,
  tone,
  share
}: {
  to: string;
  label: string;
  value: string;
  tone: string;
  share: string;
}) => (
  <Link to={to} className="rounded-2xl border border-stone-200 bg-alabaster/40 p-3 transition-colors hover:bg-alabaster">
    <p className="text-xs text-stone-500">{label}</p>
    <p className={`mt-0.5 font-serif text-2xl ${tone}`}>{value}</p>
    <p className="mt-1 text-xs text-stone-500">{share}</p>
  </Link>
);
