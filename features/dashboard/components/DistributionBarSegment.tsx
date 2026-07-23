import { Link } from 'react-router-dom';

export const DistributionBarSegment = ({
  to,
  colorClass,
  width
}: {
  to: string;
  colorClass: string;
  width: string;
}) => <Link to={to} className={`${colorClass} transition-opacity hover:opacity-80`} style={{ width }} />;
