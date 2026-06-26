"use client";

export function MetricCardValue({ value }: { value: number }) {
  return <strong className="metric-value">{value}</strong>;
}
