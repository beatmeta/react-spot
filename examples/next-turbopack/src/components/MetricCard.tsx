"use client";

import { MetricCardHeader } from "./MetricCardHeader";
import { MetricCardValue } from "./MetricCardValue";

type Metric = {
  label: string;
  value: number;
  detail: string;
  tone: "green" | "blue" | "gold";
};

export function MetricCard({ metric }: { metric: Metric }) {
  return (
    <article className="metric-card" data-tone={metric.tone}>
      <MetricCardHeader label={metric.label} detail={metric.detail} />
      <MetricCardValue value={metric.value} />
    </article>
  );
}
