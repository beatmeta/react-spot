"use client";

import { useMemo, useState } from "react";
import { MetricCard } from "./MetricCard";

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

export function DashboardShell({ generatedAt }: { generatedAt: string }) {
  const [refreshes, setRefreshes] = useState(0);
  const metrics = useMemo(
    () => baseMetrics.map((metric) => ({
      ...metric,
      value: metric.value + refreshes
    })),
    [refreshes]
  );

  return (
    <section className="dashboard">
      <div className="dashboard-header">
        <div>
          <h2>Client dashboard</h2>
          <p>Stateful client island rendered below a server page.</p>
        </div>
        <button className="refresh-button" onClick={() => setRefreshes((count) => count + 1)}>
          Refresh metrics
        </button>
      </div>

      <div className="metric-grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </div>

      <section className="activity">
        <h3>Recent probes</h3>
        <p>Generated at {generatedAt}</p>
        <ul>
          <li>
            <time>00:01</time>
            <span>Client button click reached a stateful component.</span>
          </li>
          <li>
            <time>00:02</time>
            <span>Nested card content resolved through Fiber owner metadata.</span>
          </li>
          <li>
            <time>00:03</time>
            <span>Server-only panel checks the RSC boundary behavior.</span>
          </li>
        </ul>
      </section>
    </section>
  );
}
