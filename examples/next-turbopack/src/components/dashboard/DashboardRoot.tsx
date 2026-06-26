"use client";

import { useMemo, useState } from "react";
import { ActivityPanel } from "./ActivityPanel";
import { DashboardToolbar } from "./DashboardToolbar";
import { MetricsPanel } from "./MetricsPanel";

const baseMetrics = [
  {
    label: "Hydrated islands",
    value: 4,
    detail: "Client components with nested host nodes",
    tone: "green"
  },
  {
    label: "Route segments",
    value: 2,
    detail: "App route plus local open-in-editor endpoint",
    tone: "blue"
  },
  {
    label: "Metadata paths",
    value: 3,
    detail: "_debugSource, _debugStack, and owner links",
    tone: "gold"
  }
] as const;

export function DashboardRoot({ generatedAt }: { generatedAt: string }) {
  const [refreshes, setRefreshes] = useState(0);
  const metrics = useMemo(
    () =>
      baseMetrics.map((metric) => ({
        ...metric,
        value: metric.value + refreshes
      })),
    [refreshes]
  );

  return (
    <section className="dashboard">
      <DashboardToolbar onRefresh={() => setRefreshes((count) => count + 1)} />
      <MetricsPanel metrics={metrics} />
      <ActivityPanel generatedAt={generatedAt} />
    </section>
  );
}
