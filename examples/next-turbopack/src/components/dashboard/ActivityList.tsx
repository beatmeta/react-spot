"use client";

import { ActivityListItem } from "./ActivityListItem";

const probes = [
  { time: "00:01", message: "Refresh button resolved to a leaf client component." },
  { time: "00:02", message: "Metric value span owned by MetricCardValue, not the row wrapper." },
  { time: "00:03", message: "Server stats row checks RSC-only ownership." }
] as const;

export function ActivityList() {
  return (
    <ul>
      {probes.map((probe) => (
        <ActivityListItem key={probe.time} time={probe.time} message={probe.message} />
      ))}
    </ul>
  );
}
