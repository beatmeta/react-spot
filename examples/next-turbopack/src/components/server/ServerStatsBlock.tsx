import { ServerStatsRow } from "./ServerStatsRow";

const stats = [
  { label: "Server depth", value: "4 levels" },
  { label: "Client depth", value: "5 levels" },
  { label: "Mixed boundary", value: "Hero + grid" }
] as const;

export function ServerStatsBlock() {
  return (
    <section className="server-stats">
      <p className="eyebrow">Server stats</p>
      <ul className="server-stats-list">
        {stats.map((stat) => (
          <ServerStatsRow key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </ul>
    </section>
  );
}
