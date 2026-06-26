"use client";

import { MetricCard } from "../MetricCard";

type Metric = {
  label: string;
  value: number;
  detail: string;
  tone: "green" | "blue" | "gold";
};

export function MetricRow({ metric }: { metric: Metric }) {
  return (
    <div className="metric-row">
      <MetricCard metric={metric} />
    </div>
  );
}
