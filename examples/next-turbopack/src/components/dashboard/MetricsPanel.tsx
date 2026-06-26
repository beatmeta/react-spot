"use client";

import { MetricRow } from "./MetricRow";

type Metric = {
  label: string;
  value: number;
  detail: string;
  tone: "green" | "blue" | "gold";
};

export function MetricsPanel({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="metric-grid">
      {metrics.map((metric) => (
        <MetricRow key={metric.label} metric={metric} />
      ))}
    </div>
  );
}
