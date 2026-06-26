"use client";

import { ActivityList } from "./ActivityList";

export function ActivityPanel({ generatedAt }: { generatedAt: string }) {
  return (
    <section className="activity">
      <h3>Recent probes</h3>
      <p>Generated at {generatedAt}</p>
      <ActivityList />
    </section>
  );
}
