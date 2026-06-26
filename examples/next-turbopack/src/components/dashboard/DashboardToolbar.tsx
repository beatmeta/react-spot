"use client";

import { RefreshButton } from "./RefreshButton";

export function DashboardToolbar({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="dashboard-header">
      <div>
        <h2>Client dashboard</h2>
        <p>Stateful client island nested five levels deep from the page root.</p>
      </div>
      <RefreshButton onClick={onRefresh} />
    </div>
  );
}
