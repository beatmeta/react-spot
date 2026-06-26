export function ServerStatsRow({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <li className="server-stats-row">
      <span className="server-stats-label">{label}</span>
      <span className="server-stats-value">{value}</span>
    </li>
  );
}
