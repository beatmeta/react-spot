import { ProbeHintItem } from "./ProbeHintItem";
import { ProbeHintList } from "./ProbeHintList";

export function SidebarColumn() {
  return (
    <aside className="sidebar-column">
      <section className="probe-hints">
        <p className="eyebrow">Probe targets</p>
        <h2>What to click</h2>
        <ProbeHintList />
      </section>
      <ProbeHintItem
        title="Deepest client leaf"
        detail="MetricCardValue strong tag inside MetricRow wrapper."
        tone="client"
      />
    </aside>
  );
}
