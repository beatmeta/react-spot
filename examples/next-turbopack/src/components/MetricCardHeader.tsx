"use client";

export function MetricCardHeader({
  label,
  detail
}: {
  label: string;
  detail: string;
}) {
  return (
    <div className="metric-card-header">
      <h3>{label}</h3>
      <p>{detail}</p>
    </div>
  );
}
