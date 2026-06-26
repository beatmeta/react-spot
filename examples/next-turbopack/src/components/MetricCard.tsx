"use client";

type Metric = {
  label: string;
  value: number;
  detail: string;
  tone: "green" | "blue" | "gold";
};

export function MetricCard({ metric }: { metric: Metric }) {
  return (
    <article className="metric-card" data-tone={metric.tone}>
      <div>
        <h3>{metric.label}</h3>
        <p>{metric.detail}</p>
      </div>
      <strong className="metric-value">{metric.value}</strong>
    </article>
  );
}
